"""I numeri del servizio sono quelli del browser: stesse attività inventate, stesso
risultato di fixtures/metrics_expected.json, prodotto eseguendo il codice del browser
(reference/make_reference.mjs)."""

from zoneinfo import ZoneInfo

import pytest

from app.jscompat import days_ago, instant_ms, js_round, js_sum
from app.metrics import (activity_load, capacity_tier, coach_context, details_hrtss, details_tss,
                         form_trend)
from fixture_data import DETAILS, NOW_MS, RIDES, activities, load, profile

EXPECTED = load("metrics_expected.json")
CASES = [(tz, sc) for tz in RIDES["timeZones"] for sc in RIDES["scenarios"]]


def expected(tz: str, sc: dict) -> dict:
    return EXPECTED[tz]["scenarios"][sc["name"]]


@pytest.mark.parametrize("tz,sc", CASES, ids=[f"{tz}-{sc['name']}" for tz, sc in CASES])
def test_ride_details_give_the_browser_np_tss_and_hrtss(tz, sc):
    p = profile(sc["profile"])
    for ride_id, exp in expected(tz, sc)["rides"].items():
        d = DETAILS[int(ride_id)]
        if exp["NP"] is not None:
            assert js_round(d["np"]) == exp["NP"], ride_id
        assert details_tss(d, p.ftp) == exp["TSS"], ride_id
        assert details_hrtss(d, p.lthr) == exp["hrTSS"], ride_id


@pytest.mark.parametrize("tz,sc", CASES, ids=[f"{tz}-{sc['name']}" for tz, sc in CASES])
def test_activity_loads_match_the_browser(tz, sc):
    p = profile(sc["profile"])
    loads = {str(a["id"]): activity_load(a, DETAILS.get(a["id"]), p) for a in activities(sc)}
    assert loads == pytest.approx(expected(tz, sc)["loads"], rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("tz,sc", CASES, ids=[f"{tz}-{sc['name']}" for tz, sc in CASES])
def test_form_trend_matches_the_browser(tz, sc):
    form = form_trend(activities(sc), DETAILS, profile(sc["profile"]), NOW_MS, ZoneInfo(tz))
    exp = expected(tz, sc)
    assert form["daily"] == pytest.approx(exp["daily"], rel=1e-12, abs=1e-12)
    for key in ("ctl", "atl", "tsb"):
        assert form[key] == pytest.approx(exp["last"][key], rel=1e-9, abs=1e-9), key


@pytest.mark.parametrize("tz,sc", CASES, ids=[f"{tz}-{sc['name']}" for tz, sc in CASES])
def test_coach_context_matches_the_browser(tz, sc):
    ctx = coach_context(activities(sc), DETAILS, profile(sc["profile"]), NOW_MS, ZoneInfo(tz))
    assert ctx == expected(tz, sc)["context"]


@pytest.mark.parametrize("tz", RIDES["timeZones"])
def test_capacity_tier_matches_the_browser(tz):
    assert [capacity_tier(wk, ctl) for wk, ctl in RIDES["tiers"]] == EXPECTED[tz]["tiers"]


def test_new_ftp_changes_tss_with_the_same_ride_details():
    base, higher = (EXPECTED["Europe/Rome"]["scenarios"][n]["rides"] for n in ("base", "ftp280"))
    changed = 0
    for ride_id, d in DETAILS.items():
        assert details_tss(d, 250) == base[str(ride_id)]["TSS"]
        assert details_tss(d, 280) == higher[str(ride_id)]["TSS"]
        changed += base[str(ride_id)]["TSS"] != higher[str(ride_id)]["TSS"]
    assert changed >= 3


def test_no_activities_give_zero_fitness_fatigue_and_form():
    ctx = coach_context([], {}, profile("base"), NOW_MS, ZoneInfo("Europe/Rome"))
    assert (ctx["ctl"], ctx["atl"], ctx["tsb"]) == (0, 0, 0)


def test_late_ride_counts_on_the_next_day_in_rome():
    # Strava scrive l'ora locale con una "Z": il browser la legge come UTC, e alle
    # 23:30 "UTC" a Roma è già il giorno dopo.
    ride, same_day = instant_ms("2026-11-05T23:30:00Z"), instant_ms("2026-11-06T12:00:00Z")
    assert days_ago(ride, same_day, ZoneInfo("Europe/Rome")) == 0
    assert days_ago(ride, same_day, ZoneInfo("America/New_York")) == 1


def test_js_round_sends_halves_up_like_javascript():
    assert [js_round(x) for x in (2.5, 3.5, -2.5, 0.49999999999999994, 1.4, -0.6)] == [3, 4, -2, 0, 1, -1]


def test_js_sum_adds_left_to_right_like_javascript():
    # In JavaScript 0.1 sommato dieci volte dà 0.9999999999999999; sum() di Python 3.12 dà 1.0.
    assert js_sum([0.1] * 10) == 0.9999999999999999
    assert js_sum([1, None, 2]) == 3


def test_fixtures_cover_every_kind_of_activity():
    acts = {a["id"]: a for a in RIDES["activities"]}
    with_details = {a for a in acts if a in DETAILS}
    kinds = {
        "power": any(a.get("weighted_average_watts") for a in acts.values()),
        "heart rate only": any(DETAILS[i]["np"] is None and DETAILS[i]["hr_mean"] for i in with_details),
        "neither": any(DETAILS[i]["np"] is None and DETAILS[i]["hr_mean"] is None for i in with_details),
        "hike with climbing": any(a["type"] == "Hike" and a["total_elevation_gain"] > 100 for a in acts.values()),
        "run": any("Run" in a["type"] for a in acts.values()),
        "ride without details": any("Ride" in a["type"] and i not in DETAILS for i, a in acts.items()),
    }
    assert all(kinds.values()), kinds
