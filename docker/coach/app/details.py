"""Il download in sottofondo dei dettagli corsa: una attività alla volta, dalla più recente con
potenza o frequenza cardiaca, finché tutte li hanno. Usa al massimo 60 richieste ogni 15 minuti
e 600 al giorno (i quarti d'ora e il giorno UTC di Strava), e si ferma prima quando Strava dice
che l'app è vicina al suo limite: le sincronizzazioni dell'app e i segmenti del browser passano
per primi. Un riavvio riparte dalla prima attività ancora senza dettagli."""

import asyncio
from datetime import datetime, timedelta, timezone

from app.activities import ActivityStore
from app.errors import CoachError
from app.strava import StravaRides, StravaUnavailable, log, next_quarter_hour

PER_QUARTER_HOUR = 60
PER_DAY = 600
# Attesa dopo un problema che non dice quando finisce: rete giù, server di autenticazione spento.
RETRY = timedelta(minutes=5)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DetailsDownloader:
    def __init__(self, store: ActivityStore, rides: StravaRides, clock=utc_now, retry: timedelta = RETRY):
        self.store = store
        self.rides = rides
        self.clock = clock
        self.retry = retry
        # Una sincronizzazione o un nuovo collegamento: forse ci sono attività nuove da scaricare.
        self.wake = asyncio.Event()

    def poke(self):
        self.wake.set()

    async def run(self):
        while True:
            # Prima di cercare lavoro: una sincronizzazione che finisce durante step() lo sveglia.
            self.wake.clear()
            try:
                wait = await self.step()
            except Exception as e:
                # Un errore inatteso su un'attività non ferma il download: si riprova più tardi.
                log(f"dettagli in sottofondo: errore {type(e).__name__}, riprovo fra {self.retry}")
                wait = self.retry
            if wait != timedelta(0):
                await self._sleep(wait)

    async def _sleep(self, wait: timedelta | None):
        """Fino a `wait` (None: senza limite), o finché una sincronizzazione non sveglia il download."""
        try:
            await asyncio.wait_for(self.wake.wait(), None if wait is None else wait.total_seconds())
        except TimeoutError:
            pass

    async def step(self) -> timedelta | None:
        """Scarica i dettagli di un'attività. Ritorna quanto aspettare prima della prossima:
        0 subito, None finché una sincronizzazione non porta qualcosa di nuovo."""
        generation = self.store.generation
        now = self.clock()
        ride_id = await self.store.next_without_details(now)
        if ride_id is None:
            return None
        pause = self._pause(now) or await self._over_budget(now)
        if pause:
            return pause
        try:
            token = await self.rides._access_token()
        except CoachError as e:
            # Non collegato: aspetta il prossimo collegamento, che sincronizza e sveglia il download.
            return None if e.code == "not_connected" else self.retry
        except StravaUnavailable:
            return self.retry
        await self.store.record_request(now)
        outcome = await self.rides.download_once(generation, ride_id, token)
        if outcome == "failed":
            await self.store.mark_failed(generation, ride_id, now)
        elif outcome == "stop":
            return self._pause(self.clock()) or self.retry
        return timedelta(0)

    def _pause(self, now: datetime) -> timedelta | None:
        busy = self.rides.busy_until
        return busy - now if busy and busy > now else None

    async def _over_budget(self, now: datetime) -> timedelta | None:
        quarter = next_quarter_hour(now) - timedelta(minutes=15)
        if await self.store.requests_since(quarter) >= PER_QUARTER_HOUR:
            return quarter + timedelta(minutes=15) - now
        day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if await self.store.requests_since(day) >= PER_DAY:
            return day + timedelta(days=1) - now
        return None
