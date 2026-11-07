"""Regole di selezione: per ogni forma, quota dura (anche sconosciuta) e durata da 30 a 240
minuti, almeno un protocollo ammesso, e ognuno entra nei minuti; la prima regola che vale vince,
riposo e recupero prima della durata, la durata prima delle altre; ogni soglia sta in una sola
regola; ogni regola dice la sua fonte, e un PMID è un paper che la ricostruzione dell'indice scarica."""

import itertools

import pytest

from app import selection_rules
from app.build_index import SEARCHES
from app.protocols import PROTOCOLS
from app.selection_rules import RULES

TSB = range(-60, 41)
HARD = [None, *range(0, 101)]
# Il workout più corto che il Coach propone è di 30 minuti.
MINUTES = range(30, 241)


def select(tsb, hard, minutes):
    rule, allowed = selection_rules.select({"tsb": tsb, "polarizzazione": {"hardPct": hard}}, minutes)
    return rule.name, allowed


def test_every_situation_gets_protocols_that_fit_its_minutes_and_every_rule_is_used():
    # Il Coach passa a Z2 quando il build di un protocollo rinuncia: qui nessuno deve rinunciare.
    builds = {(pid, m): PROTOCOLS[pid].build(250, m) is not None for pid in PROTOCOLS for m in MINUTES}
    used, problems = set(), []
    for tsb, hard, minutes in itertools.product(TSB, HARD, MINUTES):
        name, allowed = select(tsb, hard, minutes)
        used.add(name)
        if not allowed or not all(builds[pid, minutes] for pid in allowed):
            problems.append((tsb, hard, minutes, name, allowed))
    assert problems[:5] == []
    assert used == {r.name for r in RULES}


def test_rules_name_only_catalog_protocols_and_have_distinct_names():
    assert {pid for r in RULES for pid in r.protocols} <= set(PROTOCOLS)
    assert len({r.name for r in RULES}) == len(RULES)


@pytest.mark.parametrize("tsb, hard, minutes, rule", [
    (-20, 20, 150, "recupero"),       # il recupero vince sull'uscita lunga
    (-30, 20, 120, "riposo"),
    (0, 5, 40, "poco_tempo"),         # poco tempo vince sulla seduta di qualità
    (15, 40, 150, "uscita_lunga"),    # la durata vince sulla quota dura
    (0, None, 60, "ripresa"),
    (-12, 10, 60, "un_po_stanco"),    # oggi nessuna regola copre TSB -12 con hard 10%
    (8, 20, 60, "base"),              # oggi nessuna regola copre TSB +8 con hard 20%
])
def test_overlapping_rules_resolve_in_order(tsb, hard, minutes, rule):
    assert select(tsb, hard, minutes)[0] == rule


@pytest.mark.parametrize("below, on, rules", [
    ((-26, 20, 60), (-25, 20, 60), ("riposo", "recupero")),
    ((-16, 20, 60), (-15, 20, 60), ("recupero", "un_po_stanco")),
    ((-11, 20, 60), (-10, 20, 60), ("un_po_stanco", "base")),
    ((4, 10, 60), (5, 10, 60), ("sotto_stimolato", "sotto_stimolato_fresco")),
    ((9, 20, 60), (10, 20, 60), ("base", "fresco")),
    ((0, 14, 60), (0, 15, 60), ("sotto_stimolato", "base")),
    ((0, 29, 60), (0, 30, 60), ("base", "gia_stressato")),
    ((0, 20, 49), (0, 20, 50), ("poco_tempo", "base")),
    ((0, 20, 119), (0, 20, 120), ("base", "uscita_lunga")),
])
def test_a_value_on_a_cut_off_belongs_to_the_rule_that_says_or_more(below, on, rules):
    assert (select(*below)[0], select(*on)[0]) == rules


def test_sweet_spot_is_offered_only_from_50_minutes_and_threshold_from_55():
    assert select(0, 10, 49)[1] == ["z2_endurance", "z2_progressive"]
    assert select(0, 10, 54)[1] == ["sweet_spot_3x15"]
    assert select(0, 10, 55)[1] == ["sweet_spot_3x15", "threshold_3x10"]


def test_every_rule_says_its_source_in_its_sentence():
    for rule in RULES:
        source = f"[PMID:{rule.source_pmid}]" if rule.source_pmid else "[pratica]"
        assert rule.sentence().endswith(source), rule.name


def test_rule_sentences_state_conditions_and_protocols():
    sentences = {r.name: r.sentence() for r in RULES}
    assert sentences["riposo"] == "TSB sotto -25: rest [pratica]"
    assert sentences["sotto_stimolato_fresco"] == (
        "Hard sotto il 15% e TSB da +5 in su: seiler_4x8, sweet_spot_3x15, threshold_3x10 o tempo_2x20 "
        "[PMID:24550842]")
    assert sentences["base"].startswith("In tutti gli altri casi: ")


def test_rule_papers_are_fetched_by_the_index_rebuild():
    fetched = {pmid for _, _, pmid in SEARCHES}
    assert {r.name: r.source_pmid for r in RULES if r.source_pmid and r.source_pmid not in fetched} == {}
