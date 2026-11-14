"""La ricerca chiesta dal modello (COACH_SEARCH_MODE=model): la bozza parte senza paper, il modello
chat cerca con lo strumento search_papers fino a 3 volte per bozza, e il controllo accetta le
citazioni dei passaggi che le ricerche gli hanno restituito, anche in una bozza successiva."""

import asyncio
import dataclasses
import json

import pytest

from app import papers, prompts
from app.check import MAX_DRAFTS
from app.spending import charge
from fakes import CLOUD_PRICES, INDEX, FakeCloud, FakeOllama, FakeSearch, asks
from test_graph import chat_bodies
from test_workout import CASE, CASES, run_case

CASE_OK = CASE["allowed-answer"]
VECTOR = CASES["queries"][CASE_OK["query"]]
FOUND = papers.top_papers(INDEX, VECTOR)
LABEL = FOUND[0]["passages"][0]["label"]
PROTOCOL = json.loads(CASE_OK["answer"])["protocolId"]


def answer(*labels: str) -> str:
    """Una risposta che il controllo accetta, citando le etichette date."""
    return json.dumps({"protocolId": PROTOCOL, "razionale": f"Serve recupero {' '.join(f'[{x}]' for x in labels)}.",
                       "passaggiUsati": list(labels)}, ensure_ascii=False)


# Quanto fa pagare un giro del finto provider cloud: 900 token letti e 42 scritti.
TURN_CHARGE = charge(CLOUD_PRICES, 900, 42)


def model_mode(fake: FakeOllama | FakeCloud) -> FakeOllama | FakeCloud:
    fake.chat = dataclasses.replace(fake.chat, search_mode="model")
    return fake


def run(fake: FakeOllama | FakeCloud, finder: FakeSearch | None = None) -> list:
    return asyncio.run(run_case(CASE_OK, model_mode(fake), finder or FakeSearch(VECTOR)))


def tool_answers(body: dict) -> list[str]:
    return [m["content"] for m in body["messages"] if m["role"] == "tool"]


def test_the_first_draft_has_no_papers_and_offers_the_search_tool():
    fake = FakeOllama([answer()])
    run(fake)
    (body,) = chat_bodies(fake)
    system = body["messages"][0]["content"]
    assert "PAPER SCIENTIFICI RECUPERATI" not in system and LABEL not in system
    assert "search_papers" in system
    # I numeri dell'atleta, la regola di selezione e i protocolli ammessi restano.
    assert "REGOLA DI SELEZIONE DI OGGI" in system and f"- {PROTOCOL}:" in system
    assert body["messages"][1]["content"].startswith("STATO ATLETA:")
    (tool,) = body["tools"]
    assert tool["function"]["name"] == "search_papers"
    assert tool["function"]["parameters"]["required"] == ["text"]


def test_a_search_returns_what_the_fixed_search_gives_for_that_text_and_its_passages_can_be_cited():
    fake, finder = FakeOllama([asks("polarized training recovery"), answer(LABEL)]), FakeSearch(VECTOR)
    result = run(fake, finder)[-1]
    assert finder.texts == ["polarized training recovery"]
    first, second = chat_bodies(fake)
    assert tool_answers(second) == ["\n\n".join(prompts.paper_entry(p) for p in FOUND)]
    assert second["messages"][:2] == first["messages"]
    assert result["fellBack"] is False and result["drafts"][0]["check"]["ok"] is True
    assert [p["pmid"] for p in result["retrievedPapers"]] == [p["pmid"] for p in FOUND]


def test_search_text_is_trimmed_and_cut_to_300_characters():
    finder = FakeSearch(VECTOR)
    run(FakeOllama([asks("  " + "x" * 400 + "  "), answer()]), finder)
    assert finder.texts == ["x" * 300]


def test_the_fourth_search_of_a_draft_is_refused_and_searches_nothing():
    fake, finder = FakeOllama([asks("a", "b"), asks("c", "d"), answer()]), FakeSearch(VECTOR)
    run(fake, finder)
    assert finder.texts == ["a", "b", "c"]
    assert tool_answers(chat_bodies(fake)[-1])[-1] == prompts.SEARCH_LIMIT


def test_empty_unknown_and_broken_asks_get_an_answer_and_count_toward_the_three():
    fake, finder = FakeOllama([asks("   "), asks(name="open_strava", arguments={"text": "x"}),
                               asks(arguments={"testo": "x"}), asks("d"), answer()]), FakeSearch(VECTOR)
    run(fake, finder)
    assert finder.texts == []
    assert tool_answers(chat_bodies(fake)[-1]) == [prompts.SEARCH_EMPTY, prompts.SEARCH_UNKNOWN_TOOL,
                                                    prompts.SEARCH_BAD, prompts.SEARCH_LIMIT]


def test_a_search_that_finds_nothing_says_so(monkeypatch):
    monkeypatch.setattr(papers, "top_papers", lambda index, vector: [])
    fake = FakeOllama([asks("nulla"), answer()])
    run(fake)
    assert tool_answers(chat_bodies(fake)[-1]) == [prompts.SEARCH_NOTHING]


