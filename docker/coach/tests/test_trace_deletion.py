"""Disconnetti da Strava cancella in Phoenix le tracce della schermata Coach partite prima del
clic: contengono i numeri delle corse. Le tracce del controllo dal vivo e della valutazione restano.
Con Phoenix spento la cancellazione si ricorda in /data e parte appena Phoenix risponde, anche dopo
un riavvio del Coach. Qui Phoenix è FakePhoenix e le attese sono mille volte più brevi (conftest.py)."""

import asyncio
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

from app import main, tracing
from app.store import RideStore
from app.trace_deletion import TraceDeletion
from fakes import nanoseconds, project_of, quick_sleep
from test_workout import BODY, SAME_ORIGIN, events_of, make_service, post

DISCONNECT = datetime(2026, 11, 8, 10, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def service(monkeypatch, tmp_path):
    fakes = make_service(monkeypatch, {})
    # Le corse salvate nella cartella del test: Disconnetti le cancella, mai quelle del volume /data.
    monkeypatch.setattr(main, "store", RideStore(tmp_path / "rides.json"))
    return fakes


def forget(service) -> httpx.Response:
    return service.client.post("/coach/forget", headers=SAME_ORIGIN)


def until(condition, limit: float = 2) -> None:
    deadline = time.monotonic() + limit
    while not condition():
        assert time.monotonic() < deadline, "non è successo entro il tempo"
        time.sleep(0.005)


def leave_trace(phoenix, project: str) -> None:
    """Una traccia arrivata a Phoenix da un altro processo, come il controllo dal vivo."""
    provider = TracerProvider(resource=Resource.create({"openinference.project.name": project}))
    provider.add_span_processor(SimpleSpanProcessor(phoenix.received))
    provider.get_tracer(__name__).start_span(project).end()


def roots(phoenix) -> list:
    return [(project_of(s), s) for s in phoenix.spans() if s.parent is None]


def schedule_and_wait(deletion: TraceDeletion, *times: datetime) -> None:
    async def go():
        for at in times:
            deletion.schedule(at)
        await asyncio.wait_for(deletion.task, 2)
    asyncio.run(go())


def test_disconnect_deletes_the_coach_screen_traces_started_before_it_and_keeps_the_others(service, phoenix,
                                                                                         trace_deletion):
    leave_trace(phoenix, "live-check")
    leave_trace(phoenix, "evaluation")
    with service.client:
        assert events_of(post(service, BODY))[-1]["type"] == "result"
        phoenix.spans()   # arrivata a Phoenix prima del clic
        assert forget(service).status_code == 204
        assert events_of(post(service, BODY))[-1]["type"] == "result"
        until(lambda: trace_deletion.pending() is None)
    [call] = phoenix.attempts
    assert (call.method, call.url.path) == ("DELETE", "/v1/projects/coach-screen/traces")
    disconnected = nanoseconds(datetime.fromisoformat(call.url.params["end_time"]))
    left = roots(phoenix)
    assert sorted(project for project, _ in left) == ["coach-screen", "evaluation", "live-check"]
    # Della schermata Coach resta solo la richiesta partita dopo il clic.
    [later] = [root for project, root in left if project == "coach-screen"]
    assert later.start_time >= disconnected


def test_a_request_still_running_at_disconnect_leaves_no_trace(phoenix):
    with tracing.request(60):
        with tracing.step("rides"):
            pass
        tracing.forget(datetime.now(timezone.utc))
        with tracing.step("model"):
            pass
    with tracing.request(45):
        pass
    [only] = phoenix.spans()
    assert only.attributes["coach.minutes"] == 45


def test_the_disconnect_answer_never_waits_for_phoenix(service, trace_deletion, monkeypatch):
    async def never_answers(request):
        await asyncio.sleep(60)
    monkeypatch.setattr(trace_deletion, "http", httpx.AsyncClient(transport=httpx.MockTransport(never_answers)))
    with service.client:
        started = time.monotonic()
        assert forget(service).status_code == 204
        assert time.monotonic() - started < 1


def test_with_phoenix_down_the_deletion_runs_when_it_answers_again_even_after_a_restart(service, phoenix,
                                                                                       trace_deletion, monkeypatch):
    phoenix.up = False
    with service.client:
        events_of(post(service, BODY))
        phoenix.spans()
        forget(service)
        until(lambda: len(phoenix.attempts) >= 2)
    # Il Coach si è fermato con la cancellazione in sospeso: un nuovo processo la ritrova in /data.
    assert trace_deletion.pending() is not None
    restarted = TraceDeletion(trace_deletion.path, phoenix.client(), sleep=quick_sleep)
    monkeypatch.setattr(main, "trace_deletion", restarted)
    phoenix.up = True
    with TestClient(main.app):
        until(lambda: restarted.pending() is None)
    assert [project for project, _ in roots(phoenix)] == []


def test_reconnecting_before_phoenix_returns_deletes_only_what_started_before_the_disconnect(service, phoenix,
                                                                                            trace_deletion):
    phoenix.up = False
    with service.client:
        events_of(post(service, BODY))
        phoenix.spans()
        forget(service)
        # Di nuovo collegato, una richiesta nuova prima che Phoenix torni.
        events_of(post(service, BODY))
        phoenix.spans()
        phoenix.up = True
        until(lambda: trace_deletion.pending() is None)
    [(_, later)] = roots(phoenix)
    assert later.start_time >= nanoseconds(datetime.fromisoformat(phoenix.attempts[-1].url.params["end_time"]))


@pytest.mark.parametrize("order", [1, -1])
def test_a_second_disconnect_deletes_up_to_the_later_one(trace_deletion, phoenix, order):
    later = DISCONNECT + timedelta(minutes=3)
    leave_trace(phoenix, "coach-screen")
    schedule_and_wait(trace_deletion, *[DISCONNECT, later][::order])
    [call] = phoenix.attempts
    assert datetime.fromisoformat(call.url.params["end_time"]) == later


def test_with_no_coach_screen_trace_in_phoenix_the_pending_deletion_is_cleared(trace_deletion, phoenix):
    # Nessuna richiesta ancora, o i dati di Phoenix cancellati nel frattempo: il progetto non c'è.
    schedule_and_wait(trace_deletion, DISCONNECT)
    assert len(phoenix.attempts) == 1 and trace_deletion.pending() is None


def test_the_deletion_waits_5_seconds_then_tries_every_10_with_one_line_while_phoenix_is_down(phoenix, tmp_path,
                                                                                              capsys):
    waits = []

    async def sleep(seconds):
        waits.append(seconds)
        phoenix.up = len(waits) == 3
        await asyncio.sleep(0)
    deletion = TraceDeletion(tmp_path / "trace-deletion.json", phoenix.client(), sleep=sleep)
    schedule_and_wait(deletion, DISCONNECT)
    assert waits == [5, 10, 10] and len(phoenix.attempts) == 3 and deletion.pending() is None
    assert capsys.readouterr().out.splitlines() == [
        f"[coach] Phoenix non risponde su {tracing.PHOENIX_URL}: le tracce della schermata Coach si cancellano "
        "appena torna",
        "[coach] Cancellate in Phoenix le tracce della schermata Coach partite prima di Disconnetti"]
