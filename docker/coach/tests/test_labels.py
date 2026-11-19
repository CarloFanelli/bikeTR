"""Le etichette delle corse recenti: COACH_RIDE_LABELS sceglie off (il prompt resta com'era), rule (la
regola di app/labels.py) o model. Ogni corsa del prompt prende recupero, fondo, ripetute o gara, il
risultato e la traccia dicono da dove viene, e le situazioni del set di valutazione hanno le cifre che
la regola legge."""

import asyncio
import dataclasses
import json

import pytest

from app import grading, graph, labels, main, prompts, provider, tracing
from app.errors import CoachError
from app.metrics import recent_rides
from fakes import FakeOllama, FakeRides, FakeSearch, fixture_index
from fixture_data import DETAILS, NOW_MS, RIDES
from test_graph import CASE_OK, chat_bodies
from test_workout import run_case

FTP, LTHR = 250, 160


def ride(**fields) -> dict:
    return {"data": "2026-11-01", "tipo": "Ride", "durataMin": 90, "distanzaKm": 40, "avgWatts": None,
            "avgHr": None, "gara": False, "np": None, **fields}


def settings(monkeypatch, value: str | None) -> provider.ChatSettings:
    monkeypatch.setenv("LABEL_MODEL", "qwen2.5:3b")
    if value is not None:
        monkeypatch.setenv("COACH_RIDE_LABELS", value)
    return provider.settings()


@pytest.mark.parametrize("value, expected", [(None, "off"), ("", "off"), ("Off ", "off"), ("rule", "rule"),
                                             (" Model ", "model")])
def test_the_setting_ignores_case_and_spaces_and_is_off_when_missing(monkeypatch, value, expected):
    assert settings(monkeypatch, value).ride_labels == expected


def test_an_unknown_setting_fails_naming_it_and_its_three_values(monkeypatch):
    with pytest.raises(CoachError) as e:
        settings(monkeypatch, "sempre")
    assert (e.value.status, e.value.code) == (500, "invalid_settings")
    assert e.value.message == 'COACH_RIDE_LABELS in .env vale "sempre": i valori ammessi sono off, rule e model'


@pytest.mark.parametrize("fields, expected", [
    ({"gara": True, "avgWatts": 100, "potenzaMisurata": True}, "gara"),
    ({"avgWatts": 0.80 * FTP, "potenzaMisurata": True}, "ripetute"),
    ({"avgWatts": 0.799 * FTP, "potenzaMisurata": True}, "fondo"),
    ({"np": 0.85 * FTP, "avgWatts": 0.7 * FTP, "potenzaMisurata": True}, "ripetute"),
    ({"avgWatts": 0.65 * FTP, "durataMin": 60, "potenzaMisurata": True}, "fondo"),
    ({"avgWatts": 0.64 * FTP, "durataMin": 75, "potenzaMisurata": True}, "recupero"),
    ({"avgWatts": 0.64 * FTP, "durataMin": 76, "potenzaMisurata": True}, "fondo"),
    ({"avgWatts": 0.9 * FTP, "avgHr": 0.5 * LTHR, "potenzaMisurata": True}, "ripetute"),
    ({"avgHr": 0.95 * LTHR, "durataMin": 90}, "ripetute"),
    ({"avgHr": 0.949 * LTHR, "durataMin": 60}, "fondo"),
    ({"avgHr": 0.99 * LTHR, "durataMin": 91}, "fondo"),
    ({"avgHr": 0.80 * LTHR, "durataMin": 75}, "recupero"),
    ({"avgHr": 0.81 * LTHR, "durataMin": 45}, "fondo"),
    ({"avgHr": 0.70 * LTHR, "durataMin": 76}, "fondo"),
    ({}, "fondo"),
])
def test_the_rule_labels_each_threshold(fields, expected):
    assert labels.rule_label(ride(**fields), FTP, LTHR) == expected


def shaped(*blocks, minutes: int = 90, **fields) -> dict:
    """Una corsa con la sua forma: blocchi (minuti, zona, minuti di recupero dopo)."""
    forma = {"fonte": "potenza", "minutiPerZona": {},
             "blocchi": [{"minuti": m, "zona": z, "recuperoMin": r} for m, z, r in blocks]}
    return ride(durataMin=minutes, forma=forma, **fields)


