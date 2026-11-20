"""Il modello che etichetta le corse, con COACH_RIDE_LABELS=model: un provider suo in .env, una
chiamata sola per richiesta prima della bozza, il costo nel totale della spesa, e la regola per ogni
corsa che non etichetta. Qui tutti i modelli sono finti: nessuna spesa."""

import asyncio
import dataclasses
import json

import pytest

from app import cloud, evaluation, labels, ollama, provider, tracing
from app.errors import CoachError
from app.spending import Prices, charge
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_PRICES, CLOUD_URL, FakeCloud, FakeOllama, FakeRides
from test_graph import CASE_OK, chat_bodies
from test_labels import ride_lines
from test_workout import activities, run_case, scenario

GOOD = CASE_OK["answer"]
LABEL_PRICES = Prices(input=0.1, output=0.5, limit=CLOUD_PRICES.limit)


def label_fake(kind: str, answer: str | list) -> FakeOllama | FakeCloud:
    """Il finto modello che etichetta, al posto del client del suo provider."""
    if kind == "ollama":
        fake = FakeOllama(answer, model="qwen2.5:3b")
    else:
        fake = FakeCloud(answer)
        fake.chat = provider.ChatSettings("cloud", "haiku-di-prova", CLOUD_URL, CLOUD_KEY, LABEL_PRICES)
    return fake


def run(monkeypatch, chat_kind: str, label: FakeOllama | FakeCloud, rides=None, spending=None):
    chat = FakeOllama(GOOD) if chat_kind == "ollama" else FakeCloud(GOOD)
    chat.chat = dataclasses.replace(chat.chat, ride_labels="model", label=label.chat)
    monkeypatch.setattr(ollama if label.chat.provider == "ollama" else cloud, "client",
                        lambda *args: label.client())
    events = asyncio.run(run_case(CASE_OK, chat, rides=rides))
    return events, chat


def label_requests(fake) -> list[dict]:
    return chat_bodies(fake)


def rides_count(monkeypatch) -> int:
    """Quante corse recenti ha la situazione di prova: le etichetta la regola."""
    events, _ = run(monkeypatch, "ollama", label_fake("ollama", "niente"))
    return len(events[-1]["rideLabels"])


def answer_for(count: int, label: str = "ripetute") -> str:
    return json.dumps({f"c{i}": label for i in range(1, count + 1)})


@pytest.mark.parametrize("chat_kind, label_kind", [("cloud", "ollama"), ("ollama", "cloud")])
def test_the_label_model_runs_on_its_own_provider_and_labels_every_ride(monkeypatch, chat_kind, label_kind):
    count = rides_count(monkeypatch)
    label = label_fake(label_kind, answer_for(count))
    events, chat = run(monkeypatch, chat_kind, label)
    assert len(label_requests(label)) == 1
    assert label_requests(label)[0]["model"] == label.chat.model
    assert {(r["label"], r["source"]) for r in events[-1]["rideLabels"]} == {("ripetute", "model")}
    assert all(line.endswith(" · ripetute") for line in ride_lines(chat))
    assert events[-1]["protocolId"] == "z1_recovery"


def test_the_label_model_gets_short_ids_names_and_numbers_never_strava_ids(monkeypatch):
    acts = [{**a, "name": f"Giro {i}"} for i, a in enumerate(activities(scenario(CASE_OK["scenario"])))]
    label = label_fake("ollama", "{}")
    run(monkeypatch, "ollama", label, rides=FakeRides(acts))
    system, user = label_requests(label)[0]["messages"]
    assert system["content"] == labels.LABEL_SYSTEM
    assert "- c1: «Giro" in user["content"]
    assert not any(str(a["id"]) in user["content"] for a in acts)


@pytest.mark.parametrize("ride, power, heart", [
    ({"avgWatts": 200, "np": 210, "potenzaMisurata": True, "avgHr": 152}, "0.84", "0.95"),
    ({"avgWatts": 260, "np": None, "potenzaMisurata": False, "avgHr": 144}, "—", "0.90"),
    ({"avgWatts": None, "np": None, "potenzaMisurata": False, "avgHr": None}, "—", "—"),
])
def test_each_ride_line_carries_its_shares_of_ftp_and_threshold_heart_rate(ride, power, heart):
    base = {"tipo": "Ride", "durataMin": 60, "distanzaKm": 30, "nome": "Uscita", "gara": False}
    _, user = labels.model_messages([{**base, **ride}], 250, 160)
    assert f"quota di FTP {power}, quota di soglia cardiaca {heart}," in user["content"]
    assert ("(misurata)" if ride["potenzaMisurata"] else "(stimata)") in user["content"]


