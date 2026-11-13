"""Sincronizzazione delle attività e download dei dettagli corsa da uno Strava e da un server di
autenticazione simulati (httpx.MockTransport): nessuna richiesta esce dal container. Le attività
stanno nel database di prova (conftest.py)."""

import asyncio
import time
from datetime import datetime, timedelta, timezone

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.activities import ActivityStore
from app.athlete_data import AthleteData
from app.errors import CoachError
from app.metrics import Profile, activity_load, details_tss
from app.strava import AUTH_UNREACHABLE, KEPT_FIELDS, PAGE_SIZE, StravaRides

NOW = 1_762_470_000_000
NOW_DATE = datetime.fromtimestamp(NOW / 1000, tz=timezone.utc)
LATER = 10 * 60 * 1000          # oltre i 5 minuti fra due sincronizzazioni
TOKEN = "token-di-prova-segreto"
SAME_ORIGIN = {"Sec-Fetch-Site": "same-origin"}
POWER_AND_HR = {"time": {"data": list(range(120))}, "watts": {"data": [200] * 60 + [260] * 60},
                "heartrate": {"data": [140] * 120}}


def iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def activity(i: int, kind: str = "Ride", hours_ago: float | None = None) -> dict:
    """L'attività `i`, partita `i` ore prima di NOW se non è detto altro: id più basso, più nuova."""
    start = NOW_DATE - timedelta(hours=i if hours_ago is None else hours_ago)
    return {"id": i, "type": kind, "name": "Giro del lago", "start_date": iso(start), "start_date_local": iso(start),
            "moving_time": 3600, "distance": 30000, "weighted_average_watts": 200,
            "average_heartrate": 140, "has_heartrate": True, "total_elevation_gain": 100,
            "suffer_score": 50, "start_latlng": [45.81, 9.08], "map": {"summary_polyline": "o}vtGe~bw@"}}


def rides(ids, **kw) -> list:
    return [activity(i, **kw) for i in ids]


class FakeStrava:
    """Risponde come Strava e il server di autenticazione; registra le richieste a Strava. La
    lista rispetta before, after, page e per_page, dalla più nuova."""

    def __init__(self, activities: list, athlete: int = 7):
        self.activities = activities
        self.athlete = athlete
        self.streams = {}          # id corsa → stream o codice HTTP
        self.usage = None          # X-RateLimit-Usage dei dettagli, "15min,giorno"
        self.list_status = 200     # codice HTTP, o "down"
        self.fail_after_pages = None   # pagine della lista servite prima del codice list_status
        self.auth = 200            # codice HTTP, o "down"
        self.calls = []
        self.list_queries = []     # parametri di ogni richiesta della lista
        self.on_list = None        # funzione async chiamata a ogni richiesta della lista
        self.on_stream = None      # funzione async chiamata a ogni download di dettagli

    async def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth":
            if self.auth == "down":
                raise httpx.ConnectError("auth spento")
            return httpx.Response(self.auth, json={"access_token": TOKEN} if self.auth == 200 else {})
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        path = request.url.path
        self.calls.append(path)
        if path == "/api/v3/athlete":
            return httpx.Response(200, json={"id": self.athlete, "firstname": "Carlo"})
        if path == f"/api/v3/athletes/{self.athlete}/stats":
            return httpx.Response(200, json={"all_ride_totals": {"count": len(self.activities)}})
        if path.endswith("/athlete/activities"):
            return await self.list(dict(request.url.params))
        ride_id = int(path.split("/")[-2])
        if self.on_stream:
            await self.on_stream(ride_id)
        streams = self.streams.get(ride_id, POWER_AND_HR)
        headers = {"X-RateLimit-Usage": self.usage} if self.usage else {}
        if isinstance(streams, int):
            return httpx.Response(streams, headers=headers)
        return httpx.Response(200, json=streams, headers=headers)

    async def list(self, query: dict) -> httpx.Response:
        self.list_queries.append(query)
        if self.on_list:
            await self.on_list()
        failing = self.fail_after_pages is None or len(self.list_queries) > self.fail_after_pages
        if self.list_status != 200 and failing:
            if self.list_status == "down":
                raise httpx.ConnectError("rete giù")
            return httpx.Response(self.list_status)

        def started(a) -> float:
            return datetime.fromisoformat(a["start_date"].replace("Z", "+00:00")).timestamp()
        listed = sorted(self.activities, key=started, reverse=True)
        if "before" in query:
            listed = [a for a in listed if started(a) < int(query["before"])]
        if "after" in query:
            listed = [a for a in listed if started(a) > int(query["after"])]
        size, page = int(query["per_page"]), int(query.get("page", 1))
        return httpx.Response(200, json=listed[(page - 1) * size:page * size])

    def stream_calls(self) -> list:
        return [int(p.split("/")[-2]) for p in self.calls if p.endswith("/streams")]

    def strava_calls(self) -> list:
        return [p for p in self.calls if not p.endswith("/streams")]