@pytest.mark.parametrize("r, expected", [
    # 2x20 a soglia e 3x10 in Z3, ognuno seguito da un recupero: ripetute anche con medie da fondo.
    (shaped((20, 4, 5), (20, 4, 10), avgWatts=0.7 * FTP, potenzaMisurata=True), "ripetute"),
    (shaped((10, 3, 4), (10, 3, 4), (10, 3, 15), avgHr=0.85 * LTHR), "ripetute"),
    # Un'attivazione in Z3 in un'uscita di Z2: fondo, anche con la FC media alta di un'ora.
    (shaped((3, 3, 60), minutes=60, avgHr=0.96 * LTHR), "fondo"),
    # Quattro ore con cinque salite di durata diversa: fondo.
    (shaped((3, 3, 20), (8, 4, 30), (5, 3, 25), (12, 3, 40), (6, 4, 50), minutes=240), "fondo"),
    # Due blocchi attaccati, senza recupero fra loro: non sono ripetute.
    (shaped((10, 4, 0), (10, 4, 10)), "fondo"),
    # La forma non toglie il recupero delle medie, né la gara.
    (shaped(minutes=50, avgHr=0.75 * LTHR), "recupero"),
    (shaped((20, 4, 5), (20, 4, 10), gara=True), "gara"),
])
def test_the_rule_reads_the_ride_shape_when_there_is_one(r, expected):
    assert labels.rule_label(r, FTP, LTHR) == expected


def test_power_without_a_power_meter_is_ignored_and_heart_rate_decides():
    estimated = ride(avgWatts=1.2 * FTP, np=1.2 * FTP, avgHr=0.70 * LTHR, durataMin=60)
    assert labels.rule_label(estimated, FTP, LTHR) == "recupero"
    assert labels.rule_label({**estimated, "avgHr": None}, FTP, LTHR) == "fondo"


def test_a_power_meter_ride_without_heart_rate_is_judged_by_power():
    assert labels.rule_label(ride(avgWatts=0.9 * FTP, potenzaMisurata=True), FTP, None) == "ripetute"


def test_without_ftp_a_power_meter_ride_is_judged_by_heart_rate():
    measured = ride(avgWatts=300, potenzaMisurata=True, avgHr=0.96 * LTHR, durataMin=60)
    assert labels.rule_label(measured, None, LTHR) == "ripetute"


@pytest.mark.parametrize("gara, expected", [(True, "gara"), (False, "fondo")])
def test_without_ftp_and_lthr_only_the_race_flag_counts(gara, expected):
    assert labels.rule_label(ride(gara=gara, avgWatts=300, avgHr=180, potenzaMisurata=True), None, None) == expected


def test_ride_facts_follow_the_recent_rides_one_by_one():
    acts = [{**a, "name": f"Uscita {i}", "workout_type": 11 if i == 0 else 10, "device_watts": i == 1, "max_watts": 900,
             "max_heartrate": 185} for i, a in enumerate(RIDES["activities"])]
    facts = labels.ride_facts(acts, DETAILS, {}, NOW_MS, FTP, LTHR)
    shown = recent_rides(acts, NOW_MS)
    assert len(facts) == len(shown) > 0
    assert [f["gara"] for f in facts] == [True] + [False] * (len(facts) - 1)
    assert {f["maxWatts"] for f in facts} == {900} and {f["maxHr"] for f in facts} == {185}
    assert [f["potenzaMisurata"] for f in facts] == [False, True] + [False] * (len(facts) - 2)
    assert all(f["np"] == (round(DETAILS[f["id"]]["np"]) if (DETAILS.get(f["id"]) or {}).get("np") else None)
               for f in facts)
    # Senza serie compatta nessuna forma: la regola guarda le medie.
    assert {f["forma"] for f in facts} == {None}


def labelled_run(value: str) -> tuple[list, FakeOllama]:
    fake = FakeOllama(CASE_OK["answer"])
    fake.chat = dataclasses.replace(fake.chat, ride_labels=value)
    return asyncio.run(run_case(CASE_OK, fake)), fake


def ride_lines(fake: FakeOllama) -> list[str]:
    prompt = chat_bodies(fake)[0]["messages"][1]["content"]
    block = prompt.split("ULTIME ATTIVITÀ BICI:\n")[1].split("\n\n")[0]
    return block.split("\n")


def test_with_labels_off_the_prompt_and_the_result_stay_as_before():
    off_events, off = labelled_run("off")
    assert all(" · " not in line for line in ride_lines(off))
    assert off_events[-1]["rideLabels"] == []


