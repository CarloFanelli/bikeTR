"""Le tracce in Phoenix: ogni richiesta del Coach ne lascia una, con i passi in ordine, la loro
durata e ciò che il Coach ha visto, mandato e deciso. Phoenix è sostituito da FakePhoenix
(conftest.py), che tiene le tracce in memoria."""

import asyncio
import json
import socket
import threading
import time

import pytest
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import StatusCode

from app import main, papers, prompts, search, tracing
from app.errors import CoachError
from app.strava import STRAVA_REFUSED, RideData
from fakes import CLOUD_KEY, FakeCloud, FakeOllama, FakeRides
from fixture_data import NOW_MS, RIDES
from test_cancel import CEILING, SILENCE, CoachServer, FakeModelServer, chat, run_workout, short_silence_client
from test_cancel import until_first_token
from test_workout import BODY, CASE, FAKES, events_of, make_service, post, run_case

STEPS = ["rides", "papers", "model", "decision"]


@pytest.fixture
def service(monkeypatch):
    return make_service(monkeypatch, {})


def by_name(spans) -> dict:
    return {s.name: s for s in spans}


def step_of(phoenix, name: str):
    return by_name(phoenix.spans())[name]


def run_traced(case: dict, fake, rides=None) -> list:
    """Una richiesta della schermata Coach con la sua traccia, senza la rotta HTTP."""
    async def go():
        with tracing.request(case["duration"]):
            return await run_case(case, fake, rides=rides)
    return asyncio.run(go())


def test_a_coach_screen_request_leaves_one_trace_with_its_steps_in_order(service, phoenix):
    events = events_of(post(service, BODY))
    assert events[-1]["type"] == "result"
    spans = sorted(phoenix.spans(), key=lambda s: s.start_time)
    root, *steps = spans
    assert [s.name for s in steps] == STEPS
    assert {s.context.trace_id for s in spans} == {root.context.trace_id}
    assert all(s.parent.span_id == root.context.span_id for s in steps)
    assert all(s.end_time >= s.start_time for s in spans)
    assert root.name == "coach-screen"
    assert dict(root.attributes) == {"openinference.span.kind": "CHAIN", "coach.source": "coach-screen",
                                     "coach.minutes": 60, "coach.prompt_version": prompts.prompt_version()}
    assert root.resource.attributes["openinference.project.name"] == "coach-screen"


def test_the_rides_step_holds_the_athlete_numbers(service, phoenix):
    context = next(e for e in events_of(post(service, BODY)) if e["type"] == "context")["context"]
    rides = step_of(phoenix, "rides")
    assert rides.attributes["coach.rides.from_saved"] is False
    assert json.loads(rides.attributes["output.value"]) == context


def test_saved_rides_used_when_strava_is_unreachable_show_in_the_rides_step(phoenix):
    case = CASE["valid-answer"]
    saved = FakeRides(RIDES["activities"])
    saved.data = RideData(activities=saved.data.activities, details=saved.data.details, downloaded_at=NOW_MS,
                          from_saved=True, missing_details=0)
    run_traced(case, FakeOllama(case["answer"]), rides=saved)
    assert step_of(phoenix, "rides").attributes["coach.rides.from_saved"] is True


def test_the_search_step_holds_the_search_text_and_the_papers_found(service, phoenix):
    result = events_of(post(service, BODY))[-1]
    papers = step_of(phoenix, "papers").attributes
    assert papers["openinference.span.kind"] == "RETRIEVER"
    assert papers["input.value"] == service.search.texts[0]
    found = [{"pmid": papers[f"retrieval.documents.{i}.document.id"],
              "title": papers[f"retrieval.documents.{i}.document.content"],
              "score": papers[f"retrieval.documents.{i}.document.score"]} for i in range(len(result["retrievedPapers"]))]
    assert found == [{k: p[k] for k in ("pmid", "title", "score")} for p in result["retrievedPapers"]]
    # Solo PMID, titolo e punteggio: niente abstract né vettori dell'indice.
    assert not any("abstract" in k or "embedding" in k for k in papers)


