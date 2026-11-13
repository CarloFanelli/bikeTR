"""Il download in sottofondo dei dettagli corsa, con lo Strava simulato di test_sync.py: l'ordine
(dalla più recente, le fallite per ultime), il budget di 60 richieste ogni 15 minuti e 600 al
giorno, la pausa quando Strava dice che l'app è vicina al limite, la ripresa dopo un riavvio."""

import asyncio
from datetime import datetime, timedelta, timezone

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import main
from app.activities import ActivityStore
from app.details import DetailsDownloader
from test_sync import NOW, SAME_ORIGIN, FakeStrava, activity, rides, saved_details, strava_rides, sync

# Il 13 novembre 2026 alle 10:07 UTC: il quarto d'ora è iniziato alle 10:00.
CLOCK = datetime(2026, 11, 13, 10, 7, tzinfo=timezone.utc)


def walk(i: int) -> dict:
    return {**activity(i, kind="Walk"), "has_heartrate": False}


@pytest.fixture
def store(activity_store) -> ActivityStore:
    return activity_store


def downloader(store, fake, clock=lambda: CLOCK) -> DetailsDownloader:
    return DetailsDownloader(store, strava_rides(store, fake), clock=clock)


def steps(d: DetailsDownloader, times: int = 50) -> list:
    """Esegue il download un passo alla volta finché non c'è da aspettare; ritorna le attese."""
    async def go():
        waits = []
        for _ in range(times):
            wait = await d.step()
            waits.append(wait)
            if wait != timedelta(0):
                break
        return waits
    return asyncio.run(go())


def record_requests(store, at: datetime, count: int):
    with psycopg.connect(store.conninfo) as conn:
        conn.execute("INSERT INTO detail_requests (at) SELECT %s FROM generate_series(1, %s)", (at, count))


def test_every_activity_with_power_or_heart_rate_gets_details_newest_first(store):
    fake = FakeStrava(rides([3, 1, 2]) + [walk(4), {**activity(5, kind="VirtualRide"), "has_heartrate": False,
                                                    "device_watts": True}])
    sync(store, fake)
    assert asyncio.run(store.details_progress()) == {"done": 0, "total": 4}
    assert steps(downloader(store, fake))[-1] is None
    assert fake.stream_calls() == [1, 2, 3, 5]
    assert saved_details(store) == [1, 2, 3, 5]
    assert asyncio.run(store.details_progress()) == {"done": 4, "total": 4}


def test_a_failed_activity_is_retried_after_the_others_once_a_day(store):
    fake = FakeStrava(rides([1, 2, 3]))
    fake.streams[1] = 500
    sync(store, fake)
    # Fallisce sempre: non consuma le richieste del giorno riprovandola di continuo.
    assert steps(downloader(store, fake))[-1] is None
    assert fake.stream_calls() == [1, 2, 3]
    assert steps(downloader(store, fake, clock=lambda: CLOCK + timedelta(hours=23)))[-1] is None
    assert fake.stream_calls() == [1, 2, 3]
    del fake.streams[1]
    steps(downloader(store, fake, clock=lambda: CLOCK + timedelta(days=1)))
    assert fake.stream_calls() == [1, 2, 3, 1]
    assert saved_details(store) == [1, 2, 3]


def test_a_restart_resumes_from_the_first_activity_without_details(store):
    fake = FakeStrava(rides([1, 2, 3]))
    sync(store, fake)
    asyncio.run(downloader(store, fake).step())
    restarted = ActivityStore(store.conninfo)
    steps(DetailsDownloader(restarted, strava_rides(restarted, fake), clock=lambda: CLOCK))
    assert fake.stream_calls() == [1, 2, 3]


def test_60_requests_in_the_quarter_hour_pause_until_it_ends_while_syncs_go_through(store):
    fake = FakeStrava(rides([1, 2]))
    sync(store, fake)
    record_requests(store, CLOCK.replace(minute=0), 59)
    record_requests(store, CLOCK.replace(minute=0) - timedelta(seconds=1), 30)   # il quarto d'ora prima
    assert steps(downloader(store, fake)) == [timedelta(0), timedelta(minutes=8)]
    assert fake.stream_calls() == [1]
    fake.list_queries.clear()
    assert sync(store, fake, NOW + 10 * 60 * 1000).status == "updated"
    assert fake.list_queries


