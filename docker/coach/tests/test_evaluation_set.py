"""Il set di valutazione: 25–30 situazioni inventate, ognuna con i numeri che il prompt mostra,
i minuti, la regola che prova e i protocolli ammessi scritti a mano. I test confrontano questi
con le regole di selezione, così un errore nelle liste o nelle regole fa fallire un test che nomina
la situazione; ogni regola ha almeno due situazioni e ogni soglia una situazione esattamente sopra."""

import json
from collections import Counter
from dataclasses import fields
from zoneinfo import ZoneInfo

import pytest

from app import grading, selection_rules
from app.metrics import capacity_tier, coach_context
from app.prompts import retrieval_query, user_prompt
from app.protocols import PROTOCOLS
from app.selection_rules import RULES, Rule
from fixture_data import DETAILS, NOW_MS, RIDES, profile

SITUATIONS = json.loads(grading.SITUATIONS_FILE.read_text(encoding="utf-8"))
# Un contesto vero del Coach, dalle corse inventate dei test: le chiavi che le situazioni devono avere.
REAL_CONTEXT = coach_context(RIDES["activities"], DETAILS, profile("base"), NOW_MS, ZoneInfo("Europe/Rome"))
EACH_SITUATION = pytest.mark.parametrize("situation", SITUATIONS, ids=lambda s: s["name"])


def hard(situation):
    return situation["context"]["polarizzazione"]["hardPct"]


def test_the_set_has_25_to_30_situations_with_distinct_names():
    assert 25 <= len(SITUATIONS) <= 30
    assert [n for n, k in Counter(s["name"] for s in SITUATIONS).items() if k > 1] == []


@EACH_SITUATION
def test_situation_has_a_one_line_description_and_30_to_240_minutes(situation):
    assert situation["description"].strip() and "\n" not in situation["description"]
    assert isinstance(situation["minutes"], int) and 30 <= situation["minutes"] <= 240


@EACH_SITUATION
def test_situation_has_the_keys_of_the_coach_context(situation):
    ctx = situation["context"]
    assert ctx.keys() == REAL_CONTEXT.keys()
    assert ctx["polarizzazione"].keys() == REAL_CONTEXT["polarizzazione"].keys()
    assert all(ride.keys() == REAL_CONTEXT["recentDays"][0].keys() for ride in ctx["recentDays"])


@EACH_SITUATION
def test_prompt_and_search_query_are_built_for_the_situation(situation):
    # Una chiave sbagliata fermerebbe la corsa a metà sul computer dove gira il modello.
    prompt = user_prompt(situation["context"], situation["minutes"])
    assert f"DURATA DISPONIBILE: {situation['minutes']} minuti" in prompt
    assert retrieval_query(situation["context"], situation["minutes"])


@EACH_SITUATION
def test_situation_numbers_agree_with_each_other_as_in_the_app(situation):
    ctx, pol = situation["context"], situation["context"]["polarizzazione"]
    # Senza FTP il Coach non propone nessun workout.
    assert ctx["ftp"]
    # Il Coach arrotonda forma, fitness e fatica ognuna per conto suo: possono differire di 1.
    assert abs(ctx["ctl"] - ctx["atl"] - ctx["tsb"]) <= 1
    assert ctx["tier"] == capacity_tier(ctx["weeklyHours"], ctx["ctl"])
    if pol["hardPct"] is None:
        # Nessuna uscita in 28 giorni: niente volume e niente uscite negli ultimi 7.
        assert (pol["easyPct"], pol["totalMin"], ctx["recentDays"]) == (None, 0, [])
    else:
        assert pol["easyPct"] + pol["hardPct"] == 100
        assert sum(ride["durataMin"] for ride in ctx["recentDays"]) <= pol["totalMin"]
    if ctx["lthr"] is None:
        # Senza soglia cardiaca nessuna uscita conta come dura.
        assert pol["hardPct"] in (0, None)


@EACH_SITUATION
def test_situation_names_a_rule_and_catalog_protocols(situation):
    assert situation["rule"] in {r.name for r in RULES}
    assert situation["allowed"]
    assert [pid for pid in situation["allowed"] if pid not in PROTOCOLS] == []


def test_allowed_lists_match_the_selection_rules():
    differences = []
    for s in SITUATIONS:
        rule, allowed = selection_rules.select(s["context"], s["minutes"])
        if (s["rule"], s["allowed"]) != (rule.name, allowed):
            differences.append(f"{s['name']}: scritto {s['rule']} {s['allowed']}, "
                               f"le regole danno {rule.name} {allowed}")
    assert differences == []


def test_every_rule_is_tested_by_at_least_two_situations():
    count = Counter(s["rule"] for s in SITUATIONS)
    assert [r.name for r in RULES if count[r.name] < 2] == []


def test_every_threshold_has_a_situation_exactly_on_it():
    def value(situation, quantity):
        return {"tsb": situation["context"]["tsb"], "hard": hard(situation),
                "minutes": situation["minutes"]}[quantity]

    thresholds = {(f.name.rsplit("_", 1)[0], getattr(rule, f.name))
                  for rule in RULES for f in fields(Rule)
                  if f.name.endswith(("_below", "_from")) and getattr(rule, f.name) is not None}
    missing = [f"{quantity} {threshold}" for quantity, threshold in sorted(thresholds)
               if not any(value(s, quantity) == threshold for s in SITUATIONS)]
    assert missing == []


def test_some_situations_lack_threshold_heart_rate_weight_or_hard_share_and_show_a_dash():
    no_lthr = [s for s in SITUATIONS if s["context"]["lthr"] is None]
    no_weight = [s for s in SITUATIONS if s["context"]["weight"] is None]
    no_hard = [s for s in SITUATIONS if hard(s) is None]
    assert no_lthr and no_weight and no_hard
    assert "LTHR: — bpm" in user_prompt(no_lthr[0]["context"], no_lthr[0]["minutes"])
    assert "Peso: — kg" in user_prompt(no_weight[0]["context"], no_weight[0]["minutes"])
    assert "hard —%" in user_prompt(no_hard[0]["context"], no_hard[0]["minutes"])
