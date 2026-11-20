"""Gli strumenti sulle uscite (COACH_RIDE_TOOLS=on): lo storico del carico delle ultime 8 settimane e degli
ultimi 14 giorni, con un codice per ogni uscita in bici, offerto al modello in ogni bozza con tutti e due i
modi di ricerca; al massimo 4 richieste per bozza, contate a parte dalle ricerche dei paper."""

import asyncio
import dataclasses
from zoneinfo import ZoneInfo

import pytest

from app import graph, prompts, provider, ride_tools, workout
from app.chat import ToolCall
from app.jscompat import instant_ms
from app.metrics import Profile
from app.strava import RideData, StravaRides
from fakes import FakeOllama, FakeSearch, asks
from test_graph import chat_bodies
from test_model_search import VECTOR, answer, tool_answers
from test_workout import CASE, run_case

ROME = ZoneInfo("Europe/Rome")
# Giovedì 19 novembre 2026, sera: la settimana in corso ha 4 giorni.
NOW = instant_ms("2026-11-19T20:00:00Z")
PROFILE = Profile(ftp=250, lthr=165)


def act(id: int, when: str, kind: str = "Ride", minutes: int = 60, **extra) -> dict:
    return {"id": id, "type": kind, "start_date_local": when, "moving_time": minutes * 60, "distance": 30000,
            "average_heartrate": 140, "has_heartrate": True, "total_elevation_gain": 0, **extra}


ACTS = [act(1, "2026-11-19T09:00:00Z", minutes=90), act(2, "2026-11-19T18:00:00Z", "Run", 40),
        act(3, "2026-11-18T10:00:00Z"), act(4, "2026-11-05T10:00:00Z", minutes=120),
        act(5, "2026-10-08T10:00:00Z", "VirtualRide")]


def history() -> ride_tools.RideHistory:
    return ride_tools.ride_history(ACTS, {}, {}, PROFILE, NOW, ROME)


def test_the_history_has_eight_monday_weeks_the_last_one_partial():
    weeks = history().weeks
    assert len(weeks) == 8
    assert [w["lunedi"].weekday() for w in weeks] == [0] * 8
    assert str(weeks[-1]["lunedi"]) == "2026-11-16" and weeks[-1]["giorni"] == 4
    assert [w["giorni"] for w in weeks[:-1]] == [7] * 7
    # La settimana in corso: due uscite in bici e una corsa, 3 ore e 10 minuti.
    assert (weeks[-1]["uscite"], round(weeks[-1]["ore"], 2)) == (2, round(190 / 60, 2))


def test_weeks_before_the_first_ride_have_zero_hours_and_rides():
    first = history().weeks[0]
    assert str(first["lunedi"]) == "2026-09-28"
    assert (first["ore"], first["uscite"], first["carico"]) == (0, 0, 0)


def test_the_ctl_at_week_end_grows_with_the_load():
    weeks = history().weeks
    assert weeks[-1]["ctl"] > weeks[-3]["ctl"] > 0


def test_the_14_days_list_rides_newest_first_with_codes_and_other_sports_without():
    days = history().days
    assert len(days) == 14 and str(days[0]["data"]) == "2026-11-19"
    today = days[0]["attivita"]
    assert [(i["tipo"], i.get("codice")) for i in today] == [("Run", None), ("Ride", "r1")]
    assert days[1]["attivita"][0]["codice"] == "r2"
    assert days[2]["attivita"] == []
    # Il 5 novembre è 14 giorni fa: fuori dai giorni, dentro le settimane.
    assert all(str(d["data"]) != "2026-11-05" for d in days)


def test_the_history_text_shows_no_strava_id_nor_ride_name_and_stays_short():
    acts = [{**a, "name": "Giro segreto"} for a in ACTS]
    text = ride_tools.history_text(ride_tools.ride_history(acts, {}, {}, PROFILE, NOW, ROME))
    assert "Giro segreto" not in text and "id" not in text.split()
    assert "- gio 19/11: Run 40' carico" in text and "· r1 Ride 90' carico" in text
    assert "- mar 17/11: nessuna attività" in text
    assert "sett. dal 16/11 (in corso, 4 giorni)" in text
    assert len(text) < 2000


def test_a_busy_fortnight_still_fits_in_2000_characters():
    busy = [act(100 + i, f"2026-11-{19 - i // 3:02d}T{8 + i % 3 * 4:02d}:00:00Z", ("Ride", "Run", "Walk")[i % 3])
            for i in range(14 * 3 - 6)]
    assert len(ride_tools.history_text(ride_tools.ride_history(busy, {}, {}, PROFILE, NOW, ROME))) < 2000


# ---- Impostazione e bozza ----

