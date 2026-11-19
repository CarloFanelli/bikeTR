"""POST /coach/metrics: il carico di ogni attività salvata, calcolato dal servizio con i dettagli
corsa salvati, uguale a quello che il browser mostrava (fixtures/metrics_expected.json)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main, provider
from fixture_data import DETAILS, RIDES, load, scenario

EXPECTED = load("metrics_expected.json")["Europe/Rome"]["scenarios"]
SCENARIOS = [sc["name"] for sc in RIDES["scenarios"] if not sc.get("noActivities")]


def browser_profile(name: str) -> dict:
    p = RIDES["profiles"][scenario(name)["profile"]]
    return {"ftp": p["ftp"], "lthr": p["lthr"], "hrMax": p["hrMax"]}


@pytest.fixture
def saved(activity_store):
    """Le attività inventate e i dettagli corsa delle fixtures, salvati come dopo una sincronizzazione."""
    summaries = [{**a, "start_date": a["start_date_local"]} for a in RIDES["activities"]]

    async def save():
        await activity_store.save_activities(activity_store.generation, summaries)
        for ride_id, details in DETAILS.items():
            await activity_store.save_details(activity_store.generation, ride_id, details)
    asyncio.run(save())
    return [a["id"] for a in RIDES["activities"]]


def loads(body) -> dict:
    with TestClient(main.app) as client:
        res = client.post("/coach/metrics", json=body)
    assert res.status_code == 200, res.text
    return res.json()["loads"]


@pytest.mark.parametrize("name", SCENARIOS)
def test_each_saved_activity_has_the_load_the_browser_showed(saved, name):
    got = loads({"profile": browser_profile(name), "ids": saved})
    assert got == pytest.approx(EXPECTED[name]["loads"], rel=1e-12, abs=1e-12)


def test_only_the_asked_activities_that_are_saved_come_back(saved):
    got = loads({"profile": browser_profile("base"), "ids": [saved[0], 999999]})
    assert list(got) == [str(saved[0])]


def test_a_changed_type_changes_the_load(saved, activity_store):
    ride = next(a for a in RIDES["activities"] if a["id"] not in DETAILS and a["type"] == "Ride")
    before = loads({"profile": browser_profile("base"), "ids": [ride["id"]]})[str(ride["id"])]
    walk = {**ride, "type": "Yoga", "start_date": ride["start_date_local"]}
    asyncio.run(activity_store.save_activities(activity_store.generation, [walk]))
    after = loads({"profile": browser_profile("base"), "ids": [ride["id"]]})[str(ride["id"])]
    assert after != before


@pytest.mark.parametrize("body", [
    {"profile": {"ftp": -1}, "ids": []},
    {"profile": {}, "ids": "1"},
    {"profile": {}, "ids": [1.5]},
    [],
])
def test_a_wrong_request_is_refused(body):
    with TestClient(main.app) as client:
        res = client.post("/coach/metrics", json=body)
    assert res.status_code == 400


def bike(i: int, **extra) -> dict:
    return {"id": 7_000_000 + i, "type": "Ride", "name": f"Uscita {i}", "start_date": "2026-11-01T07:00:00Z",
            "start_date_local": "2026-11-01T08:00:00", "moving_time": 3600, "distance": 30_000, **extra}


POWER = bike(1, device_watts=True, average_watts=195, weighted_average_watts=200)
HEART = bike(2, average_heartrate=120, has_heartrate=True)
ESTIMATED_ONLY = bike(3, average_watts=260)
RUN = {**bike(4, average_heartrate=150, has_heartrate=True), "type": "Run"}


@pytest.fixture
def badge_rides(activity_store):
    asyncio.run(activity_store.save_activities(activity_store.generation, [POWER, HEART, ESTIMATED_ONLY, RUN]))
    return [a["id"] for a in (POWER, HEART, ESTIMATED_ONLY, RUN)]


def ride_labels(body) -> dict:
    with TestClient(main.app) as client:
        res = client.post("/coach/labels", json=body)
    assert res.status_code == 200, res.text
    return res.json()["labels"]


def test_a_badge_reads_the_saved_series_of_the_ride(monkeypatch, badge_rides, activity_store):
    monkeypatch.setenv("COACH_RIDE_LABELS", "rule")
    # 120 bpm di media, ma due blocchi di 10 minuti a 150 su 160 di soglia, con recuperi: ripetute.
    hr = [110.0] * 40 + [150.0] * 40 + [110.0] * 20 + [150.0] * 40 + [110.0] * 40
    asyncio.run(activity_store.save_details(activity_store.generation, HEART["id"],
                                            {"np": None, "watts_n": 0, "hr_mean": 120, "hr_n": 3600},
                                            {"step": 15, "watts": None, "hr": hr}))
    got = ride_labels({"profile": {"ftp": 220, "lthr": 160}, "ids": badge_rides})
    assert got[str(HEART["id"])] == "ripetute"


def test_with_labels_off_no_ride_gets_a_badge(badge_rides):
    assert ride_labels({"profile": {"ftp": 250, "lthr": 160}, "ids": badge_rides}) == {}


def test_with_labels_on_each_bike_ride_with_power_or_heart_rate_gets_the_rule_label(monkeypatch, badge_rides):
    monkeypatch.setenv("COACH_RIDE_LABELS", "rule")
    got = ride_labels({"profile": {"ftp": 220, "lthr": 160}, "ids": [*badge_rides, 999999]})
    # 200W misurati su 220 di FTP: ripetute; 120 bpm su 160 per un'ora: recupero. Senza dati né la corsa a piedi.
    assert got == {str(POWER["id"]): "ripetute", str(HEART["id"]): "recupero"}


def test_the_badge_uses_today_ftp(monkeypatch, badge_rides):
    monkeypatch.setenv("COACH_RIDE_LABELS", "rule")
    assert ride_labels({"profile": {"ftp": 300, "lthr": 160}, "ids": [POWER["id"]]}) == {str(POWER["id"]): "fondo"}


def test_a_saved_label_model_label_wins_over_the_rule(monkeypatch, activity_store, badge_rides):
    monkeypatch.setenv("COACH_RIDE_LABELS", "model")
    monkeypatch.setenv("LABEL_MODEL", "qwen2.5:3b")
    asyncio.run(activity_store.save_ride_labels(activity_store.generation, "qwen2.5:3b", {HEART["id"]: "fondo"}))
    asyncio.run(activity_store.save_ride_labels(activity_store.generation, "altro", {POWER["id"]: "gara"}))
    got = ride_labels({"profile": {"ftp": 220, "lthr": 160}, "ids": badge_rides})
    assert got == {str(POWER["id"]): "ripetute", str(HEART["id"]): "fondo"}


def test_opening_attivita_calls_no_model(monkeypatch, badge_rides):
    monkeypatch.setenv("COACH_RIDE_LABELS", "model")
    monkeypatch.setenv("LABEL_MODEL", "qwen2.5:3b")
    def no_model(*args):
        raise AssertionError("Attività non chiama il modello che etichetta")
    monkeypatch.setattr(provider, "client", no_model)
    assert ride_labels({"profile": {"ftp": 220, "lthr": 160}, "ids": badge_rides})