def test_each_ride_line_describes_its_ride_shape_or_says_there_is_none():
    base = {"tipo": "Ride", "durataMin": 65, "distanzaKm": 30, "avgWatts": 190, "np": 200, "potenzaMisurata": True}
    forma = {"fonte": "potenza", "minutiPerZona": {"Z1": 0, "Z2": 25, "Z3": 0, "Z4": 40, "Z5": 0, "Z6": 0},
             "blocchi": [{"minuti": 20, "zona": 4, "recuperoMin": 5}, {"minuti": 20, "zona": 4, "recuperoMin": 10}],
             "caricoOra": 91.2}
    _, user = labels.model_messages([{**base, "forma": forma}, {**base, "forma": None}, base], 250, 160)
    lines = user["content"].split("\n")[-3:]
    assert lines[0].endswith("forma (da potenza): blocchi duri 20min Z4 poi 5min di recupero, 20min Z4 poi 10min "
                             "di recupero; minuti per zona Z2 25, Z4 40; carico per ora 91.2")
    assert lines[1].endswith("forma: — (senza dati secondo per secondo)")
    assert lines[2].endswith("forma: — (senza dati secondo per secondo)")


def test_a_shape_without_hard_blocks_says_so():
    forma = {"fonte": "fc", "minutiPerZona": {"Z1": 10, "Z2": 50, "Z3": 0, "Z4": 0, "Z5": 0, "Z6": 0}, "blocchi": [],
             "caricoOra": None}
    ride = {"tipo": "Ride", "durataMin": 60, "distanzaKm": 30, "potenzaMisurata": False, "forma": forma}
    _, user = labels.model_messages([ride], 250, 160)
    assert user["content"].endswith("forma (da fc): nessun blocco duro; minuti per zona Z1 10, Z2 50; carico per ora —")


def test_without_ftp_the_share_of_ftp_is_a_dash():
    ride = {"tipo": "Ride", "durataMin": 60, "distanzaKm": 30, "avgWatts": 200, "np": 210, "potenzaMisurata": True,
            "avgHr": 150}
    _, user = labels.model_messages([ride], None, 160)
    assert "quota di FTP —, quota di soglia cardiaca 0.94," in user["content"]


def test_the_label_prompt_asks_for_every_ride_and_names_the_rule_thresholds():
    assert "OGNI corsa" in labels.LABEL_SYSTEM
    assert f"da {labels.POWER_INTERVALS_FROM:.2f} in su" in labels.LABEL_SYSTEM
    assert f"sotto {labels.HR_RECOVERY_BELOW:.2f}" in labels.LABEL_SYSTEM
    assert "blocchi duri" in labels.LABEL_SYSTEM and f"da {labels.HR_LOAD_PER_HOUR_FROM:g}" in labels.LABEL_SYSTEM


def test_no_recent_rides_means_no_label_call(monkeypatch):
    label = label_fake("ollama", "{}")
    events, _ = run(monkeypatch, "ollama", label, rides=FakeRides([]))
    assert label_requests(label) == [] and events[-1]["rideLabels"] == []


@pytest.mark.parametrize("answer, note", [
    ('{"c1":"gara"}', "solo la prima"),
    ('{"c1":"gara","c2":"tempo","c99":"fondo"}', "etichetta sconosciuta e id che non esiste"),
    ("Le corse sono tutte di fondo.", "non è JSON"),
])
def test_rides_the_model_does_not_label_get_the_rule(monkeypatch, answer, note):
    count = rides_count(monkeypatch)
    rule, _ = run(monkeypatch, "ollama", label_fake("ollama", "niente"))
    events, _ = run(monkeypatch, "ollama", label_fake("ollama", answer))
    got = events[-1]["rideLabels"]
    first_by_model = answer.startswith('{"c1":"gara"')
    for i in range(count):
        if i == 0 and first_by_model:
            assert (got[i]["label"], got[i]["source"]) == ("gara", "model"), note
        else:
            assert got[i] == rule[-1]["rideLabels"][i], note


def test_an_answer_cut_at_the_token_limit_gives_the_rule_for_every_ride(monkeypatch):
    count = rides_count(monkeypatch)
    label = label_fake("ollama", answer_for(count))
    label.done_reason = "length"
    events, _ = run(monkeypatch, "ollama", label)
    assert {r["source"] for r in events[-1]["rideLabels"]} == {"rule"}


def test_an_unreachable_label_model_never_stops_the_request(monkeypatch, phoenix):
    label = label_fake("ollama", "{}")
    label.down = True
    chat = FakeOllama(GOOD)
    chat.chat = dataclasses.replace(chat.chat, ride_labels="model", label=label.chat)
    monkeypatch.setattr(ollama, "client", lambda *args: label.client())

    async def go():
        with tracing.request(CASE_OK["duration"]):
            return await run_case(CASE_OK, chat)
    events = asyncio.run(go())
    assert events[-1]["type"] == "result" and events[-1]["protocolId"] == "z1_recovery"
    assert {r["source"] for r in events[-1]["rideLabels"]} == {"rule"}
    turn = next(s for s in phoenix.spans() if s.name == "turn" and "coach.labels.model_skipped" in s.attributes)
    assert turn.attributes["coach.labels.model_skipped"] == ollama.unreachable()


