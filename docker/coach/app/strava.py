"""Le attività da Strava, salvate nel database: la sincronizzazione (tutta la storia la prima
volta, poi le attività nuove e la rilettura degli ultimi 30 giorni, al massimo ogni 5 minuti)
e, per il Coach, le ultime 60 attività con i dettagli corsa (stream secondo per secondo)
delle ultime 40 uscite in bici, scaricati una volta sola.
Il token di accesso viene dal server di autenticazione, che tiene i segreti."""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from app.activities import ActivityStore
from app.errors import CoachError
from app.metrics import is_bike, ride_details

AUTH_TOKEN_URL = "http://auth:8080/auth/token"
STRAVA_API = "https://www.strava.com/api/v3"
LIST_SIZE = 60
DETAILED_RIDES = 40
PAGE_SIZE = 200
SYNC_INTERVAL = timedelta(minutes=5)
# Uso dei 15 minuti, contato da Strava su tutte le richieste dell'app (browser compreso), da
# cui il download in sottofondo si ferma fino al quarto d'ora dopo: il limite è 100.
BUSY_USAGE = 80
REREAD = timedelta(days=30)
# Le cifre che il Coach legge: il resto dell'attività (nome, percorso) resta per le schermate.
KEPT_FIELDS = ("id", "type", "start_date_local", "moving_time", "distance",
               "weighted_average_watts", "average_watts", "average_heartrate",
               "has_heartrate", "total_elevation_gain", "suffer_score")

AUTH_UNREACHABLE = "Server di autenticazione non raggiungibile. Controlla i log con: docker compose logs auth"
NOT_CONNECTED = "Non connesso a Strava: ricarica la pagina e usa \"Collega Strava\"."
STRAVA_REFUSED = "Strava ha rifiutato l'accesso: usa \"Disconnetti da Strava\" e collega di nuovo Strava."
STRAVA_UNREACHABLE = "Strava non raggiungibile, riprova più tardi"
DISCONNECTED = "Strava scollegato durante il download delle corse"


# I log contengono solo conteggi: mai token, coordinate o dati delle corse.
def log(msg: str):
    print(f"[coach] {msg}", flush=True)


class StravaUnavailable(Exception):
    """Strava (o il rinnovo del token) non risponde, risponde con un errore o oltre il limite di
    richieste; in quel caso `paused_until` è l'inizio del prossimo quarto d'ora, quando Strava
    azzera il conteggio."""

    def __init__(self, paused_until: datetime | None = None):
        super().__init__()
        self.paused_until = paused_until


def next_quarter_hour(now: datetime) -> datetime:
    start = now.replace(minute=now.minute - now.minute % 15, second=0, microsecond=0)
    return start + timedelta(minutes=15)


def to_ms(moment: datetime | None) -> float | None:
    return round(moment.timestamp() * 1000) if moment else None


@dataclass
class SyncResult:
    status: str               # "updated", "recent" (controllato da meno di 5 minuti), "unreachable", "paused"
    synced_at: int | None     # ms: l'ultima sincronizzazione arrivata in fondo
    retry_at: int | None      # ms, con "paused": quando Strava accetta di nuovo richieste


@dataclass
class RideData:
    activities: list
    details: dict          # id corsa → dettagli, per le ultime 40 uscite in bici scaricate
    downloaded_at: int | None  # ms: l'ultima sincronizzazione arrivata in fondo
    from_saved: bool       # Strava non raggiungibile: lista e dettagli sono quelli salvati
    missing_details: int   # uscite fra le ultime 40 senza dettagli: usano le cifre di riepilogo


def latest_rides(activities: list) -> list:
    return [a["id"] for a in activities if is_bike(a)][:DETAILED_RIDES]


def ride_data(activities: list, details: dict, downloaded_at: int | None, from_saved: bool) -> RideData:
    latest = latest_rides(activities)
    kept = {i: details[i] for i in latest if i in details}
    return RideData(activities, kept, downloaded_at, from_saved, len(latest) - len(kept))


