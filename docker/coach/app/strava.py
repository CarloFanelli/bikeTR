"""Corse da Strava per il Coach: le ultime 60 attività a ogni richiesta e i dettagli corsa
(stream secondo per secondo) delle ultime 40 uscite in bici, scaricati una volta sola.
Il token di accesso viene dal server di autenticazione, che tiene i segreti."""

import asyncio
from dataclasses import dataclass

import httpx

from app.errors import CoachError
from app.metrics import is_bike, ride_details
from app.store import RideStore

AUTH_TOKEN_URL = "http://auth:8080/auth/token"
STRAVA_API = "https://www.strava.com/api/v3"
LIST_SIZE = 60
DETAILED_RIDES = 40
# Solo le cifre che il Coach legge: niente coordinate, mappe del percorso o titoli.
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
    """Strava (o il rinnovo del token) non risponde, risponde con un errore o oltre il limite di richieste."""


@dataclass
class RideData:
    activities: list
    details: dict          # id corsa → dettagli, per le ultime 40 uscite in bici scaricate
    downloaded_at: float   # ms: quando la lista è stata scaricata
    from_saved: bool       # Strava non raggiungibile: lista e dettagli sono quelli salvati
    missing_details: int   # uscite fra le ultime 40 senza dettagli: usano le cifre di riepilogo


def latest_rides(activities: list) -> list:
    return [a["id"] for a in activities if is_bike(a)][:DETAILED_RIDES]


def ride_data(saved: dict, from_saved: bool) -> RideData:
    latest = latest_rides(saved["activities"])
    details = {i: saved["details"][i] for i in latest if i in saved["details"]}
    return RideData(saved["activities"], details, saved["downloaded_at"], from_saved,
                    len(latest) - len(details))


class StravaRides:
    def __init__(self, store: RideStore, client: httpx.AsyncClient):
        self.store = store
        self.client = client
        # Un solo download per corsa: due richieste che vogliono la stessa corsa nuova
        # aspettano lo stesso download.
        self._downloading: dict[tuple[int, int], asyncio.Task] = {}

    async def refresh(self, now_ms: float, progress=None) -> RideData:
        """Scarica la lista e i dettagli mancanti; progress(fatti, totale) dopo ogni dettaglio."""
        generation = self.store.generation
        saved = self.store.load()
        try:
            token = await self._access_token()
            activities, athlete = await self._list(token)
        except StravaUnavailable:
            if self.store.generation != generation:
                raise CoachError(409, "disconnected", DISCONNECTED)
            if not saved:
                raise CoachError(503, "strava_unreachable", STRAVA_UNREACHABLE)
            log("Strava non raggiungibile: uso le corse salvate")
            return ride_data(saved, from_saved=True)

        keep = set(latest_rides(activities))

        def replace_list(old):
            # Un altro atleta, o corse uscite dalle ultime 40: i loro dettagli si scartano.
            same = old and old.get("athlete_id") == athlete
            details = {i: d for i, d in (old["details"] if same else {}).items() if i in keep}
            return {"athlete_id": athlete, "downloaded_at": now_ms,
                    "activities": activities, "details": details}

        if not await self.store.update(generation, replace_list):
            raise CoachError(409, "disconnected", DISCONNECTED)
        saved = self._saved_since(generation)
        todo = [i for i in latest_rides(activities) if i not in saved["details"]]
        failed = 0
        for done, ride_id in enumerate(todo, 1):
            key = (generation, ride_id)
            # Un'altra richiesta, con una lista diversa, può averla già scaricata e salvata.
            if ride_id in self._saved_since(generation)["details"]:
                result = "saved"
            else:
                if key not in self._downloading:
                    task = asyncio.create_task(self._download(generation, ride_id, token))
                    task.add_done_callback(lambda _, k=key: self._downloading.pop(k, None))
                    self._downloading[key] = task
                # shield: se questa richiesta viene abbandonata, il download in corso finisce e si salva.
                result = await asyncio.shield(self._downloading[key])
            if progress:
                progress(done, len(todo))
            failed += result != "saved"
            if result == "stop":
                break
        data = ride_data(self._saved_since(generation), from_saved=False)
        log(f"corse: {len(activities)} attività, {len(todo)} dettagli da scaricare, "
            f"{failed} non riusciti, {data.missing_details} uscite senza dettagli")
        return data

    def _saved_since(self, generation: int) -> dict:
        """I dati salvati, purché "Disconnetti da Strava" non sia arrivato nel frattempo."""
        saved = self.store.load()
        if saved is None or self.store.generation != generation:
            raise CoachError(409, "disconnected", DISCONNECTED)
        return saved

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

    async def _list(self, token: str) -> tuple[list, int | None]:
        try:
            res = await self.client.get(f"{STRAVA_API}/athlete/activities",
                                        params={"per_page": LIST_SIZE}, headers=bearer(token))
        except httpx.HTTPError:
            raise StravaUnavailable()
        if res.status_code in (401, 403):
            raise CoachError(401, "strava_refused", STRAVA_REFUSED)
        try:
            raw = res.json() if res.status_code == 200 else None
        except ValueError:
            raw = None
        if not isinstance(raw, list):
            raise StravaUnavailable()
        athlete = (raw[0].get("athlete") or {}).get("id") if raw else None
        return [{k: a[k] for k in KEPT_FIELDS if k in a} for a in raw], athlete

    async def _download(self, generation: int, ride_id: int, token: str) -> str:
        """"saved"; "failed" (riprova alla prossima richiesta); "stop" (inutile continuare:
        limite di Strava, rete giù o accesso rifiutato)."""
        try:
            res = await self.client.get(
                f"{STRAVA_API}/activities/{ride_id}/streams",
                params={"keys": "time,heartrate,watts,cadence", "key_by_type": "true"},
                headers=bearer(token))
        except httpx.HTTPError:
            return "stop"
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

        def add(old):
            return {**old, "details": {**old["details"], ride_id: details}}

        await self.store.update(generation, add)
        return "saved"


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
