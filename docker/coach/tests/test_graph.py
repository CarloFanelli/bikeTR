"""Il grafo del Coach: una bozza che non va bene torna al modello con i motivi, fino a tre bozze;
poi si consegna l'ultima o il ripiego. Token e costi sono la somma delle bozze, e con un modello
cloud il tetto di spesa ferma le bozze successive senza fermare il workout."""

import asyncio

import pytest

from app import tracing
from app.check import MAX_DRAFTS
from app.spending import charge
from fakes import CLOUD_PRICES, FakeCloud, FakeOllama
from test_workout import CASE, run_case

CASE_OK = CASE["allowed-answer"]
GOOD = CASE_OK["answer"]
UNREADABLE = "Oggi ti consiglio un bel giro facile."
UNREADABLE_REASON = ("La risposta non era un oggetto JSON leggibile: rispondi con il solo oggetto JSON, "
                     "senza testo prima o dopo.")
# Quanto fa pagare una risposta del finto provider cloud: 900 token letti e 42 scritti.
ANSWER_CHARGE = charge(CLOUD_PRICES, 900, 42)


def chat_bodies(fake) -> list[dict]:
    """Le richieste di chat arrivate al modello finto, nell'ordine."""
    if isinstance(fake, FakeOllama):
        return [body for path, body in fake.requests if path == "/api/chat"]
    return [body for path, _, body in fake.requests if path.endswith("/chat/completions")]


def run(fake) -> list:
    return asyncio.run(run_case(CASE_OK, fake))


def test_an_unreadable_draft_goes_back_with_its_reason_and_the_second_draft_is_delivered():
    fake = FakeOllama([UNREADABLE, GOOD])
    events = run(fake)
    result = events[-1]
    first, second = chat_bodies(fake)
    assert second["messages"][:2] == first["messages"]
    assert second["messages"][2:] == [
        {"role": "assistant", "content": UNREADABLE},
        {"role": "user", "content": f"La tua risposta non va bene:\n- {UNREADABLE_REASON}\n"
                                    "Scegli di nuovo e restituisci SOLO il JSON."}]
    assert result["protocolId"] == "z1_recovery" and result["fellBack"] is False
    assert result["fallbackCause"] is None and result["modelRaw"] == GOOD
    assert [d["check"] for d in result["drafts"]] == [
        {"ok": False, "causes": ["unreadable"], "reasons": [UNREADABLE_REASON]},
        {"ok": True, "causes": [], "reasons": []}]
    assert [d["protocolId"] for d in result["drafts"]] == [None, "z1_recovery"]
    # Il passo "modello" compare una volta sola, alla prima bozza; prima della seconda, il motivo e il tentativo.
    assert sum(1 for e in events if e.get("step") == "model") == 1
    retry = next(e for e in events if e.get("step") == "draft")
    assert retry == {"type": "step", "step": "draft", "attempt": 2, "of": 3,
                     "message": "La risposta non era leggibile: il modello riprova, tentativo 2 di 3"}
    tokens = [i for i, e in enumerate(events) if e["type"] == "token"]
    assert tokens[0] < events.index(retry) < tokens[-1]


def test_three_unusable_drafts_end_in_the_fallback_rules_with_the_last_cause():
    fake = FakeOllama(['{"protocolId":"inventato"}', UNREADABLE, ""])
    events = run(fake)
    result = events[-1]
    assert len(chat_bodies(fake)) == MAX_DRAFTS
    assert result["fellBack"] is True and result["fallbackCause"] == "unreadable"
    assert result["fallbackWarning"].startswith("⚠️ La risposta del modello non era leggibile")
    assert [d["check"]["causes"] for d in result["drafts"]] == [["not_in_catalog"], ["unreadable"], ["unreadable"]]
    assert [e["message"] for e in events if e.get("step") == "draft"] == [
        "Il protocollo scelto non è nel catalogo: il modello riprova, tentativo 2 di 3",
        "La risposta non era leggibile: il modello riprova, tentativo 3 di 3"]
    assert result["title"] and result["struttura"]


def test_an_accepted_first_draft_is_the_only_one():
    fake = FakeOllama(GOOD)
    result = run(fake)[-1]
    assert len(chat_bodies(fake)) == 1
    assert len(result["drafts"]) == 1 and result["inputTokens"] == 900 and result["outputTokens"] == 42


def test_cloud_drafts_add_up_their_tokens_and_costs_and_each_one_is_charged(cloud_spending):
    fake = FakeCloud([UNREADABLE, UNREADABLE, GOOD])
    result = run(fake)[-1]
    assert len(chat_bodies(fake)) == 3
    assert (result["inputTokens"], result["outputTokens"]) == (2700, 126)
    assert result["cost"] == pytest.approx(3 * ANSWER_CHARGE)
    assert [d["cost"] for d in result["drafts"]] == [pytest.approx(ANSWER_CHARGE)] * 3
    assert cloud_spending.total() == pytest.approx(3 * ANSWER_CHARGE)


def test_with_the_spending_cap_reached_after_the_first_draft_no_second_draft_but_a_workout(cloud_spending):
    cloud_spending.add(CLOUD_PRICES.limit - ANSWER_CHARGE / 2)
    fake = FakeCloud([UNREADABLE, GOOD])
    result = run(fake)[-1]
    assert len(chat_bodies(fake)) == 1
    assert result["type"] == "result" and result["fellBack"] is True and result["fallbackCause"] == "unreadable"
    assert result["title"] and result["struttura"] and len(result["drafts"]) == 1


def test_a_three_draft_request_leaves_three_draft_and_three_check_steps_in_its_trace(phoenix):
    fake = FakeOllama([UNREADABLE, '{"protocolId":"inventato"}', GOOD])

    async def go():
        with tracing.request(CASE_OK["duration"]):
            return await run_case(CASE_OK, fake)
    asyncio.run(go())
    spans = sorted(phoenix.spans(), key=lambda s: s.start_time)
    assert [s.name for s in spans if s.parent is not None] == [
        "rides", "metrics", "papers", "draft", "check", "draft", "check", "draft", "check", "deliver"]
    checks = [s.attributes for s in spans if s.name == "check"]
    assert [(c["coach.check.attempt"], c["coach.check.ok"], tuple(c["coach.check.causes"])) for c in checks] == [
        (1, False, ("unreadable",)), (2, False, ("not_in_catalog",)), (3, True, ())]
    assert all(s.parent.span_id == spans[0].context.span_id for s in spans[1:])