def test_600_requests_in_the_day_pause_until_midnight_utc(store):
    fake = FakeStrava(rides([1]))
    sync(store, fake)
    record_requests(store, CLOCK.replace(hour=1), 600)
    assert steps(downloader(store, fake)) == [timedelta(hours=13, minutes=53)]
    assert fake.stream_calls() == []


def test_strava_near_its_limit_pauses_the_download_first(store):
    fake = FakeStrava(rides([1, 2, 3]))
    fake.usage = "85,300"
    sync(store, fake)
    d = downloader(store, fake, clock=lambda: datetime.now(timezone.utc))
    waits = steps(d)
    assert fake.stream_calls() == [1]
    assert timedelta(0) < waits[-1] <= timedelta(minutes=15)


def test_too_many_requests_pauses_until_the_next_quarter_hour(store):
    fake = FakeStrava(rides([1, 2]))
    fake.streams[1] = 429
    sync(store, fake)
    waits = steps(downloader(store, fake, clock=lambda: datetime.now(timezone.utc)))
    assert fake.stream_calls() == [1]
    assert timedelta(0) < waits[-1] <= timedelta(minutes=15)
    assert saved_details(store) == []


def test_not_connected_waits_for_the_next_connection(store):
    fake = FakeStrava(rides([1]))
    sync(store, fake)
    fake.auth = 401
    assert steps(downloader(store, fake)) == [None]
    fake.auth = "down"
    assert steps(downloader(store, fake)) == [timedelta(minutes=5)]
    assert fake.stream_calls() == []


def test_disconnect_during_a_download_saves_nothing(store):
    fake = FakeStrava(rides([1, 2]))
    sync(store, fake)

    async def disconnect(_):
        await store.forget()
    fake.on_stream = disconnect
    assert steps(downloader(store, fake))[-1] is None
    assert saved_details(store) == []


def test_the_coach_and_the_background_download_share_one_request(store):
    fake = FakeStrava(rides([1]))
    fake.on_stream = lambda _: asyncio.sleep(0.02)
    sync(store, fake)

    async def go():
        sr = strava_rides(store, fake)
        d = DetailsDownloader(store, sr, clock=lambda: CLOCK)
        await asyncio.gather(d.step(), sr.refresh(NOW))
    asyncio.run(go())
    assert fake.stream_calls() == [1]


def test_an_unexpected_error_does_not_stop_the_download_and_a_sync_wakes_it(store, monkeypatch):
    fake = FakeStrava(rides([1, 2]))

    async def go():
        sr = strava_rides(store, fake)
        d = DetailsDownloader(store, sr, clock=lambda: CLOCK, retry=timedelta(milliseconds=10))
        sr.after_sync = d.poke
        real = store.next_without_details
        calls = 0

        async def broken_once(now):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("guasto")
            return await real(now)
        monkeypatch.setattr(store, "next_without_details", broken_once)
        task = asyncio.create_task(d.run())
        await asyncio.sleep(0.05)            # niente da scaricare: aspetta una sincronizzazione
        await sr.sync(NOW)
        for _ in range(200):
            if len(fake.stream_calls()) == 2:
                break
            await asyncio.sleep(0.01)
        task.cancel()
    asyncio.run(go())
    assert fake.stream_calls() == [1, 2]


def test_a_sync_finishing_while_the_download_looks_for_work_is_not_lost(store, monkeypatch):
    fake = FakeStrava(rides([1]))

    async def go():
        sr = strava_rides(store, fake)
        d = DetailsDownloader(store, sr, clock=lambda: CLOCK)
        real = store.next_without_details
        first = True

        async def sync_arrives_meanwhile(now):
            nonlocal first
            if first:
                # Nulla da scaricare ancora: la sincronizzazione finisce proprio adesso.
                first = False
                await sr.sync(NOW)
                d.poke()
                return None
            return await real(now)
        monkeypatch.setattr(store, "next_without_details", sync_arrives_meanwhile)
        task = asyncio.create_task(d.run())
        for _ in range(100):
            if fake.stream_calls():
                break
            await asyncio.sleep(0.01)
        task.cancel()
    asyncio.run(go())
    assert fake.stream_calls() == [1]


def test_progress_route(store):
    sync(store, FakeStrava(rides([1, 2]) + [walk(3)]))
    asyncio.run(store.save_details(store.generation, 1, {"np": 200, "watts_n": 10, "hr_mean": None, "hr_n": 0}))
    assert TestClient(main.app).get("/coach/details/progress", headers=SAME_ORIGIN).json() == {"done": 1, "total": 2}