def sent_messages(fake) -> list:
    return fake.requests[0][-1]["messages"]


@pytest.mark.parametrize("provider", FAKES)
def test_the_model_step_holds_what_was_sent_and_answered(provider, phoenix):
    case = CASE["valid-answer"]
    fake = FAKES[provider](case["answer"])
    result = run_traced(case, fake)[-1]
    model = step_of(phoenix, "model").attributes
    assert model["openinference.span.kind"] == "LLM"
    assert (model["llm.provider"], model["llm.model_name"]) == (provider, fake.chat.model)
    messages = [{"role": model[f"llm.input_messages.{i}.message.role"],
                 "content": model[f"llm.input_messages.{i}.message.content"]} for i in range(2)]
    assert messages == sent_messages(fake)
    assert "llm.input_messages.2.message.role" not in model
    assert model["llm.output_messages.0.message.role"] == "assistant"
    assert model["llm.output_messages.0.message.content"] == model["output.value"] == case["answer"]
    assert (model["llm.token_count.prompt"], model["llm.token_count.completion"]) == (900, 42)
    assert model["coach.truncated"] is False
    if provider == "cloud":
        assert model["llm.cost.total"] == pytest.approx(result["cost"]) == (900 * 3 + 42 * 15) / 1_000_000
    else:
        # Con Ollama il costo è sconosciuto, come sulla scheda del workout.
        assert "llm.cost.total" not in model


def test_the_model_step_never_holds_the_cloud_key(phoenix):
    case = CASE["valid-answer"]
    fake = FakeCloud(case["answer"])
    run_traced(case, fake)
    spans = phoenix.spans()
    assert len(spans) == 5
    for span in spans:
        assert not any(fake.chat.key in str(v) for v in span.attributes.values())


@pytest.mark.parametrize("provider", FAKES)
def test_an_answer_cut_off_at_the_token_limit_is_recorded_as_cut_off(provider, phoenix):
    case = CASE["valid-answer"]
    fake = FAKES[provider](case["answer"])
    fake.done_reason = fake.finish_reason = "length"
    run_traced(case, fake)
    assert step_of(phoenix, "model").attributes["coach.truncated"] is True


def test_tokens_and_cost_the_provider_does_not_report_stay_unknown(phoenix):
    case = CASE["valid-answer"]
    fake = FakeCloud(case["answer"])
    fake.usage = None
    run_traced(case, fake)
    model = step_of(phoenix, "model").attributes
    assert not {"llm.token_count.prompt", "llm.token_count.completion", "llm.cost.total"} & set(model)


@pytest.mark.parametrize("case_name, answer, chosen, fell_back", [
    ("valid-answer", None, "seiler_4x8", False),
    # Illeggibile: nessun protocollo scelto, quello dato dalle regole di ripiego.
    ("valid-answer", "", None, True),
    # Troppo lungo per i 45 minuti: il protocollo scelto e quello dato sono diversi.
    ("too-short", None, "seiler_4x8", True),
])
def test_the_decision_step_holds_the_chosen_and_the_given_protocol(case_name, answer, chosen, fell_back, phoenix):
    case = CASE[case_name] if answer is None else {**CASE[case_name], "answer": answer}
    result = run_traced(case, FakeOllama(case["answer"]))[-1]
    decision = dict(step_of(phoenix, "decision").attributes)
    assert decision.get("coach.decision.chosen") == chosen
    assert decision["coach.decision.given"] == decision["output.value"] == result["protocolId"]
    assert decision.get("coach.decision.fallback_warning") == result["fallbackWarning"]
    assert (result["fallbackWarning"] is not None) == fell_back
    assert (result["protocolId"] != chosen) == fell_back


