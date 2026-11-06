"""Prompt e query di ricerca: carattere per carattere quelli del codice del browser, per
lo stesso contesto atleta e gli stessi paper (fixtures/coach_expected.json)."""

from zoneinfo import ZoneInfo

import pytest

from app.metrics import coach_context
from app.papers import top_papers
from app.prompts import retrieval_query, system_prompt, user_prompt
from fixture_data import DETAILS, NOW_MS, activities, load, profile, scenario

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
    assert system_prompt(papers) == exp["messages"][0]["content"]
    assert user_prompt(ctx, case["duration"]) == exp["messages"][1]["content"]


def test_prompt_cases_cover_every_paper_and_the_tricky_values():
    shown = {p["pmid"] for c in PROMPT_CASES for p in top_papers(INDEX, CASES["queries"][c["query"]])}
    assert shown == {p["pmid"] for p in INDEX["papers"]}
    users = [EXPECTED["cases"][c["name"]]["messages"][1]["content"] for c in PROMPT_CASES]
    assert any("Volume target: nullh/sett su null giorni" in u for u in users)      # null come JavaScript
    assert any("LTHR: — bpm · Peso: — kg" in u for u in users)                      # valori mancanti
    assert any("Nessuna attività bici negli ultimi 7 giorni." in u for u in users)
    assert any("OGGI: sabato" in u for u in users) and any("OGGI: venerdì" in u for u in users)


def test_whole_kilometres_print_without_decimals_like_javascript():
    ctx = context(PROMPT_CASES[0])
    ctx["recentDays"] = [{"data": "2026-11-05", "tipo": "Ride", "durataMin": 60, "distanzaKm": 42.0,
                          "avgWatts": None, "avgHr": None}]
    assert "- 2026-11-05 (Ride): 60min, 42km\n" in user_prompt(ctx, 60)