@pytest.fixture
def store(activity_store) -> ActivityStore:
    return activity_store


def strava_rides(store, fake) -> StravaRides:
    return StravaRides(store, httpx.AsyncClient(transport=httpx.MockTransport(fake.handle)))


def refresh(store, fake, at: float = NOW):
    return asyncio.run(strava_rides(store, fake).refresh(at))


def sync(store, fake, at: float = NOW):
    return asyncio.run(strava_rides(store, fake).sync(at))


def saved(store, query: str) -> list:
    with psycopg.connect(store.conninfo) as conn:
        return conn.execute(query).fetchall()


def saved_ids(store) -> list:
    return [r[0] for r in saved(store, "SELECT id FROM strava_activities ORDER BY id")]


def saved_details(store) -> list:
    return [r[0] for r in saved(store, "SELECT activity_id FROM ride_details ORDER BY activity_id")]


# --- Sincronizzazione -----------------------------------------------------------------------

def test_first_sync_saves_every_activity_with_athlete_and_stats(store):
    fake = FakeStrava(rides(range(1, PAGE_SIZE + 51)))
    result = sync(store, fake)
    assert (result.status, result.synced_at) == ("updated", NOW)
    assert saved_ids(store) == list(range(1, PAGE_SIZE + 51))
    # Due pagine: la seconda continua da prima dell'attività più vecchia della prima.
    assert [q.get("before") for q in fake.list_queries] == [None, str(int((NOW_DATE - timedelta(hours=PAGE_SIZE))
                                                                           .timestamp()))]
    state = asyncio.run(store.sync_state())
    assert state["athlete"]["firstname"] == "Carlo"
    assert state["stats"]["all_ride_totals"]["count"] == PAGE_SIZE + 50
    assert state["history_complete"]


def test_the_whole_strava_activity_is_saved_but_never_the_token(store):
    sync(store, FakeStrava(rides([1])))
    summary = saved(store, "SELECT summary FROM strava_activities")[0][0]
    assert summary["name"] == "Giro del lago" and summary["map"]["summary_polyline"] == "o}vtGe~bw@"
    everything = str(saved(store, "SELECT * FROM strava_activities")) + str(saved(store, "SELECT * FROM strava_sync"))
    assert TOKEN not in everything


def test_athlete_with_no_activities_saves_athlete_and_stats(store):
    fake = FakeStrava([])
    assert sync(store, fake).status == "updated"
    assert saved_ids(store) == []
    assert asyncio.run(store.sync_state())["athlete"]["id"] == 7
    data = refresh(store, fake, NOW + LATER)
    assert (data.activities, data.details, data.missing_details) == ([], {}, 0)
    assert fake.stream_calls() == []


def test_a_sync_within_5_minutes_calls_nobody(store):
    fake = FakeStrava(rides([1, 2]))
    sync(store, fake)
    fake.calls.clear()
    result = sync(store, fake, NOW + 4 * 60 * 1000)
    assert (result.status, result.synced_at) == ("recent", NOW)
    assert fake.calls == []