class StravaRides:
    def __init__(self, store: ActivityStore, client: httpx.AsyncClient):
        self.store = store
        self.client = client
        # Una sola sincronizzazione alla volta: chi arriva durante una in corso aspetta quella.
        # La sincronizzazione in corso, con la generation in cui è partita.
        self._sync: tuple[int, asyncio.Task] | None = None
        # I download in corso, uno per corsa (download_once).
        self._downloading: dict[tuple[int, int], asyncio.Task] = {}
        # Fino a quando Strava va lasciato in pace: dopo un "troppe richieste" o un uso dei
        # 15 minuti da BUSY_USAGE in su. Lo legge il download in sottofondo.
        self.busy_until: datetime | None = None
        # Chiamata dopo ogni sincronizzazione arrivata in fondo: sveglia il download in sottofondo.
        self.after_sync = lambda: None

    async def sync(self, now_ms: float, force: bool = False) -> SyncResult:
        """force ("Aggiorna da Strava"): senza aspettare i 5 minuti; una sincronizzazione già in
        corso resta l'unica, e chi la chiede ne riceve il risultato."""
        # Una partita prima di "Disconnetti da Strava" non salva più nulla: il nuovo collegamento
        # ne fa partire un'altra.
        if self._sync is None or self._sync[1].done() or self._sync[0] != self.store.generation:
            self._sync = (self.store.generation, asyncio.create_task(self._run_sync(now_ms, force)))
        # shield: se chi aspetta viene abbandonato, la sincronizzazione finisce e si salva.
        return await asyncio.shield(self._sync[1])

    async def _run_sync(self, now_ms: float, force: bool) -> SyncResult:
        generation = self.store.generation
        now = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc)
        saved = await self.store.sync_state()
        if saved and not force and now - saved["checked_at"] < SYNC_INTERVAL:
            return SyncResult("recent", to_ms(saved["synced_at"]), None)
        try:
            token = await self._access_token()
            athlete = await self._get(token, "/athlete")
            stats = await self._get(token, f"/athletes/{athlete['id']}/stats")
            self._saved(await self.store.start_sync(generation, athlete, stats, now))
            if (await self.store.sync_state())["history_complete"]:
                listed = await self._recent_pages(generation, token, now)
            else:
                listed = await self._older_pages(generation, token)
            self._saved(await self.store.finish_sync(generation, now, history_complete=True))
        except StravaUnavailable as e:
            if self.store.generation != generation:
                raise CoachError(409, "disconnected", DISCONNECTED)
            if saved:
                await self.store.mark_checked(generation, now)
            saved = await self.store.sync_state()
            status = "paused" if e.paused_until else "unreachable"
            log(f"sincronizzazione non riuscita: Strava {status}")
            return SyncResult(status, to_ms(saved and saved["synced_at"]), to_ms(e.paused_until))
        log(f"sincronizzazione: {listed} attività lette da Strava")
        self.after_sync()
        return SyncResult("updated", to_ms(now), None)

    async def _older_pages(self, generation: int, token: str) -> int:
        """La storia, dalla più nuova alla prima: ogni pagina continua da prima dell'attività più
        vecchia salvata, così una sincronizzazione interrotta riparte da dove era arrivata."""
        listed = 0
        while True:
            oldest, _ = await self.store.oldest_and_newest()
            params = {"per_page": PAGE_SIZE}
            if oldest:
                params["before"] = int(oldest.timestamp())
            page = await self._list(token, params)
            self._saved(await self.store.save_activities(generation, page))
            listed += len(page)
            if len(page) < PAGE_SIZE:
                return listed

    async def _recent_pages(self, generation: int, token: str, now: datetime) -> int:
        """Le attività nuove e quelle degli ultimi 30 giorni: chi ha cambiato nome o tipo si
        aggiorna, chi non c'è più è stato cancellato su Strava."""
        _, newest = await self.store.oldest_and_newest()
        after = min(newest, now - REREAD) if newest else now - REREAD
        listed: list[dict] = []
        page_number = 1
        while True:
            page = await self._list(token, {"after": int(after.timestamp()), "per_page": PAGE_SIZE,
                                            "page": page_number})
            listed += page
            if len(page) < PAGE_SIZE:
                break
            page_number += 1
        self._saved(await self.store.save_activities(generation, listed))
        self._saved(await self.store.remove_missing(generation, after, {a["id"] for a in listed}))
        return len(listed)

    async def refresh(self, now_ms: float, progress=None) -> RideData:
        """Per il Coach: sincronizza, poi scarica i dettagli mancanti delle ultime 40 uscite in
        bici; progress(fatti, totale) dopo ogni dettaglio."""
        result = await self.sync(now_ms)
        generation = self.store.generation
        activities = [{k: a[k] for k in KEPT_FIELDS if k in a} for a in await self.store.latest(LIST_SIZE)]
        from_saved = result.status in ("unreachable", "paused")
        if from_saved and not activities:
            raise CoachError(503, "strava_unreachable", STRAVA_UNREACHABLE)
        details = await self.store.details(latest_rides(activities))
        todo = [] if from_saved else [i for i in latest_rides(activities) if i not in details]
        token = None
        if todo:
            try:
                token = await self._access_token()
            except StravaUnavailable:
                # Il server di autenticazione non raggiunge Strava: bastano i dettagli salvati.
                todo = []
        if todo:
            failed = 0
            for done, ride_id in enumerate(todo, 1):
                outcome = await self.download_once(generation, ride_id, token)
                if outcome == "disconnected":
                    raise CoachError(409, "disconnected", DISCONNECTED)
                if progress:
                    progress(done, len(todo))
                failed += outcome != "saved"
                if outcome == "stop":
                    break
            details = await self.store.details(latest_rides(activities))
            log(f"corse: {len(todo)} dettagli da scaricare, {failed} non riusciti")
        return ride_data(activities, details, result.synced_at, from_saved)

    async def download_once(self, generation: int, ride_id: int, token: str) -> str:
        """I dettagli di una corsa, come _download. Un solo download per corsa: due richieste che
        vogliono la stessa corsa (il Coach e il download in sottofondo) aspettano lo stesso."""
        key = (generation, ride_id)
        if key not in self._downloading:
            task = asyncio.create_task(self._download(generation, ride_id, token))
            task.add_done_callback(lambda _, k=key: self._downloading.pop(k, None))
            self._downloading[key] = task
        # shield: se chi aspetta viene abbandonato, il download in corso finisce e si salva.
        return await asyncio.shield(self._downloading[key])

    def _note_usage(self, res: httpx.Response):
        """Dalle intestazioni di Strava, l'uso dei 15 minuti ("15min,giorno"): oltre BUSY_USAGE,
        o con un "troppe richieste", il download in sottofondo aspetta il prossimo quarto d'ora."""
        used = 0
        for name in ("X-RateLimit-Usage", "X-ReadRateLimit-Usage"):
            try:
                used = max(used, int(res.headers.get(name, "").split(",")[0]))
            except ValueError:
                pass
        if res.status_code == 429 or used >= BUSY_USAGE:
            self.busy_until = next_quarter_hour(datetime.now(timezone.utc))

    def _saved(self, written: bool):
        if not written:
            raise CoachError(409, "disconnected", DISCONNECTED)

    async def _access_token(self) -> str:
        try:
            res = await self.client.get(AUTH_TOKEN_URL)
        except httpx.HTTPError:
            raise CoachError(502, "auth_unreachable", AUTH_UNREACHABLE)
        if res.status_code == 401:
            raise CoachError(401, "not_connected", NOT_CONNECTED)
        if res.status_code == 502:
            raise StravaUnavailable()
        try:
            if res.status_code != 200:
                raise ValueError(res.status_code)
            return res.json()["access_token"]
        except (ValueError, KeyError, TypeError):
            raise CoachError(502, "auth_unreachable", AUTH_UNREACHABLE)

    async def _get(self, token: str, path: str, params: dict | None = None):
        try:
            res = await self.client.get(f"{STRAVA_API}{path}", params=params, headers=bearer(token))
        except httpx.HTTPError:
            raise StravaUnavailable()
        self._note_usage(res)
        if res.status_code in (401, 403):
            raise CoachError(401, "strava_refused", STRAVA_REFUSED)
        if res.status_code == 429:
            raise StravaUnavailable(self.busy_until)
        try:
            body = res.json() if res.status_code == 200 else None
        except ValueError:
            body = None
        if body is None:
            raise StravaUnavailable()
        return body

    async def _list(self, token: str, params: dict) -> list:
        page = await self._get(token, "/athlete/activities", params)
        if not isinstance(page, list):
            raise StravaUnavailable()
        return page

    async def _download(self, generation: int, ride_id: int, token: str) -> str:
        """"saved"; "failed" (riprova alla prossima richiesta); "stop" (inutile continuare:
        limite di Strava, rete giù o accesso rifiutato); "disconnected" (Disconnetti nel frattempo)."""
        try:
            res = await self.client.get(
                f"{STRAVA_API}/activities/{ride_id}/streams",
                params={"keys": "time,heartrate,watts,cadence", "key_by_type": "true"},
                headers=bearer(token))
        except httpx.HTTPError:
            return "stop"
        self._note_usage(res)
        if res.status_code in (401, 403, 429):
            return "stop"
        try:
            streams = res.json() if res.status_code == 200 else None
            # Come nel browser, una risposta che non è un oggetto vale "corsa senza stream".
            details = None if streams is None else ride_details(streams if isinstance(streams, dict) else {})
        except (ValueError, AttributeError):
            details = None
        if details is None:
            return "failed"
        return "saved" if await self.store.save_details(generation, ride_id, details) else "disconnected"


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
