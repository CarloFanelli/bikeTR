"""Download delle corse da uno Strava e da un server di autenticazione simulati
(httpx.MockTransport): nessuna richiesta esce dal container."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.errors import CoachError
from app.metrics import Profile, activity_load, details_tss
from app.store import RideStore
from app.strava import AUTH_UNREACHABLE, KEPT_FIELDS, StravaRides

NOW = 1_762_470_000_000
TOKEN = "token-di-prova-segreto"
POWER_AND_HR = {"time": {"data": list(range(120))}, "watts": {"data": [200] * 60 + [260] * 60},
                "heartrate": {"data": [140] * 120}}


def activity(i: int, kind: str = "Ride", athlete: int = 7) -> dict:
    return {"id": i, "type": kind, "name": "Giro del lago", "start_date_local": "2026-11-01T08:00:00Z",
            "moving_time": 3600, "distance": 30000, "weighted_average_watts": 200,
            "average_heartrate": 140, "has_heartrate": True, "total_elevation_gain": 100,
            "suffer_score": 50, "start_latlng": [45.81, 9.08], "map": {"summary_polyline": "o}vtGe~bw@"},
            "athlete": {"id": athlete, "resource_state": 1}}


def rides(ids, **kw) -> list:
    return [activity(i, **kw) for i in ids]


class FakeStrava:
    """Risponde come Strava e il server di autenticazione; registra le richieste a Strava."""

    def __init__(self, activities: list):
        self.activities = activities
        self.streams = {}          # id corsa → stream o codice HTTP
        self.list_status = 200
        self.auth = 200            # codice HTTP, o "down"
        self.calls = []
        self.list_query = None     # parametri dell'ultima richiesta della lista
        self.on_list = None        # funzione async chiamata a ogni richiesta della lista
        self.on_stream = None      # funzione async chiamata a ogni download di dettagli

    async def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth":
            if self.auth == "down":
                raise httpx.ConnectError("auth spento")
            return httpx.Response(self.auth, json={"access_token": TOKEN} if self.auth == 200 else {})
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        self.calls.append(request.url.path)
        if request.url.path.endswith("/athlete/activities"):
            self.list_query = dict(request.url.params)
            if self.on_list:
                await self.on_list()
            if self.list_status == "down":
                raise httpx.ConnectError("rete giù")
            return httpx.Response(self.list_status, json=self.activities)
        ride_id = int(request.url.path.split("/")[-2])
        if self.on_stream:
            await self.on_stream(ride_id)
        streams = self.streams.get(ride_id, POWER_AND_HR)
        return httpx.Response(streams) if isinstance(streams, int) else httpx.Response(200, json=streams)

    def stream_calls(self) -> list:
        return [int(p.split("/")[-2]) for p in self.calls if p.endswith("/streams")]


@pytest.fixture
def store(tmp_path):
    return RideStore(tmp_path / "rides.json")


def strava_rides(store, fake) -> StravaRides:
    return StravaRides(store, httpx.AsyncClient(transport=httpx.MockTransport(fake.handle)))


def refresh(store, fake, times: int = 1):
    """Esegue `times` richieste in sequenza; ritorna l'ultimo risultato."""
    async def go():
        sr = strava_rides(store, fake)
        for _ in range(times):
            result = await sr.refresh(NOW)
        return result
    return asyncio.run(go())


def test_first_request_downloads_the_list_and_details_of_the_latest_40_rides(store):
    fake = FakeStrava(rides(range(1, 46)) + rides(range(100, 105), kind="Run"))
    steps = []

    async def go():
        return await strava_rides(store, fake).refresh(NOW, progress=lambda d, t: steps.append((d, t)))
    data = asyncio.run(go())
    assert fake.calls[0] == "/api/v3/athlete/activities"
    assert fake.list_query == {"per_page": "60"}
    assert fake.stream_calls() == list(range(1, 41))
    assert len(fake.calls) == 41
    assert sorted(data.details) == list(range(1, 41))
    assert steps[0] == (1, 40) and steps[-1] == (40, 40)
    assert (data.from_saved, data.missing_details, len(data.activities)) == (False, 0, 50)