def test_the_5_minutes_survive_a_restart(store):
    sync(store, FakeStrava(rides([1])))
    fake = FakeStrava(rides([1]))
    assert sync(ActivityStore(store.conninfo), fake, NOW + 60_000).status == "recent"
    assert fake.calls == []


def test_a_later_sync_asks_only_for_new_activities_and_the_last_30_days(store):
    fake = FakeStrava(rides([1, 2]) + rides([500], hours_ago=24 * 60))
    sync(store, fake)
    fake.activities = rides([0], hours_ago=0.5) + fake.activities
    fake.list_queries.clear()
    assert sync(store, fake, NOW + LATER).status == "updated"
    assert [set(q) for q in fake.list_queries] == [{"after", "per_page", "page"}]
    assert int(fake.list_queries[0]["after"]) == int((NOW_DATE - timedelta(days=30)).timestamp() + LATER / 1000)
    assert saved_ids(store) == [0, 1, 2, 500]


def test_changes_and_deletions_on_strava_within_30_days_reach_the_saved_data(store):
    old = rides([500], hours_ago=24 * 60)
    fake = FakeStrava(rides([1, 2, 3]) + old)
    refresh(store, fake)
    assert 2 in saved_details(store)
    renamed = {**activity(1), "name": "Nuovo nome", "type": "VirtualRide"}
    edited_long_ago = {**old[0], "name": "Cambiato su Strava"}
    fake.activities = [renamed, activity(3), edited_long_ago]
    sync(store, fake, NOW + LATER)
    assert saved_ids(store) == [1, 3, 500]
    assert 2 not in saved_details(store)
    summaries = {r[0]["id"]: r[0] for r in saved(store, "SELECT summary FROM strava_activities")}
    assert (summaries[1]["name"], summaries[1]["type"]) == ("Nuovo nome", "VirtualRide")
    assert summaries[500]["name"] == "Giro del lago"


def test_two_syncs_at_the_same_moment_check_strava_once(store):
    fake = FakeStrava(rides([1, 2]))

    async def slow_list():
        await asyncio.sleep(0.05)
    fake.on_list = slow_list

    async def go():
        sr = strava_rides(store, fake)
        return await asyncio.gather(sr.sync(NOW), sr.sync(NOW))
    first, second = asyncio.run(go())
    assert first == second
    assert len(fake.list_queries) == 1


def test_429_during_the_first_sync_keeps_what_was_saved_and_resumes_from_there(store):
    fake = FakeStrava(rides(range(1, PAGE_SIZE + 51)))
    fake.list_status, fake.fail_after_pages = 429, 1
    result = sync(store, fake)
    assert result.status == "paused"
    assert result.retry_at > NOW and result.retry_at % (15 * 60 * 1000) == 0
    assert result.synced_at is None
    assert len(saved_ids(store)) == PAGE_SIZE
    assert not asyncio.run(store.sync_state())["history_complete"]
    fake.list_status = 200
    fake.list_queries.clear()
    assert sync(store, fake, NOW + LATER).status == "updated"
    assert "before" in fake.list_queries[0]
    assert len(saved_ids(store)) == PAGE_SIZE + 50


@pytest.mark.parametrize("failure", [500, 503, "down"])
def test_strava_unreachable_answers_with_the_last_successful_sync(store, failure):
    fake = FakeStrava(rides([1, 2]))
    sync(store, fake)
    fake.list_status = failure
    result = sync(store, fake, NOW + LATER)
    assert (result.status, result.synced_at, result.retry_at) == ("unreachable", NOW, None)
    assert saved_ids(store) == [1, 2]
    # Anche un tentativo fallito conta per i 5 minuti.
    fake.calls.clear()
    assert sync(store, fake, NOW + LATER + 60_000).status == "recent"
    assert fake.calls == []


