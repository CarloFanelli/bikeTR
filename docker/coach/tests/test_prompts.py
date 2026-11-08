"""Prompt e query di ricerca: carattere per carattere quelli del codice del browser, per
lo stesso contesto atleta e gli stessi paper (fixtures/coach_expected.json), tranne la sezione
delle regole di selezione, che viene dalle regole del servizio."""

from zoneinfo import ZoneInfo

import pytest

from app.metrics import coach_context
from app.papers import top_papers
from app.prompts import prompt_version, retrieval_query, system_prompt, user_prompt
from app.selection_rules import RULES
from fixture_data import DETAILS, NOW_MS, RIDES, activities, load, profile, rules_section, scenario, with_service_rules

INDEX = load("papers_index.json")
CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")
PROMPT_CASES = [c for c in CASES["cases"] if "messages" in EXPECTED["cases"][c["name"]]]


def context(case: dict) -> dict:
    sc = scenario(case["scenario"])
    return coach_context(activities(sc), DETAILS, profile(sc["profile"]), NOW_MS, ZoneInfo(case["timeZone"]))


@pytest.mark.parametrize("case", PROMPT_CASES, ids=lambda c: c["name"])
def test_prompts_and_query_match_the_browser(case):
    exp = EXPECTED["cases"][case["name"]]
    ctx = context(case)
    papers = top_papers(INDEX, CASES["queries"][case["query"]])
    assert retrieval_query(ctx, case["duration"]) == exp["query"]
    assert system_prompt(papers) == with_service_rules(exp["messages"][0]["content"])
    assert user_prompt(ctx, case["duration"]) == exp["messages"][1]["content"]


def test_prompt_cases_cover_every_paper_and_the_tricky_values():
    shown = {p["pmid"] for c in PROMPT_CASES for p in top_papers(INDEX, CASES["queries"][c["query"]])}
    assert shown == {p["pmid"] for p in INDEX["papers"]}
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
    # Le fonti dicono da dove viene la regola: si citano solo i paper recuperati.
    assert "cita solo i PMID dei paper recuperati" in section
    for old in ("la prima che matcha vince", "Caso default", "REGOLA NEGATIVA"):
        assert old not in system_prompt([])


def test_the_prompt_version_differs_from_the_before_runs():
    # La versione del prompt delle corse «prima» in eval-runs/.
    assert prompt_version() != "07cc6501"


def test_a_placeholder_inside_an_abstract_stays_as_written():
    paper = {**INDEX["papers"][0], "abstract": "<PROTOCOL_LIST> <SELECTION_RULES> <PAPERS_BLOCK>"}
    assert system_prompt([paper]).count("Abstract: <PROTOCOL_LIST> <SELECTION_RULES> <PAPERS_BLOCK>") == 1


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
    ctx = context(PROMPT_CASES[0])
    ctx["recentDays"] = [{"data": "2026-11-05", "tipo": "Ride", "durataMin": 60, "distanzaKm": 42.0,
                          "avgWatts": None, "avgHr": None}]
    assert "- 2026-11-05 (Ride): 60min, 42km\n" in user_prompt(ctx, 60)
