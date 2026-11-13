"""POST /coach/metrics: il carico di ogni attività salvata, calcolato dal servizio con i dettagli
corsa salvati, uguale a quello che il browser mostrava (fixtures/metrics_expected.json)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main
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
