"""Prompt e query di ricerca: carattere per carattere quelli del codice del browser, per
lo stesso contesto atleta e gli stessi paper (fixtures/coach_expected.json), tranne la sezione
delle regole di selezione, che viene dalle regole del servizio, quella dei paper, che dà i
passaggi al posto degli abstract, e la fine della query, che nomina i protocolli ammessi."""

from zoneinfo import ZoneInfo

import pytest

from app.metrics import coach_context
from app.papers import top_papers
from app import prompts
from app.prompts import prompt_version, retrieval_query, system_prompt, user_prompt
from app.selection_rules import RULES
from fixture_data import (DETAILS, NOW_MS, RIDES, case_context, load, profile, rules_section, scenario,
                          service_query, with_service_sections)

INDEX = load("papers_index.json")
CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")
PROMPT_CASES = [c for c in CASES["cases"] if "messages" in EXPECTED["cases"][c["name"]]]


@pytest.mark.parametrize("case", PROMPT_CASES, ids=lambda c: c["name"])
def test_prompts_and_query_match_the_browser(case):
    exp = EXPECTED["cases"][case["name"]]
    ctx = case_context(case)
    papers = top_papers(INDEX, CASES["queries"][case["query"]])
    assert retrieval_query(ctx, case["duration"]) == service_query(exp["query"], ctx, case["duration"])
    assert system_prompt(papers) == with_service_sections(exp["messages"][0]["content"], papers)
    assert user_prompt(ctx, case["duration"]) == exp["messages"][1]["content"]


@pytest.mark.parametrize("tsb, hard, minutes, end", [
    # Le regole ammettono solo il riposo: la ricerca nomina il riposo.
    (-30, 20, 60, "overreaching recovery active rest pyramidal training intensity distribution Riposo"),
    # Quota dura sconosciuta: niente parole sulla quota dura, ma i protocolli ammessi ci sono.
    (0, None, 90, "threshold sweet spot baseline training Z2 Aerobico Z2 + cadence drills Z2 progressivo"),
    # Seiler 4×8 e Over-Under non entrano in 55 minuti: non sono ammessi, quindi non sono nominati.
    (12, 20, 55, "high readiness peak performance VO2max pyramidal training intensity distribution "
                 "Seiler 4×4' (VO2max) Rønnestad 30/15"),
], ids=["only-rest", "hard-share-unknown", "only-what-fits"])
def test_the_search_text_ends_with_the_names_of_the_protocols_the_rules_allow(tsb, hard, minutes, end):
    ctx = {"tsb": tsb, "polarizzazione": {"hardPct": hard}, "tier": "Mid volume"}
    assert retrieval_query(ctx, minutes) == f"cycling endurance training adaptation {end}"


def test_each_paper_is_listed_once_followed_by_its_passages_with_their_labels():
    paper = {"pmid": "21812820", "authors": "Seiler et al.", "year": "2013", "title": "Adaptations to aerobic interval "
             "training.", "abstract": "Non va nel prompt.",
             "passages": [{"label": "PMID:21812820 §1", "text": "Primo passaggio.", "score": 0.81},
                          {"label": "PMID:21812820 §3", "text": "Terzo passaggio.", "score": 0.84}]}
    assert ("PAPER SCIENTIFICI RECUPERATI (cita SOLO questi passaggi, con la loro etichetta, mai altri):\n"
            "[PMID:21812820] Seiler et al. 2013. Adaptations to aerobic interval training.\n"
            "[PMID:21812820 §1] Primo passaggio.\n"
            "[PMID:21812820 §3] Terzo passaggio.\n\nOUTPUT —") in system_prompt([paper])
    assert "Abstract" not in system_prompt([paper])


def test_prompt_cases_cover_the_tricky_values():
    users = [EXPECTED["cases"][c["name"]]["messages"][1]["content"] for c in PROMPT_CASES]
    assert any("Volume target: nullh/sett su null giorni" in u for u in users)      # null come JavaScript
    assert any("LTHR: — bpm · Peso: — kg" in u for u in users)                      # valori mancanti
    assert any("Nessuna attività bici negli ultimi 7 giorni." in u for u in users)
    assert any("OGGI: sabato" in u for u in users) and any("OGGI: venerdì" in u for u in users)