def test_the_setting_is_off_when_missing_and_refuses_unknown_values(monkeypatch):
    monkeypatch.delenv("COACH_RIDE_TOOLS", raising=False)
    assert provider.settings().ride_tools == "off"
    monkeypatch.setenv("COACH_RIDE_TOOLS", "ON")
    assert provider.settings().ride_tools == "on"
    monkeypatch.setenv("COACH_RIDE_TOOLS", "sempre")
    with pytest.raises(Exception, match='COACH_RIDE_TOOLS in .env vale "sempre": i valori ammessi sono off e on'):
        provider.settings()


def test_with_the_tools_off_the_prompt_and_its_version_are_today_s():
    system = prompts.system_prompt([prompts.VERSION_SAMPLE], prompts.VERSION_CONTEXT, 60)
    assert "STRUMENTI SULLE USCITE" not in system
    assert prompts.prompt_version("fixed", "off", "off") == prompts.prompt_version()
    assert prompts.prompt_version(ride_tools="on") != prompts.prompt_version()
    assert prompts.prompt_version("model", ride_tools="on") != prompts.prompt_version("model")
    assert prompts.offered_tools("fixed", "off") is None


def tools_on(fake: FakeOllama, search_mode: str = "fixed") -> FakeOllama:
    fake.chat = dataclasses.replace(fake.chat, ride_tools="on", search_mode=search_mode)
    return fake


def run(fake: FakeOllama) -> list:
    return asyncio.run(run_case(CASE["allowed-answer"], fake, FakeSearch(VECTOR)))


def history_ask() -> dict:
    return asks(name="load_history", arguments={})


def test_with_the_fixed_search_the_model_gets_the_load_history_tool_and_its_answer():
    fake = tools_on(FakeOllama([history_ask(), CASE["allowed-answer"]["answer"]]))
    events = run(fake)
    first, second = chat_bodies(fake)
    assert [t["function"]["name"] for t in first["tools"]] == ["load_history", "ride_shape"]
    assert "STRUMENTI SULLE USCITE" in first["messages"][0]["content"]
    (given,) = tool_answers(second)
    assert given.startswith("STORICO DEL CARICO") and "ULTIMI 14 GIORNI" in given
    steps = [e for e in events if e.get("step") == "rideTool"]
    assert [(s["call"], s["of"]) for s in steps] == [(1, 4)]
    assert events[-1]["fellBack"] is False


def test_with_the_model_search_both_kinds_of_tools_are_offered():
    fake = tools_on(FakeOllama([answer()]), "model")
    run(fake)
    (body,) = chat_bodies(fake)
    assert [t["function"]["name"] for t in body["tools"]] == ["search_papers", "load_history", "ride_shape"]


def test_the_fifth_ride_call_is_refused_and_the_paper_searches_stay_available():
    fake = tools_on(FakeOllama([asks(name="load_history", arguments={}), history_ask(), history_ask(),
                                history_ask(), history_ask(), asks("recovery"), answer()]), "model")
    run(fake)
    answers = tool_answers(chat_bodies(fake)[-1])
    assert answers[4] == prompts.RIDE_LIMIT
    assert answers[5].startswith("[PMID:")


UNKNOWN = "Strumento sconosciuto: gli strumenti sono load_history, ride_shape."


def test_an_unknown_tool_names_the_offered_ones_and_counts_as_a_ride_call():
    fake = tools_on(FakeOllama([asks(name="open_strava", arguments={}), CASE["allowed-answer"]["answer"]]))
    run(fake)
    assert tool_answers(chat_bodies(fake)[-1]) == [UNKNOWN]


def test_a_paper_search_asked_in_fixed_mode_is_not_a_search():
    fake = tools_on(FakeOllama([asks("recovery"), CASE["allowed-answer"]["answer"]]))
    finder = FakeSearch(VECTOR)
    asyncio.run(run_case(CASE["allowed-answer"], fake, finder))
    # Solo la ricerca fissa prima della bozza.
    assert "recovery" not in finder.texts and len(finder.texts) == 1
    assert tool_answers(chat_bodies(fake)[-1]) == [UNKNOWN]


def test_four_refused_ride_calls_end_the_draft_without_an_answer():
    four = {"calls": [{"name": "load_history", "arguments": {}}] * 4}
    two = {"calls": [{"name": "load_history", "arguments": {}}] * 2}
    fake = tools_on(FakeOllama([four, two, two, CASE["allowed-answer"]["answer"]]))
    result = run(fake)[-1]
    assert result["drafts"][0]["check"]["causes"] == ["unreadable"]


def test_an_ollama_model_without_tools_names_the_ride_tools_setting():
    fake = tools_on(FakeOllama(CASE["allowed-answer"]["answer"]))
    fake.status, fake.error = 400, "registry.ollama.ai/library/gemma:2b does not support tools"
    with pytest.raises(Exception, match="COACH_RIDE_TOOLS=off"):
        run(fake)


# ---- Forma di un'uscita ----