def test_a_cloud_label_call_is_charged_and_the_trace_has_its_model_tokens_and_cost(monkeypatch, cloud_spending,
                                                                                  phoenix):
    count = rides_count(monkeypatch)
    label = label_fake("cloud", answer_for(count, "fondo"))
    chat = FakeOllama(GOOD)
    chat.chat = dataclasses.replace(chat.chat, ride_labels="model", label=label.chat)
    monkeypatch.setattr(cloud, "client", lambda *args: label.client())

    async def go():
        with tracing.request(CASE_OK["duration"]):
            return await run_case(CASE_OK, chat)
    events = asyncio.run(go())
    assert cloud_spending.total() == pytest.approx(charge(LABEL_PRICES, 900, 42))
    call = events[-1]["labelModel"]
    assert (call["model"], call["charged"]) == ("haiku-di-prova", pytest.approx(charge(LABEL_PRICES, 900, 42)))
    assert call["seconds"] >= 0 and events[-1]["cost"] is None
    spans = sorted(phoenix.spans(), key=lambda s: s.start_time)
    step = [s for s in spans if s.name == "labels"][-1]
    turn = next(s for s in spans if s.name == "turn" and s.parent.span_id == step.context.span_id)
    assert turn.attributes["llm.model_name"] == "haiku-di-prova"
    assert (turn.attributes["llm.token_count.prompt"], turn.attributes["llm.token_count.completion"]) == (900, 42)
    assert turn.attributes["llm.cost.total"] == pytest.approx(charge(LABEL_PRICES, 900, 42))
    assert json.loads(step.attributes["output.value"])[0]["source"] == "model"


def test_with_the_cap_reached_no_label_call_starts_and_the_rule_labels(monkeypatch, cloud_spending):
    cloud_spending.add(LABEL_PRICES.limit)
    label = label_fake("cloud", "{}")
    events, _ = run(monkeypatch, "ollama", label)
    assert label_requests(label) == []
    assert {r["source"] for r in events[-1]["rideLabels"]} == {"rule"}
    assert events[-1]["labelModel"]["charged"] == 0.0


def settings(monkeypatch, **env) -> provider.ChatSettings:
    for name, value in {"COACH_RIDE_LABELS": "model", **env}.items():
        monkeypatch.setenv(name, value)
    return provider.settings()


def test_label_model_settings_default_to_ollama(monkeypatch):
    assert settings(monkeypatch, LABEL_MODEL="qwen2.5:3b").label == provider.ChatSettings(
        "ollama", "qwen2.5:3b", ollama.OLLAMA_URL)


def test_a_cloud_label_model_takes_its_prices_and_the_chat_address_key_and_cap(monkeypatch):
    label = settings(monkeypatch, **CLOUD_ENV, LABEL_PROVIDER="cloud", LABEL_MODEL="haiku",
                     LABEL_PRICE_IN="0.1", LABEL_PRICE_OUT="0.5").label
    assert label == provider.ChatSettings("cloud", "haiku", CLOUD_URL, CLOUD_KEY, LABEL_PRICES)


def test_labels_off_or_rule_need_no_label_model(monkeypatch):
    assert settings(monkeypatch, COACH_RIDE_LABELS="rule").label is None


@pytest.mark.parametrize("env, message", [
    ({}, "Manca in .env: LABEL_MODEL, il modello che etichetta le corse"),
    ({"LABEL_MODEL": "haiku", "LABEL_PROVIDER": "cloud"},
     "Con LABEL_PROVIDER=cloud manca in .env: LABEL_CLOUD_URL, LABEL_CLOUD_API_KEY, LABEL_PRICE_IN, "
     "LABEL_PRICE_OUT, CLOUD_SPENDING_LIMIT"),
    ({"LABEL_MODEL": "x", "LABEL_PROVIDER": "openai"}, 'LABEL_PROVIDER in .env vale "openai": i valori ammessi sono '
                                                       "ollama e cloud"),
])
def test_an_incomplete_label_model_setting_fails_naming_it(monkeypatch, env, message):
    with pytest.raises(CoachError) as e:
        settings(monkeypatch, **env)
    assert e.value.message == message


def test_the_worst_case_cost_counts_one_label_call_per_answer(cloud_spending, capsys):
    chat = provider.ChatSettings("ollama", "qwen2.5:7b", ollama.OLLAMA_URL, ride_labels="model",
                                 label=provider.ChatSettings("cloud", "haiku", CLOUD_URL, CLOUD_KEY, LABEL_PRICES))
    assert evaluation.affordable(chat, 4, cloud_spending)
    worst = 4 * charge(LABEL_PRICES, None, None)
    assert capsys.readouterr().out == (f"Costo massimo: ${worst:.4f} per 4 risposte, con il modello chat gratis e una "
                                       "chiamata del modello che etichetta; restano $1.0000 sotto il tetto.\n")