def test_another_athlete_replaces_the_previous_strava_data(store):
    fake = FakeStrava(rides([1, 2, 3]), athlete=7)
    refresh(store, fake)
    athlete_data = AthleteData(store.conninfo)
    asyncio.run(athlete_data.save("segmentCache", {"55": {"efforts": [], "_fetched": 1}}))
    asyncio.run(athlete_data.save("settings", {"ftpDeclared": 250}))
    # Lo stesso atleta tiene i suoi segmenti.
    refresh(store, fake, NOW + LATER)
    assert "segmentCache" in asyncio.run(athlete_data.all())
    fake = FakeStrava(rides([3]), athlete=8)
    refresh(store, fake, NOW + 2 * LATER)
    assert saved_ids(store) == [3]
    assert fake.stream_calls() == [3]
    assert asyncio.run(store.sync_state())["athlete_id"] == 8
    # I segmenti erano di Strava, del vecchio atleta; le impostazioni restano.
    assert asyncio.run(athlete_data.all()) == {"settings": {"ftpDeclared": 250}}


def test_a_sync_after_disconnecting_does_not_join_the_one_still_running(store):
    fake = FakeStrava(rides([1, 2]))

    async def go():
        sr = strava_rides(store, fake)
        gate = asyncio.Event()
        fake.on_list = gate.wait
        old = asyncio.create_task(sr.sync(NOW))
        await asyncio.sleep(0.05)
        await store.forget()
        fake.on_list = None
        new = await asyncio.wait_for(sr.sync(NOW + 1000), 5)
        gate.set()
        with pytest.raises(CoachError):
            await old
        return new
    assert asyncio.run(go()).status == "updated"
    assert saved_ids(store) == [1, 2]


def test_disconnect_during_a_sync_saves_nothing_more(store):
    fake = FakeStrava(rides(range(1, PAGE_SIZE + 51)))
    pages = 0

    async def disconnect_on_page_2():
        nonlocal pages
        pages += 1
        if pages == 2:
            await store.forget()
    fake.on_list = disconnect_on_page_2
    with pytest.raises(CoachError) as e:
        sync(store, fake)
    assert e.value.code == "disconnected"
    assert saved_ids(store) == [] and asyncio.run(store.sync_state()) is None


def test_disconnect_while_strava_is_unreachable_stops_the_request(store):
    fake = FakeStrava(rides([1, 2]))
    refresh(store, fake)
    fake.list_status = 503
    fake.on_list = store.forget
    with pytest.raises(CoachError) as e:
        refresh(store, fake, NOW + LATER)
    assert e.value.code == "disconnected"
    assert saved_ids(store) == []


# --- Rotte ----------------------------------------------------------------------------------

def test_sync_route_answers_status_and_times(store, monkeypatch):
    fake = FakeStrava(rides([1]))
    monkeypatch.setattr(main, "rides", strava_rides(store, fake))
    monkeypatch.setattr(main.time, "time", lambda: NOW / 1000)
    client = TestClient(main.app)
    assert client.post("/coach/sync", headers=SAME_ORIGIN).json() == {"status": "updated", "syncedAt": NOW,
                                                                      "retryAt": None}
    assert client.post("/coach/sync", headers=SAME_ORIGIN).json()["status"] == "recent"