# Un'uscita di ieri con potenza misurata: 15 minuti facili, 10 in Z4, 15 facili.
SHAPED = act(3, "2026-11-18T10:00:00Z", device_watts=True, weighted_average_watts=200, name="Giro segreto")
SERIES = {3: {"step": 15, "watts": [150] * 60 + [235] * 40 + [150] * 60, "hr": [130] * 60 + [160] * 40 + [130] * 60}}


def shape_of(code, acts=None, series=None, profile=PROFILE) -> str:
    history = ride_tools.ride_history(acts or [ACTS[0], SHAPED], {}, SERIES if series is None else series,
                                      profile, NOW, ROME)
    return ride_tools.answer(ToolCall("", "ride_shape", {"code": code}), history)


def test_a_valid_code_gives_the_hard_blocks_minutes_per_zone_and_load_per_hour():
    text = shape_of("r2")
    assert text.startswith("r2: Ride del 18/11, 60', carico")
    assert "blocchi duri 10min Z4" in text and "minuti per zona" in text and "carico per ora" in text
    assert "Giro segreto" not in text and "3" not in text.split() and len(text) < 2000


def test_the_code_can_come_as_json_text_and_in_capitals():
    history = ride_tools.ride_history([ACTS[0], SHAPED], {}, SERIES, PROFILE, NOW, ROME)
    assert ride_tools.answer(ToolCall("", "ride_shape", '{"code": " R2 "}'), history) == shape_of("r2")


@pytest.mark.parametrize("code", ["r3", "r0", "x", "", None, 5])
def test_unknown_malformed_or_missing_codes_get_the_refusal_naming_the_14_days(code):
    assert shape_of(code) == prompts.RIDE_BAD_CODE
    assert "14 giorni" in prompts.RIDE_BAD_CODE


def test_a_ride_15_days_ago_has_no_code():
    old = act(9, "2026-11-04T10:00:00Z", device_watts=True)
    history = ride_tools.ride_history([old], {}, {9: SERIES[3]}, PROFILE, NOW, ROME)
    assert history.rides == {}
    assert ride_tools.answer(ToolCall("", "ride_shape", {"code": "r1"}), history) == prompts.RIDE_BAD_CODE


def test_a_ride_without_saved_series_gives_its_averages_and_says_why():
    text = shape_of("r2", series={})
    assert "Forma non ancora disponibile" in text and "potenza media 200W, FC media 140" in text


def test_a_ride_without_power_or_heart_rate_has_no_shape():
    blank = {3: {"step": 15, "watts": [None] * 10, "hr": [None] * 10}}
    assert "Nessuna forma: l'uscita non ha né potenza misurata né battito" in shape_of("r2", series=blank)
    assert "senza FTP né soglia cardiaca" in shape_of("r2", profile=Profile())


def test_missing_ftp_or_lthr_is_said():
    assert "(senza FTP, zone solo dal battito)" in shape_of("r2", profile=Profile(lthr=165))
    no_lthr = shape_of("r2", profile=Profile(ftp=250))
    assert "senza soglia cardiaca, zone solo dalla potenza e niente carico per ora" in no_lthr


def test_ride_shape_calls_share_the_four_calls_with_the_load_history():
    shape = asks(name="ride_shape", arguments={"code": "r1"})
    fake = tools_on(FakeOllama([history_ask(), shape, shape, shape, shape, CASE["allowed-answer"]["answer"]]))
    events = run(fake)
    answers = tool_answers(chat_bodies(fake)[-1])
    assert answers[-1] == prompts.RIDE_LIMIT
    assert all(a.startswith("r1: ") for a in answers[1:4])
    assert [e["call"] for e in events if e.get("step") == "rideTool"] == [1, 2, 3, 4]


def test_the_coach_screen_reads_the_saved_series_of_the_14_days_rides(activity_store):
    store = activity_store
    asyncio.run(store.save_activities(store.generation, [{**SHAPED, "start_date": SHAPED["start_date_local"]}]))
    asyncio.run(store.save_details(store.generation, SHAPED["id"], {"np": 200, "watts_n": 2400, "hr_mean": 140,
                                                                   "hr_n": 2400}, SERIES[3]))
    req = workout.parse_request({"duration": 60, "timeZone": "Europe/Rome", "profile": {"ftp": 250, "lthr": 165}})
    r = graph.Request(lambda e: None, None, None, None, None, None, req=req, rides=StravaRides(store, None),
                      now_ms=NOW)
    state = {"rides": RideData([SHAPED], {}, NOW, False, 0)}
    history = asyncio.run(graph.ride_history(state, r))
    assert "blocchi duri 10min Z4" in history.rides["r1"]


def test_a_draft_without_ride_calls_does_not_read_the_history(monkeypatch):
    async def never(state, r):
        raise AssertionError("storico letto senza richieste")
    monkeypatch.setattr(graph, "ride_history", never)
    events = run(tools_on(FakeOllama([CASE["allowed-answer"]["answer"]])))
    assert events[-1]["fellBack"] is False
