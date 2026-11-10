"""Il controllo di una bozza oltre la forma: la regola di selezione di oggi deve ammettere il protocollo, e
le citazioni devono stare tra i passaggi dati. Alla terza bozza, solo citazioni sbagliate tengono la scelta
del modello senza quelle citazioni; una regola infranta lascia la scelta alle regole di ripiego."""

import asyncio
import json

from app import graph, main, papers
from app.check import check_draft
from fakes import INDEX, FakeOllama, FakeSearch, fixture_index
from fixture_data import case_context
from test_workout import CASE, CASES

SITUATION = CASE["valid-answer"]
VECTOR = CASES["queries"][SITUATION["query"]]
RETRIEVED = papers.top_papers(INDEX, VECTOR)
GIVEN = RETRIEVED[0]["passages"][0]["label"]
# Forma −12 e 22% di lavoro duro: la regola "un po' stanco", che ammette solo i giorni Z2.
TIRED = {**case_context(SITUATION), "tsb": -12}
# 35% di lavoro duro: la regola "già stressato", con la sua fonte Seiler 2010 (20861519) accanto alla regola.
STRESSED = {**TIRED, "tsb": 0, "polarizzazione": {**TIRED["polarizzazione"], "hardPct": 35}}


def answer(protocol_id: str, *labels: str, rationale: str = "Forma bassa.") -> str:
    return json.dumps({"protocolId": protocol_id, "razionale": rationale, "passaggiUsati": list(labels)},
                      ensure_ascii=False)


def run(ctx: dict, answers: list[str]) -> tuple[dict, FakeOllama]:
    fake = FakeOllama(answers)

    async def go():
        async with fake.client() as client:
            return await graph.from_context(ctx, 60, lambda event: None, chat=fake.chat, chat_client=client,
                                            embed=FakeSearch(VECTOR).encode, load_index=fixture_index,
                                            spending=main.cloud_spending)
    return asyncio.run(go()), fake


def test_a_protocol_the_rule_of_today_does_not_allow_goes_back_naming_the_allowed_ones():
    verdict = check_draft(answer("seiler_4x8"), False, TIRED, 60, RETRIEVED)
    assert verdict.causes == ("not_allowed",)
    assert verdict.reasons == ("Seiler 4×8' (FTP/VO2) (seiler_4x8) non è ammesso oggi: con la forma, la quota dura e i "
                               "60 minuti di oggi la regola di selezione ammette solo z2_endurance (Z2 Aerobico), "
                               "z2_cadence_drills (Z2 + cadence drills), z2_progressive (Z2 progressivo).",)


def test_tsb_minus_12_and_seiler_is_sent_back_and_the_z2_second_draft_is_delivered():
    result, fake = run(TIRED, [answer("seiler_4x8"), answer("z2_endurance", GIVEN)])
    second = fake.requests[1][1]["messages"]
    assert "seiler_4x8) non è ammesso oggi" in second[-1]["content"]
    assert (result["protocolId"], result["fellBack"]) == ("z2_endurance", False)
    assert [d["check"]["causes"] for d in result["drafts"]] == [["not_allowed"], []]


def test_a_label_not_given_goes_back_named():
    not_given = "PMID:99999999 §3"
    verdict = check_draft(answer("z2_endurance", GIVEN, not_given), False, TIRED, 60, RETRIEVED)
    assert verdict.causes == ("invented",) and verdict.invented == (("99999999", 3),)
    assert verdict.reasons == (f"Hai citato {not_given}, che non sono tra i passaggi forniti: cita solo le etichette "
                               "dei passaggi forniti, o lascia passaggiUsati vuoto.",)


def test_breaking_the_rule_and_inventing_a_citation_sends_both_reasons_back():
    verdict = check_draft(answer("seiler_4x8", rationale="Come in [PMID:99999999]."), False, TIRED, 60, RETRIEVED)
    assert verdict.causes == ("not_allowed", "invented") and len(verdict.reasons) == 2


def test_an_empty_citation_list_passes():
    assert check_draft(answer("z2_endurance"), False, TIRED, 60, RETRIEVED).ok


def test_the_source_of_the_rule_of_today_counts_as_given_but_its_passages_do_not():
    # La ricerca non ha trovato Seiler 2010.
    others = [p for p in RETRIEVED if p["pmid"] != "20861519"]
    cites_source = answer("z2_endurance", rationale="Come in [PMID:20861519].")
    assert check_draft(cites_source, False, STRESSED, 60, others).ok
    verdict = check_draft(answer("z2_endurance", "PMID:20861519 §1"), False, STRESSED, 60, others)
    assert verdict.causes == ("invented",)
    # Con un'altra regola la stessa fonte non è stata mostrata accanto alla regola di oggi.
    assert check_draft(cites_source, False, TIRED, 60, others).causes == ("invented",)


def test_a_third_draft_wrong_only_on_citations_keeps_the_protocol_and_rationale_without_them():
    wrong = answer("z2_endurance", GIVEN, "PMID:99999999 §3", rationale="Forma bassa [PMID:99999999 §3].")
    result, fake = run(TIRED, [wrong])
    assert len(fake.requests) == 3
    assert (result["protocolId"], result["razionale"], result["fellBack"]) == ("z2_endurance",
                                                                              "Forma bassa [PMID:99999999 §3].", False)
    assert result["citationsDropped"] == ["PMID:99999999 §3"] and result["fallbackCause"] is None
    assert [p["pmid"] for p in result["paperRefs"]] == [RETRIEVED[0]["pmid"]]


def test_a_third_draft_not_allowed_today_gets_the_fallback_rules_and_the_card_says_so():
    result, fake = run(TIRED, [answer("seiler_4x8", "PMID:99999999 §3")])
    assert len(fake.requests) == 3
    assert (result["protocolId"], result["fellBack"], result["fallbackCause"]) == ("z2_endurance", True, "not_allowed")
    assert result["fallbackWarning"] == ("⚠️ Il modello ha scelto Seiler 4×8' (FTP/VO2), che non è ammesso oggi: il "
                                         "Coach ha scelto con le regole di selezione.")
    assert result["citationsDropped"] == []