def test_two_tabs_at_the_same_time_leave_two_separate_traces(phoenix):
    case = CASE["valid-answer"]
    fake = FakeOllama(case["answer"])

    async def one(minutes: int):
        with tracing.request(minutes):
            await run_case({**case, "duration": minutes}, fake)

    async def both():
        await asyncio.gather(one(60), one(90))
    asyncio.run(both())
    spans = phoenix.spans()
    roots = [s for s in spans if s.parent is None]
    assert sorted(r.attributes["coach.minutes"] for r in roots) == [60, 90]
    for root in roots:
        steps = [s for s in spans if s.parent is not None and s.context.trace_id == root.context.trace_id]
        assert sorted(s.name for s in steps) == sorted(STEPS)
        assert all(s.parent.span_id == root.context.span_id for s in steps)


# --- Richieste fallite e fermate ---------------------------------------------------------

def failed(span) -> str | None:
    return span.status.description if span.status.status_code is StatusCode.ERROR else None


async def missing_index() -> dict:
    raise papers.PaperIndexError("papers_index.json non trovato (HTTP 404). " + papers.RESTORE)


@pytest.mark.parametrize("failing, message", [
    ("rides", STRAVA_REFUSED),
    ("papers", "papers_index.json non trovato (HTTP 404). " + papers.RESTORE),
])
def test_a_failed_step_shows_the_error_the_user_saw_and_nothing_after_it(failing, message, service, monkeypatch, phoenix):
    if failing == "rides":
        service.rides.error = CoachError(401, "strava_refused", STRAVA_REFUSED)
    else:
        monkeypatch.setattr(main, "load_index", missing_index)
    assert events_of(post(service, BODY))[-1]["message"] == message
    spans = by_name(phoenix.spans())
    assert list(spans) == STEPS[:STEPS.index(failing) + 1] + ["coach-screen"]
    assert failed(spans[failing]) == failed(spans["coach-screen"]) == message
    assert all(failed(s) is None for name, s in spans.items() if name not in (failing, "coach-screen"))
    # Niente eventi con il testo o lo stack dell'eccezione.
    assert not any(s.events for s in spans.values())


@pytest.mark.parametrize("kind", ["ollama", "cloud"])
def test_a_silent_model_ends_the_model_step_with_the_silence_error(kind, phoenix):
    async def go():
        async with FakeModelServer() as fake:
            settings = chat(kind, "silent", fake.url)
            async with short_silence_client(settings) as client:
                with pytest.raises(CoachError):
                    await run_workout(settings, client)
    asyncio.run(go())
    assert failed(step_of(phoenix, "model")) == SILENCE[kind]


def test_an_unexpected_error_shows_only_its_kind_never_its_text(service, monkeypatch, phoenix):
    async def leaking(text: str) -> list:
        raise RuntimeError(f"risposta con la chiave {CLOUD_KEY} e il token Bearer abc123")
    monkeypatch.setattr(search, "encode", leaking)
    assert events_of(post(service, BODY))[-1]["error"] == "internal"
    spans = phoenix.spans()
    assert failed(by_name(spans)["papers"]) == "Errore interno (RuntimeError)"
    for span in spans:
        text = json.dumps(dict(span.attributes)) + str(span.status.description) + str(span.events)
        assert CLOUD_KEY not in text and "abc123" not in text


def root_of(phoenix, limit: float = 5):
    """La richiesta, appena la traccia è finita: con Stop il servizio la chiude dopo la connessione."""
    deadline = time.monotonic() + limit
    while time.monotonic() < deadline:
        roots = [s for s in phoenix.spans() if s.parent is None]
        if roots:
            return roots[0]
        time.sleep(0.01)
    raise AssertionError("nessuna traccia finita")


def test_stop_after_the_provider_accepted_is_stopped_with_the_partial_answer_and_the_charge(monkeypatch, phoenix):
    async def go():
        async with FakeModelServer() as fake, CoachServer(monkeypatch, "cloud", "forever", fake.url) as client:
            await until_first_token(client)
            await fake.wait_closed()
            await asyncio.to_thread(root_of, phoenix)
    asyncio.run(go())
    spans = by_name(phoenix.spans())
    assert spans["coach-screen"].attributes["coach.stopped"] is True
    model = spans["model"].attributes
    assert model["coach.stopped"] is True
    assert model["output.value"].startswith("bla ")
    assert model["coach.charged"] == pytest.approx(CEILING["cloud"])
    assert failed(spans["coach-screen"]) is None and failed(spans["model"]) is None