def test_rules_section_lists_every_selection_rule_in_order_with_its_source():
    section = rules_section(system_prompt([]))
    assert "\n".join(f"{n}. {r.sentence()}" for n, r in enumerate(RULES, 1)) in section
    assert ("Durata minima: sweet_spot_3x15 50', threshold_3x10 55', seiler_4x8 60', seiler_4x4 48', "
            "ronnestad_30_15 55', over_under 64', z2_cadence_drills 46', tempo_2x20 60'.") in section
    # Le fonti dicono da dove viene la regola: si citano solo i passaggi recuperati.
    assert "cita solo i passaggi dei paper recuperati" in section
    for old in ("la prima che matcha vince", "Caso default", "REGOLA NEGATIVA"):
        assert old not in system_prompt([])


def test_the_answer_cites_passages_by_label_in_the_rationale_and_lists_the_labels_used():
    prompt = system_prompt([])
    assert ('{"protocolId":"<id_dal_catalogo>","razionale":"<2-3 frasi italiane che giustificano la scelta citando '
            'TSB, polarizzazione, e quando rilevante il passaggio su cui ti basi con la sua etichetta, come '
            '[PMID:xxx §n]>","passaggiUsati":["PMID:xxx §n"]}') in prompt
    assert ("- passaggiUsati può essere [] se nessun passaggio recuperato è davvero rilevante; altrimenti includi "
            "solo le etichette dei passaggi che hai citato nel razionale") in prompt
    assert "- Non inventare etichette: usa solo quelle dei passaggi forniti sopra" in prompt
    assert "paperUsati" not in prompt


def test_the_prompt_version_differs_from_the_runs_in_eval_runs():
    # Le versioni del prompt delle corse «prima» e «dopo» in eval-runs/, che davano gli abstract.
    assert prompt_version() not in ("07cc6501", "d146523f")


def test_the_prompt_version_changes_with_the_form_of_the_papers_section(monkeypatch):
    version = prompt_version()
    monkeypatch.setattr(prompts, "paper_entry", lambda p: f"[PMID:{p['pmid']}] {p['title']}")
    assert prompt_version() != version


def test_a_placeholder_inside_a_passage_stays_as_written():
    first = INDEX["papers"][0]
    passage = {**first["passages"][0], "text": "<PROTOCOL_LIST> <SELECTION_RULES> <PAPERS_BLOCK>"}
    paper = {**first, "passages": [passage]}
    assert system_prompt([paper]).count(f"[{passage['label']}] <PROTOCOL_LIST> <SELECTION_RULES> <PAPERS_BLOCK>") == 1


def test_prompts_hold_no_activity_name_or_place():
    """Con un provider cloud i prompt lasciano il computer: devono avere numeri e date delle
    corse, mai il nome che l'atleta ha dato a un'attività né dove l'ha fatta."""
    case = PROMPT_CASES[0]
    sc = scenario(case["scenario"])
    named = [{**a, "name": f"Giro segreto {a['id']}", "start_latlng": [45.4371, 10.9917],
              "map": {"summary_polyline": "polilinea_segreta"}} for a in RIDES["activities"]]
    ctx = coach_context(named, DETAILS, profile(sc["profile"]), NOW_MS, ZoneInfo(case["timeZone"]))
    papers = top_papers(INDEX, CASES["queries"][case["query"]])
    prompts = [system_prompt(papers), user_prompt(ctx, case["duration"]), retrieval_query(ctx, case["duration"])]
    assert "(Ride):" in prompts[1]                       # le corse recenti ci sono
    for secret in ("Giro segreto", "45.4371", "10.9917", "polilinea_segreta"):
        assert all(secret not in p for p in prompts)


def test_whole_kilometres_print_without_decimals_like_javascript():
    ctx = case_context(PROMPT_CASES[0])
    ctx["recentDays"] = [{"data": "2026-11-05", "tipo": "Ride", "durataMin": 60, "distanzaKm": 42.0,
                          "avgWatts": None, "avgHr": None}]
    assert "- 2026-11-05 (Ride): 60min, 42km\n" in user_prompt(ctx, 60)
