"""Le etichette del modello che etichetta si salvano con la corsa e il nome del modello: la richiesta
dopo le riusa, un altro modello le rifà, la regola non si salva mai, e "Disconnetti da Strava" le
cancella con le corse. Il database è quello di prova; i modelli sono finti."""

import asyncio
import dataclasses
import json

import psycopg
import pytest

from app import ollama
from app.strava import StravaRides, ride_data
from fakes import FakeOllama
from fixture_data import activities, scenario
from test_graph import CASE_OK, chat_bodies
from test_workout import run_case

GOOD = CASE_OK["answer"]


class SavedRides(StravaRides):
    """Le corse della situazione di prova come le dà il database, senza chiedere nulla a Strava."""

    def __init__(self, store, acts):
        super().__init__(store, None)
        self.acts = acts

    async def refresh(self, now_ms, progress=None):
        return ride_data(self.acts, {}, None, False)


@pytest.fixture
def acts(activity_store) -> list:
    acts = activities(scenario(CASE_OK["scenario"]))
    asyncio.run(activity_store.save_activities(activity_store.generation,
                                               [{**a, "start_date": a["start_date_local"]} for a in acts]))
    return acts


def ask(monkeypatch, store, acts, answer: str, model: str = "qwen2.5:3b", rides=None) -> tuple[list, FakeOllama]:
    """Una richiesta della schermata Coach con le corse salvate e il modello che etichetta `model`."""
    label = FakeOllama(answer, model=model)
    chat = FakeOllama(GOOD)
    chat.chat = dataclasses.replace(chat.chat, ride_labels="model", label=label.chat)
    monkeypatch.setattr(ollama, "client", lambda *args: label.client())
    events = asyncio.run(run_case(CASE_OK, chat, rides=rides or SavedRides(store, acts)))
    return events, label


def everything(count: int, label: str) -> str:
    return json.dumps({f"c{i}": label for i in range(1, count + 1)})


def saved_rows(conninfo) -> list[tuple]:
    with psycopg.connect(conninfo) as conn:
        return conn.execute("SELECT activity_id, label, model FROM ride_labels ORDER BY activity_id").fetchall()


def count_of(monkeypatch, store, acts) -> int:
    events, _ = ask(monkeypatch, store, acts, "{}")
    return len(events[-1]["rideLabels"])


def test_a_second_request_reuses_the_saved_labels_without_calling_the_model(monkeypatch, activity_store, acts,
                                                                          test_database):
    count = count_of(monkeypatch, activity_store, acts)
    first, _ = ask(monkeypatch, activity_store, acts, everything(count, "ripetute"))
    assert {r["source"] for r in first[-1]["rideLabels"]} == {"model"}
    assert {(label, model) for _, label, model in saved_rows(test_database)} == {("ripetute", "qwen2.5:3b")}
    second, label = ask(monkeypatch, activity_store, acts, everything(count, "fondo"))
    assert chat_bodies(label) == []
    assert {(r["label"], r["source"]) for r in second[-1]["rideLabels"]} == {("ripetute", "saved")}


def test_only_rides_without_a_saved_label_go_to_the_model(monkeypatch, activity_store, acts, test_database):
    count = count_of(monkeypatch, activity_store, acts)
    assert count >= 2
    ask(monkeypatch, activity_store, acts, '{"c1":"gara"}')
    events, label = ask(monkeypatch, activity_store, acts, everything(count - 1, "fondo"))
    (body,) = chat_bodies(label)
    assert body["messages"][1]["content"].count("\n- c") == count - 1
    got = events[-1]["rideLabels"]
    assert (got[0]["label"], got[0]["source"]) == ("gara", "saved")
    assert {(r["label"], r["source"]) for r in got[1:]} == {("fondo", "model")}


def test_another_label_model_labels_again_and_replaces_the_saved_labels(monkeypatch, activity_store, acts,
                                                                       test_database):
    count = count_of(monkeypatch, activity_store, acts)
    ask(monkeypatch, activity_store, acts, everything(count, "ripetute"))
    events, label = ask(monkeypatch, activity_store, acts, everything(count, "fondo"), model="llama3.2:3b")
    assert len(chat_bodies(label)) == 1
    assert {r["source"] for r in events[-1]["rideLabels"]} == {"model"}
    assert {(label, model) for _, label, model in saved_rows(test_database)} == {("fondo", "llama3.2:3b")}


def test_labels_from_the_rule_are_never_saved(monkeypatch, activity_store, acts, test_database):
    events, _ = ask(monkeypatch, activity_store, acts, "non so")
    assert {r["source"] for r in events[-1]["rideLabels"]} == {"rule"}
    assert saved_rows(test_database) == []


def test_disconnecting_from_strava_deletes_the_saved_labels(monkeypatch, activity_store, acts, test_database):
    count = count_of(monkeypatch, activity_store, acts)
    ask(monkeypatch, activity_store, acts, everything(count, "fondo"))
    assert saved_rows(test_database)
    asyncio.run(activity_store.forget())
    assert saved_rows(test_database) == []


def test_a_disconnect_during_the_label_call_saves_nothing(monkeypatch, activity_store, acts, test_database):
    count = count_of(monkeypatch, activity_store, acts)

    label = FakeOllama(everything(count, "fondo"), model="qwen2.5:3b")
    handle = label.handle

    def disconnect_then_answer(request):
        activity_store.generation += 1
        return handle(request)
    label.handle = disconnect_then_answer
    chat = FakeOllama(GOOD)
    chat.chat = dataclasses.replace(chat.chat, ride_labels="model", label=label.chat)
    monkeypatch.setattr(ollama, "client", lambda *args: label.client())
    events = asyncio.run(run_case(CASE_OK, chat, rides=SavedRides(activity_store, acts)))
    assert {r["source"] for r in events[-1]["rideLabels"]} == {"model"}
    assert saved_rows(test_database) == []


def test_a_request_stopped_during_the_label_call_saves_nothing(monkeypatch, activity_store, acts, test_database):
    label = FakeOllama("{}", model="qwen2.5:3b")
    asked = asyncio.Event()

    async def never_answer(request):
        asked.set()
        await asyncio.sleep(3600)
    label.handle = never_answer
    chat = FakeOllama(GOOD)
    chat.chat = dataclasses.replace(chat.chat, ride_labels="model", label=label.chat)
    monkeypatch.setattr(ollama, "client", lambda *args: label.client())

    async def stop_while_labelling():
        request = asyncio.create_task(run_case(CASE_OK, chat, rides=SavedRides(activity_store, acts)))
        await asked.wait()
        request.cancel()
        with pytest.raises(asyncio.CancelledError):
            await request
    asyncio.run(stop_while_labelling())
    assert saved_rows(test_database) == []
