"""Le tracce in Phoenix: ogni richiesta del Coach ne lascia una, con i passi in ordine, la loro
durata e ciò che il Coach ha visto, mandato e deciso. Phoenix è sostituito da FakePhoenix
(conftest.py), che tiene le tracce in memoria."""

import asyncio
import json

import pytest

from app import prompts, tracing
from app.strava import RideData
from fakes import FakeCloud, FakeOllama, FakeRides
from fixture_data import NOW_MS, RIDES
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