def test_stop_before_the_provider_accepted_is_stopped_with_nothing_charged(monkeypatch, phoenix):
    async def go():
        async with FakeModelServer() as fake, CoachServer(monkeypatch, "cloud", "mute", fake.url) as client:
            async with client.stream("POST", "/coach/workout", json=BODY, headers={"Sec-Fetch-Site": "same-origin"}) as res:
                async for line in res.aiter_lines():
                    if json.loads(line).get("step") == "model":
                        break
                deadline = time.monotonic() + 5
                while not fake.asked and time.monotonic() < deadline:
                    await asyncio.sleep(0.01)
            await asyncio.to_thread(root_of, phoenix)
    asyncio.run(go())
    model = step_of(phoenix, "model").attributes
    assert (model["coach.stopped"], model["coach.charged"]) == (True, 0)


def test_an_ollama_answer_charges_nothing_to_the_cloud_total(phoenix):
    case = CASE["valid-answer"]
    run_traced(case, FakeOllama(case["answer"]))
    assert "coach.charged" not in step_of(phoenix, "model").attributes


# --- Phoenix che non risponde ------------------------------------------------------------

class SilentPhoenix:
    """Un ricevitore di tracce che accetta la connessione e non risponde mai."""

    def __enter__(self):
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        self.connections = []
        threading.Thread(target=self.accept, daemon=True).start()
        return f"http://127.0.0.1:{self.sock.getsockname()[1]}"

    def accept(self):
        while True:
            try:
                self.connections.append(self.sock.accept()[0])
            except OSError:
                return

    def __exit__(self, *exc):
        self.sock.close()
        for connection in self.connections:
            connection.close()


def test_a_trace_receiver_that_never_answers_delays_no_coach_result(service, monkeypatch, capsys, caplog):
    with SilentPhoenix() as url:
        monkeypatch.setattr(tracing, "PHOENIX_URL", url)
        provider = tracing.setup(tracing.COACH_SCREEN)
        for _ in range(3):
            started = time.monotonic()
            assert events_of(post(service, BODY))[-1]["type"] == "result"
            assert time.monotonic() - started < 1
        # Mandare le tracce rimaste, come all'uscita: una sola attesa di al massimo un secondo.
        started = time.monotonic()
        provider.shutdown()
        assert time.monotonic() - started < 2
    assert capsys.readouterr().out.count("[coach] Phoenix non risponde") == 1
    # Le righe di OpenTelemetry per ogni tentativo restano spente.
    assert not [r for r in caplog.records if r.name.startswith("opentelemetry")]


class DownPhoenix(SpanExporter):
    """Phoenix spento, o acceso solo quando `up` è vero."""

    def __init__(self):
        self.up = False

    def export(self, spans):
        return SpanExportResult.SUCCESS if self.up else SpanExportResult.FAILURE


def test_with_phoenix_down_the_log_gets_one_line_until_a_trace_gets_through(capsys):
    case = CASE["valid-answer"]
    phoenix = DownPhoenix()
    provider = tracing.setup(tracing.COACH_SCREEN, phoenix)

    def request() -> list:
        events = run_traced(case, FakeOllama(case["answer"]))
        provider.force_flush()
        return events

    assert all(request()[-1]["type"] == "result" for _ in range(3))
    assert capsys.readouterr().out.count("[coach]") == 1
    phoenix.up = True
    request()
    phoenix.up = False
    request()
    provider.shutdown()
    assert capsys.readouterr().out.splitlines() == [
        f"[coach] Phoenix non risponde su {tracing.PHOENIX_URL}: le tracce vanno perse finché non torna"]