def test_with_the_rule_every_ride_line_ends_with_its_label_and_the_result_says_where_it_comes_from():
    events, fake = labelled_run("rule")
    lines = ride_lines(fake)
    assert lines and all(line.rsplit(" · ", 1)[-1] in labels.LABELS for line in lines)
    result = events[-1]
    assert [r["label"] for r in result["rideLabels"]] == [line.rsplit(" · ", 1)[-1] for line in lines]
    assert {r["source"] for r in result["rideLabels"]} == {"rule"}
    # Fuori dalle etichette la riga è quella di prima.
    off_events, off = labelled_run("off")
    assert [line.rsplit(" · ", 1)[0] for line in lines] == ride_lines(off)


def test_the_labels_step_lists_each_ride_with_its_label_and_source(phoenix):
    fake = FakeOllama(CASE_OK["answer"])
    fake.chat = dataclasses.replace(fake.chat, ride_labels="rule")

    async def go():
        with tracing.request(CASE_OK["duration"], ride_labels="rule"):
            return await run_case(CASE_OK, fake)
    events = asyncio.run(go())
    step = next(s for s in phoenix.spans() if s.name == "labels")
    root = next(s for s in phoenix.spans() if s.parent is None)
    assert root.attributes["coach.ride_labels"] == "rule"
    assert json.loads(step.attributes["output.value"]) == events[-1]["rideLabels"]


def test_no_recent_rides_means_no_labels_and_the_usual_sentence():
    fake = FakeOllama(CASE_OK["answer"])
    fake.chat = dataclasses.replace(fake.chat, ride_labels="rule")
    events = asyncio.run(run_case(CASE_OK, fake, rides=FakeRides([])))
    assert events[-1]["rideLabels"] == []
    assert "Nessuna attività bici negli ultimi 7 giorni." in chat_bodies(fake)[0]["messages"][1]["content"]


def test_the_prompt_version_changes_only_with_labels_on():
    assert prompts.prompt_version("fixed", "off") == prompts.prompt_version()
    assert prompts.prompt_version("fixed", "rule") == prompts.prompt_version("fixed", "model")
    assert prompts.prompt_version("fixed", "rule") != prompts.prompt_version()


def situation_run(name: str, value: str) -> tuple[dict, FakeOllama]:
    """Una situazione del set di valutazione, con la sua data di oggi, e le etichette come chiesto."""
    s = next(s for s in json.loads(grading.SITUATIONS_FILE.read_text(encoding="utf-8")) if s["name"] == name)
    fake = FakeOllama(json.dumps({"protocolId": s["allowed"][0], "razionale": "ok", "passaggiUsati": []}))
    fake.chat = dataclasses.replace(fake.chat, ride_labels=value)

    async def go():
        async with fake.client() as client:
            return await graph.from_context(s["context"], s["minutes"], lambda event: None, chat=fake.chat,
                                            chat_client=client, embed=FakeSearch([1.0] + [0.0] * 9).encode,
                                            load_index=fixture_index, spending=main.cloud_spending,
                                            today=s.get("today"))
    return asyncio.run(go()), fake


def system_text(fake: FakeOllama) -> str:
    return chat_bodies(fake)[0]["messages"][0]["content"]


def test_with_labels_on_a_race_yesterday_reaches_the_prompt_as_the_post_race_rule():
    _, on = situation_run("gara-ieri", "rule")
    _, off = situation_run("gara-ieri", "off")
    assert "Gara ieri: z1_recovery o rest [pratica]" in system_text(on)
    assert "Gara ieri" not in system_text(off) and "In tutti gli altri casi" in system_text(off)


def test_with_labels_off_every_old_situation_gets_the_same_prompt_with_or_without_its_date():
    for s in json.loads(grading.SITUATIONS_FILE.read_text(encoding="utf-8")):
        if "withLabels" in s:
            continue
        assert prompts.system_prompt([], s["context"], s["minutes"]) == prompts.system_prompt(
            [], {**s["context"], "recentDays": [{**r, "giorniFa": 1} for r in s["context"]["recentDays"]]},
            s["minutes"])


def test_the_prompt_version_with_labels_off_ignores_the_rules_that_read_ride_types(monkeypatch):
    off, on = prompts.prompt_version(), prompts.prompt_version(ride_labels="rule")
    changed = tuple(dataclasses.replace(r, source_pmid="1") if r.reads_labels else r for r in prompts.RULES)
    monkeypatch.setattr(prompts, "RULES", changed)
    assert prompts.prompt_version() == off and prompts.prompt_version(ride_labels="rule") != on