def test_three_refused_asks_end_the_draft_as_unusable_and_the_check_sends_it_back():
    fake = FakeOllama([asks("a", "b", "c"), asks("d"), asks("e"), asks("f"), answer()])
    result = run(fake)[-1]
    assert [d["check"]["causes"] for d in result["drafts"]] == [["unreadable"], []]
    assert result["fellBack"] is False


def test_a_retry_draft_can_cite_a_passage_found_in_the_first_draft_and_gets_its_own_searches():
    fake, finder = FakeOllama([asks("recovery"), "testo senza JSON", asks("a", "b", "c"), answer(LABEL)]), \
        FakeSearch(VECTOR)
    result = run(fake, finder)[-1]
    assert finder.texts == ["recovery", "a", "b", "c"]
    last = chat_bodies(fake)[-1]
    # La seconda bozza rilegge la prima: la ricerca, la sua risposta, il testo e i motivi.
    assert tool_answers(last)[0] == "\n\n".join(prompts.paper_entry(p) for p in FOUND)
    assert [d["check"]["ok"] for d in result["drafts"]] == [False, True]


def test_an_answer_citing_without_searching_fails_the_check_as_not_given():
    result = run(FakeOllama([answer(LABEL)] * MAX_DRAFTS))[-1]
    assert result["drafts"][0]["check"]["causes"] == ["invented"]


def test_the_same_paper_found_twice_is_one_paper():
    result = run(FakeOllama([asks("a", "b"), answer(LABEL)]))[-1]
    pmids = [p["pmid"] for p in result["retrievedPapers"]]
    assert pmids == [p["pmid"] for p in FOUND] and len(set(pmids)) == len(pmids)


def test_an_unreadable_index_during_a_search_stops_with_the_index_message(monkeypatch):
    def broken(index, vector):
        raise papers.PaperIndexError("Indice dei paper illeggibile")
    monkeypatch.setattr(papers, "top_papers", broken)
    with pytest.raises(Exception, match="Indice dei paper illeggibile"):
        run(FakeOllama([asks("a"), answer()]))


def test_an_ollama_model_without_tools_stops_with_a_message_naming_it_and_the_fixed_mode():
    fake = FakeOllama(answer())
    fake.status, fake.error = 400, "registry.ollama.ai/library/gemma:2b does not support tools"
    with pytest.raises(Exception) as caught:
        run(fake)
    message = str(caught.value)
    assert "qwen2.5:7b" in message and "COACH_SEARCH_MODE=fixed" in message


def test_the_fixed_mode_sends_no_tools_and_the_papers_in_the_prompt():
    fake = FakeOllama(CASE_OK["answer"])
    asyncio.run(run_case(CASE_OK, fake))
    (body,) = chat_bodies(fake)
    assert "tools" not in body and "PAPER SCIENTIFICI RECUPERATI" in body["messages"][0]["content"]



def test_a_cloud_model_searches_and_reads_the_answers_by_the_id_of_its_ask():
    fake, finder = FakeCloud([asks("polarized recovery"), answer(LABEL)]), FakeSearch(VECTOR)
    result = run(fake, finder)[-1]
    assert finder.texts == ["polarized recovery"]
    first, second = chat_bodies(fake)
    assert [t["function"]["name"] for t in first["tools"]] == ["search_papers"]
    asked, replied = second["messages"][2:4]
    assert asked["tool_calls"] == [{"id": "call_0", "type": "function", "function": {
        "name": "search_papers", "arguments": json.dumps({"text": "polarized recovery"})}}]
    assert replied == {"role": "tool", "tool_call_id": "call_0",
                       "content": "\n\n".join(prompts.paper_entry(p) for p in FOUND)}
    assert result["fellBack"] is False


def test_every_cloud_turn_of_a_draft_is_charged_and_the_draft_sums_them(cloud_spending):
    result = run(FakeCloud([asks("a"), asks("b"), answer()]))[-1]
    (draft,) = result["drafts"]
    assert (draft["inputTokens"], draft["outputTokens"]) == (2700, 126)
    assert draft["cost"] == pytest.approx(3 * TURN_CHARGE)
    assert cloud_spending.total() == pytest.approx(3 * TURN_CHARGE)


def test_a_turn_without_token_counts_makes_the_cost_unknown():
    fake = FakeCloud([asks("a"), answer()])
    fake.usage = None
    result = run(fake)[-1]
    assert result["cost"] is None and result["drafts"][0]["cost"] is None


def test_with_the_cap_reached_after_a_search_no_turn_starts_and_the_fallback_rules_say_why(cloud_spending):
    cloud_spending.add(CLOUD_PRICES.limit - TURN_CHARGE / 2)
    fake = FakeCloud([asks("a"), answer(LABEL)])
    result = run(fake)[-1]
    assert len(chat_bodies(fake)) == 1
    assert result["fellBack"] is True and result["fallbackCause"] == "spending_cap"
    assert "tetto di spesa" in result["fallbackWarning"]
    assert result["title"] and result["struttura"]


def test_a_cloud_endpoint_refusing_tools_stops_with_the_message_and_the_provider_text():
    fake = FakeCloud(answer())
    fake.status, fake.error = 400, {"error": {"message": "tools are not supported by this model"}}
    with pytest.raises(Exception) as caught:
        run(fake)
    message = str(caught.value)
    assert "COACH_SEARCH_MODE=fixed" in message and "tools are not supported by this model" in message
