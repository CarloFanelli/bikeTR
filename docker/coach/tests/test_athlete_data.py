"""I dati dell'atleta sul server: letti e salvati da ogni browser, controllati campo per campo,
importati una volta sola dal primo browser, e tenuti dopo "Disconnetti da Strava" tranne i
segmenti, che sono dati di Strava. Il database è quello di prova (conftest.py)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main

SAME_ORIGIN = {"Sec-Fetch-Site": "same-origin"}
# Ogni campo che la schermata Impostazioni può salvare (web/src/core/settings.ts).
FULL_SETTINGS = {"hrMax": 190, "hrLthr": 168, "lthrSource": "declared", "ftpDeclared": 250, "ftpSource": "declared",
                 "weeklyHours": 7.5, "weeklyDays": 4, "longRides": 1, "weight": 72.5, "strengthLevel": 2,
                 "longRideMaxMin": 240, "availableDays": [1, 3, 6], "longRideDays": [6], "raceDate": "2027-05-10",
                 "raceName": "Gran fondo", "hasCompression": True, "hasMassageGun": False}
EVERYTHING = {
    "settings": FULL_SETTINGS,
    "plannedRests": ["2026-11-06"],
    "rainyDays": ["2026-11-07"],
    "ftpHistory": [{"date": "2026-11-02", "ftp": 248, "source": "estimated"}],
    "mesocycle": {"startDate": "2026-10-26", "blockIndex": 0, "blockId": "base", "weekInBlock": 2,
                  "blockHistory": [{"blockId": "base", "startDate": "2026-09-01", "endDate": "2026-10-25", "weeks": 8}],
                  "ftpHistory": [{"date": "2026-11-02", "ftp": 248}]},
    "segmentCache": {"12": {"efforts": [{"elapsed_time": 300}], "_fetched": 1, "_segment": {"distance": 1200}}},
    "coachSettings": {"lastDuration": 90},
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def read(client) -> dict:
    return client.get("/coach/athlete-data", headers=SAME_ORIGIN).json()


def save(client, key, value):
    return client.put(f"/coach/athlete-data/{key}", json=value, headers=SAME_ORIGIN)


def test_every_key_saves_and_reads_back_the_same_value(client):
    assert read(client) == {}
    for key, value in EVERYTHING.items():
        assert save(client, key, value).status_code == 204
    assert read(client) == EVERYTHING


def test_the_last_save_wins(client):
    save(client, "settings", {"hrMax": 190})
    save(client, "settings", {"hrMax": 185, "weight": 70})
    assert read(client)["settings"] == {"hrMax": 185, "weight": 70}


@pytest.mark.parametrize(("key", "value", "field"), [
    ("settings", {"hrMax": 190, "colore": "rosso"}, "settings.colore è un campo sconosciuto"),
    ("settings", {"hrMax": "190"}, "settings.hrMax ha un valore del tipo sbagliato"),
    ("settings", {"hasCompression": 1}, "settings.hasCompression ha un valore del tipo sbagliato"),
    ("plannedRests", ["6 novembre"], "plannedRests.0 ha un valore del tipo sbagliato"),
    ("ftpHistory", [{"date": "2026-11-02", "ftp": 248, "source": "x", "meso": "base"}], "ftpHistory.0.meso è un campo sconosciuto"),
    ("mesocycle", {"startDate": "2026-10-26"}, "mesocycle.blockIndex ha un valore del tipo sbagliato"),
    ("coachSettings", {"model": "llama"}, "coachSettings.model è un campo sconosciuto"),
])
def test_a_wrong_value_is_refused_names_the_field_and_saves_nothing(client, key, value, field):
    save(client, "settings", {"hrMax": 170})
    res = save(client, key, value)
    assert res.status_code == 422
    assert res.json() == {"error": "invalid_data", "message": f"Dati rifiutati: {field}. Nulla è stato salvato."}
    assert read(client) == {"settings": {"hrMax": 170}}


def test_an_unknown_key_is_refused(client):
    assert save(client, "tema", "dark").status_code == 404


def test_the_first_browser_imports_everything_the_second_is_told_the_server_is_full(client):
    assert client.post("/coach/athlete-data/import", json=EVERYTHING, headers=SAME_ORIGIN).status_code == 204
    second = client.post("/coach/athlete-data/import", json={"settings": {"hrMax": 150}}, headers=SAME_ORIGIN)
    assert (second.status_code, second.json()["error"]) == (409, "not_empty")
    assert read(client) == EVERYTHING


def test_an_import_with_a_wrong_value_saves_nothing(client):
    res = client.post("/coach/athlete-data/import", json={"settings": FULL_SETTINGS, "rainyDays": [7]},
                      headers=SAME_ORIGIN)
    assert res.status_code == 422 and "rainyDays.0" in res.json()["message"]
    assert read(client) == {}


def test_two_browsers_importing_together_save_only_one(client):
    async def go():
        data = main.athlete_data
        return await asyncio.gather(data.import_all({"settings": {"hrMax": 190}}),
                                    data.import_all({"settings": {"hrMax": 150}}))
    assert sorted(asyncio.run(go())) == [False, True]
    assert read(client)["settings"]["hrMax"] in (190, 150)


def test_disconnect_keeps_the_athlete_data_and_deletes_the_segments(client):
    client.post("/coach/athlete-data/import", json=EVERYTHING, headers=SAME_ORIGIN)
    assert client.post("/coach/forget", headers=SAME_ORIGIN).status_code == 204
    assert read(client) == {k: v for k, v in EVERYTHING.items() if k != "segmentCache"}