def test_next_request_downloads_only_the_new_ride(store):
    fake = FakeStrava(rides(range(1, 41)))
    refresh(store, fake)
    fake.activities = rides([99]) + fake.activities
    fake.calls.clear()
    data = refresh(store, fake)
    assert fake.stream_calls() == [99]
    assert len(fake.calls) == 2
    assert 40 not in data.details and 40 not in store.load()["details"]


def test_saved_details_are_reused_after_a_restart(store, tmp_path):
    fake = FakeStrava(rides(range(1, 6)))
    refresh(store, fake)
    fake.calls.clear()
    data = refresh(RideStore(tmp_path / "rides.json"), fake)
    assert fake.stream_calls() == []
    assert sorted(data.details) == [1, 2, 3, 4, 5]


def test_new_ftp_uses_saved_details_without_downloads(store):
    fake = FakeStrava(rides([1]))
    refresh(store, fake)
    fake.calls.clear()
    data = refresh(store, fake)
    assert fake.stream_calls() == []
    act, d = data.activities[0], data.details[1]
    for ftp in (250, 300):
        assert activity_load(act, d, Profile(ftp=ftp, lthr=160)) == details_tss(d, ftp)
    assert details_tss(d, 250) != details_tss(d, 300)


def test_disconnect_deletes_saved_rides_and_details(store, monkeypatch):
    refresh(store, FakeStrava(rides([1, 2])))
    monkeypatch.setattr(main, "store", store)
    client = TestClient(main.app)
    assert client.post("/coach/forget", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert store.path.exists()
    assert client.post("/coach/forget", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 204
    assert not store.path.exists()


@pytest.mark.parametrize("failure", [429, 500, 503, "down"])
def test_strava_unreachable_uses_saved_rides_and_their_date(store, failure):
    fake = FakeStrava(rides([1, 2]))
    refresh(store, fake)
    fake.list_status = failure
    fake.calls.clear()

    async def later():
        return await strava_rides(store, fake).refresh(NOW + 3_600_000)
    data = asyncio.run(later())
    assert (data.from_saved, data.downloaded_at, sorted(data.details)) == (True, NOW, [1, 2])
    assert fake.stream_calls() == []


def test_auth_renewal_failure_uses_saved_rides(store):
    fake = FakeStrava(rides([1]))
    refresh(store, fake)
    fake.auth = 502
    assert refresh(store, fake).from_saved


def test_strava_unreachable_without_saved_rides(store):
    fake = FakeStrava(rides([1]))
    fake.list_status = 429
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.message == "Strava non raggiungibile, riprova più tardi"


def test_access_refused_by_strava_asks_to_connect_again(store):
    fake = FakeStrava(rides([1]))
    fake.list_status = 401
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.code == "strava_refused" and "collega di nuovo Strava" in e.value.message
    assert fake.stream_calls() == []


def test_auth_server_unreachable_or_not_connected(store):
    fake = FakeStrava(rides([1]))
    fake.auth = "down"
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.message == AUTH_UNREACHABLE
    fake.auth = 401
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.code == "not_connected"
    assert fake.calls == []


def test_no_activities(store):
    fake = FakeStrava([])
    data = refresh(store, fake)
    assert (data.activities, data.details, data.missing_details) == ([], {}, 0)
    assert fake.stream_calls() == []


def test_another_athlete_discards_saved_details(store):
    fake = FakeStrava(rides([1, 2, 3], athlete=7))
    refresh(store, fake)
    fake.activities = rides([3], athlete=8)
    fake.calls.clear()
    refresh(store, fake)
    assert fake.stream_calls() == [3]
    assert store.load()["athlete_id"] == 8


def test_failed_detail_uses_summary_and_is_retried(store):
    fake = FakeStrava(rides([1, 2, 3]))
    fake.streams[2] = 500
    data = refresh(store, fake)
    assert (sorted(data.details), data.missing_details) == ([1, 3], 1)
    del fake.streams[2]
    fake.calls.clear()
    data = refresh(store, fake)
    assert fake.stream_calls() == [2]
    assert data.missing_details == 0


def test_strava_limit_stops_detail_downloads_until_next_request(store):
    fake = FakeStrava(rides([1, 2, 3, 4]))
    fake.streams[2] = 429
    data = refresh(store, fake)
    assert fake.stream_calls() == [1, 2]
    assert data.missing_details == 3
    del fake.streams[2]
    fake.calls.clear()
    refresh(store, fake)
    assert fake.stream_calls() == [2, 3, 4]


@pytest.mark.parametrize("streams", [{"time": {"data": [0, 1, 2]}, "cadence": {"data": [80, 81, 82]}}, []],
                         ids=["only-cadence", "empty-list"])
def test_ride_without_power_or_heart_rate_is_not_downloaded_again(store, streams):
    fake = FakeStrava(rides([1]))
    fake.streams[1] = streams
    data = refresh(store, fake, times=2)
    assert fake.stream_calls() == [1]
    assert data.details[1]["np"] is None and data.details[1]["hr_mean"] is None


def test_corrupted_saved_data_is_downloaded_again(store):
    store.path.write_text('{"activities": [1, 2', encoding="utf-8")
    fake = FakeStrava(rides([1, 2]))
    data = refresh(store, fake)
    assert sorted(data.details) == [1, 2]
    store.path.write_text(json.dumps({**json.loads(store.path.read_text()),
                                      "details": {"1": {"np": 1}, "2": "x"}}), encoding="utf-8")
    fake.calls.clear()
    refresh(store, fake)
    assert fake.stream_calls() == [1, 2]


def test_two_requests_download_each_new_ride_once(store):
    fake = FakeStrava(rides(range(1, 6)))
    fake.on_stream = lambda _: asyncio.sleep(0.01)

    async def go():
        sr = strava_rides(store, fake)
        return await asyncio.gather(sr.refresh(NOW), sr.refresh(NOW))
    first, second = asyncio.run(go())
    assert sorted(fake.stream_calls()) == [1, 2, 3, 4, 5]
    assert sorted(first.details) == sorted(second.details) == [1, 2, 3, 4, 5]
    assert sorted(store.load()["details"]) == [1, 2, 3, 4, 5]


def test_requests_with_different_lists_download_each_ride_once(store):
    fake = FakeStrava(rides(range(1, 6)))
    fake.on_stream = lambda ride_id: asyncio.sleep(0.1 if ride_id == 99 else 0.01)

    async def go():
        sr = strava_rides(store, fake)
        first = asyncio.create_task(sr.refresh(NOW))
        while not fake.stream_calls():
            await asyncio.sleep(0.001)
        # Una corsa nuova fra le due liste: la seconda richiesta la scarica per prima,
        # mentre la prima richiesta finisce le altre.
        fake.activities = rides([99]) + fake.activities
        await asyncio.gather(first, sr.refresh(NOW))
    asyncio.run(go())
    assert sorted(fake.stream_calls()) == [1, 2, 3, 4, 5, 99]


def test_abandoned_request_keeps_the_details_already_downloaded(store):
    fake = FakeStrava(rides(range(1, 11)))
    fake.on_stream = lambda _: asyncio.sleep(0.01)

    async def go():
        task = asyncio.create_task(strava_rides(store, fake).refresh(NOW))
        while len(fake.stream_calls()) < 3:
            await asyncio.sleep(0.001)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await asyncio.sleep(0.05)  # il download in corso finisce e si salva
    asyncio.run(go())
    assert set(store.load()["details"]) == {1, 2, 3}


def test_disconnect_during_downloads_keeps_nothing(store):
    fake = FakeStrava(rides(range(1, 6)))

    async def disconnect_at_ride_3(ride_id):
        if ride_id == 3:
            await store.forget()
    fake.on_stream = disconnect_at_ride_3
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.code == "disconnected"
    assert not store.path.exists()
    assert fake.stream_calls() == [1, 2, 3]


def test_disconnect_while_strava_is_unreachable_stops_the_request(store):
    fake = FakeStrava(rides([1, 2]))
    refresh(store, fake)
    fake.list_status = 503
    fake.on_list = store.forget
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.code == "disconnected"
    assert not store.path.exists()


def test_saved_data_has_no_token_coordinates_maps_or_titles(store):
    refresh(store, FakeStrava(rides([1, 2])))
    saved = store.path.read_text(encoding="utf-8")
    assert TOKEN not in saved
    for act in json.loads(saved)["activities"]:
        assert set(act) <= set(KEPT_FIELDS)
    assert "latlng" not in saved and "polyline" not in saved and "Giro del lago" not in saved