def test_disconnect_deletes_activities_details_athlete_and_stats(store):
    refresh(store, FakeStrava(rides([1, 2])))
    client = TestClient(main.app)
    assert client.post("/coach/forget", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert saved_ids(store) == [1, 2]
    assert client.post("/coach/forget", headers=SAME_ORIGIN).status_code == 204
    assert saved_ids(store) == [] and saved_details(store) == []
    assert asyncio.run(store.sync_state()) is None


def test_startup_creates_the_tables_once_and_deletes_the_old_rides_file(store, tmp_path):
    main.OLD_RIDES_FILE.write_text("{}", encoding="utf-8")
    with TestClient(main.app):
        pass
    assert not main.OLD_RIDES_FILE.exists()
    asyncio.run(db.migrate(store.conninfo))     # già applicate: nulla da rifare
    applied = [r[0] for r in saved(store, "SELECT name FROM schema_migrations ORDER BY name")]
    assert applied == sorted(p.name for p in db.MIGRATIONS.glob("*.sql"))


# --- Dettagli corsa per il Coach ------------------------------------------------------------

def test_first_request_downloads_the_details_of_the_latest_40_rides(store):
    fake = FakeStrava(rides(range(1, 46)) + rides(range(100, 105), kind="Run"))
    steps = []

    async def go():
        return await strava_rides(store, fake).refresh(NOW, progress=lambda d, t: steps.append((d, t)))
    data = asyncio.run(go())
    assert fake.stream_calls() == list(range(1, 41))
    assert sorted(data.details) == list(range(1, 41))
    assert steps[0] == (1, 40) and steps[-1] == (40, 40)
    assert (data.from_saved, data.missing_details, len(data.activities)) == (False, 0, 50)
    assert all(set(a) <= set(KEPT_FIELDS) for a in data.activities)


def test_next_request_downloads_only_the_new_ride(store):
    fake = FakeStrava(rides(range(1, 41)))
    refresh(store, fake)
    fake.activities = rides([99], hours_ago=0.5) + fake.activities
    fake.calls.clear()
    data = refresh(store, fake, NOW + LATER)
    assert fake.stream_calls() == [99]
    assert 40 not in data.details and 40 in saved_details(store)


def test_saved_details_are_reused_after_a_restart(store):
    fake = FakeStrava(rides(range(1, 6)))
    refresh(store, fake)
    fake.calls.clear()
    data = refresh(ActivityStore(store.conninfo), fake, NOW + LATER)
    assert fake.stream_calls() == []
    assert sorted(data.details) == [1, 2, 3, 4, 5]


def test_new_ftp_uses_saved_details_without_downloads(store):
    fake = FakeStrava(rides([1]))
    refresh(store, fake)
    fake.calls.clear()
    data = refresh(store, fake)
    assert fake.calls == []
    act, d = data.activities[0], data.details[1]
    for ftp in (250, 300):
        assert activity_load(act, d, Profile(ftp=ftp, lthr=160)) == details_tss(d, ftp)
    assert details_tss(d, 250) != details_tss(d, 300)


@pytest.mark.parametrize("failure", [429, 500, "down"])
def test_strava_unreachable_uses_saved_rides_and_their_date(store, failure):
    fake = FakeStrava(rides([1, 2]))
    refresh(store, fake)
    fake.list_status = failure
    fake.calls.clear()
    data = refresh(store, fake, NOW + LATER)
    assert (data.from_saved, data.downloaded_at, sorted(data.details)) == (True, NOW, [1, 2])
    assert fake.stream_calls() == []


def test_auth_renewal_failure_uses_saved_rides(store):
    fake = FakeStrava(rides([1]))
    refresh(store, fake)
    fake.auth = 502
    assert refresh(store, fake, NOW + LATER).from_saved


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


def test_strava_unreachable_through_auth_after_a_recent_sync_uses_saved_details(store):
    fake = FakeStrava(rides([1, 2]))
    fake.streams[2] = 500
    refresh(store, fake)
    fake.auth = 502
    data = refresh(store, fake, NOW + 60_000)
    assert sorted(data.details) == [1]


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
    refresh(store, fake)
    data = refresh(store, fake)
    assert fake.stream_calls() == [1]
    assert data.details[1]["np"] is None and data.details[1]["hr_mean"] is None


def test_two_requests_download_each_new_ride_once(store):
    fake = FakeStrava(rides(range(1, 6)))
    fake.on_stream = lambda _: asyncio.sleep(0.01)

    async def go():
        sr = strava_rides(store, fake)
        return await asyncio.gather(sr.refresh(NOW), sr.refresh(NOW))
    first, second = asyncio.run(go())
    assert sorted(fake.stream_calls()) == [1, 2, 3, 4, 5]
    assert sorted(first.details) == sorted(second.details) == [1, 2, 3, 4, 5]
    assert saved_details(store) == [1, 2, 3, 4, 5]


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
        await asyncio.sleep(0.1)  # il download in corso finisce e si salva
    asyncio.run(go())
    assert saved_details(store) == [1, 2, 3]


def test_disconnect_during_downloads_keeps_nothing(store):
    fake = FakeStrava(rides(range(1, 6)))

    async def disconnect_at_ride_3(ride_id):
        if ride_id == 3:
            await store.forget()
    fake.on_stream = disconnect_at_ride_3
    with pytest.raises(CoachError) as e:
        refresh(store, fake)
    assert e.value.code == "disconnected"
    assert saved_ids(store) == [] and saved_details(store) == []
    assert fake.stream_calls() == [1, 2, 3]


def test_aggiorna_da_strava_skips_the_5_minutes_and_shares_a_running_sync(store, monkeypatch):
    fake = FakeStrava(rides([1]))
    sync(store, fake)
    fake.activities = rides([0], hours_ago=0.5) + fake.activities
    fake.list_queries.clear()

    async def slow_list():
        await asyncio.sleep(0.05)
    fake.on_list = slow_list

    async def go():
        sr = strava_rides(store, fake)
        return await asyncio.gather(sr.sync(NOW + 60_000, force=True), sr.sync(NOW + 60_000, force=True))
    first, second = asyncio.run(go())
    assert first == second and first.status == "updated"
    assert len(fake.list_queries) == 1
    assert saved_ids(store) == [0, 1]


def test_athlete_and_activities_routes_answer_what_is_saved(store, monkeypatch):
    client = TestClient(main.app)
    assert client.get("/coach/athlete", headers=SAME_ORIGIN).json() == {"athlete": None, "stats": None,
                                                                       "syncedAt": None}
    fake = FakeStrava(rides([1, 2, 3]))
    monkeypatch.setattr(main, "rides", strava_rides(store, fake))
    monkeypatch.setattr(main.time, "time", lambda: NOW / 1000)
    client.post("/coach/sync", headers=SAME_ORIGIN)
    fake.calls.clear()
    saved_athlete = client.get("/coach/athlete", headers=SAME_ORIGIN).json()
    assert (saved_athlete["athlete"]["id"], saved_athlete["syncedAt"]) == (7, NOW)
    assert saved_athlete["stats"]["all_ride_totals"]["count"] == 3
    latest = client.get("/coach/activities?limit=2", headers=SAME_ORIGIN).json()
    assert [a["id"] for a in latest] == [1, 2] and latest[0]["name"] == "Giro del lago"
    assert client.get("/coach/activities?limit=0", headers=SAME_ORIGIN).status_code == 422
    assert fake.calls == []
    assert client.post("/coach/sync?force=true", headers=SAME_ORIGIN).json()["status"] == "updated"


def test_database_down_answers_a_message_that_names_it(store, monkeypatch):
    monkeypatch.setattr(main, "store", ActivityStore("postgresql://biketr:x@127.0.0.1:1/nessuno"))
    res = TestClient(main.app).get("/coach/athlete", headers=SAME_ORIGIN)
    assert res.status_code == 503
    assert res.json() == {"error": "database_unreachable",
                          "message": "Database non raggiungibile. Controlla i log con: docker compose logs db"}


def test_every_activity_for_the_cards_quickly_and_with_card_fields_only(store):
    # 2.000 attività con un percorso di 1.500 caratteri: lo storico di anni di uscite.
    many = [{**activity(i, hours_ago=i), "map": {"id": f"a{i}", "summary_polyline": "x" * 1500},
             "segment_efforts": [], "description": "lungo testo"} for i in range(1, 2001)]
    asyncio.run(store.save_activities(store.generation, many))
    client = TestClient(main.app)
    started = time.monotonic()
    res = client.get("/coach/activities", headers=SAME_ORIGIN)
    assert time.monotonic() - started < 1
    cards = res.json()
    assert [c["id"] for c in cards[:3]] == [1, 2, 3] and len(cards) == 2000
    assert set(cards[0]) == {"id", "name", "type", "start_date", "start_date_local", "distance", "moving_time",
                             "total_elevation_gain", "map"}
    assert cards[0]["map"] == {"summary_polyline": "x" * 1500}
    assert len(res.content) < 4_000_000
