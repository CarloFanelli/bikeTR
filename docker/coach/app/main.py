"""Servizio Coach: il lavoro del Coach AI lato server. Raggiunto da nginx su /coach/.

Rotte:
  GET  /coach/status   → il modello chat di .env e, per il cloud, spesa e tetto (nessuna chiamata)
  GET  /coach/ping     → il provider risponde, accetta la chiave e ha il modello? (nessun token)
  POST /coach/workout  → il workout di oggi, come flusso di eventi (una riga JSON l'uno)
  POST /coach/forget   → cancella corse e dettagli corsa salvati e, in Phoenix, le tracce della
                         schermata Coach partite prima (Disconnetti da Strava)

Gli errori sono {error: codice, message: testo in italiano da mostrare}: come risposta
JSON se la richiesta è rifiutata subito, come evento {type: "error", ...} se il flusso
è già partito.
"""

import asyncio
import json
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from app import cloud, ollama, papers, provider, search, tracing, workout
from app.errors import CoachError
from app.spending import SPENDING_FILE, Spending
from app.store import RideStore
from app.strava import StravaRides
from app.trace_deletion import DELETION_FILE, TraceDeletion

store = RideStore(Path("/data/rides.json"))
cloud_spending = Spending(SPENDING_FILE)
http = httpx.AsyncClient(timeout=15)
rides = StravaRides(store, http)
tracing.setup(tracing.COACH_SCREEN)
trace_deletion = TraceDeletion(DELETION_FILE, http)


def same_origin_only(sec_fetch_site: Annotated[str | None, Header()] = None):
    # Solo la pagina dell'app può usare il Coach: un altro sito non deve poterlo fare.
    if sec_fetch_site and sec_fetch_site != "same-origin":
        raise CoachError(403, "forbidden", "Richiesta rifiutata: arriva da un altro sito")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Una cancellazione delle tracce rimasta in sospeso (Phoenix spento, poi il Coach riavviato) riparte.
    trace_deletion.resume()
    yield


app = FastAPI(dependencies=[Depends(same_origin_only)], lifespan=lifespan)


@app.exception_handler(CoachError)
async def coach_error(request: Request, e: CoachError):
    return JSONResponse({"error": e.code, "message": e.message}, status_code=e.status)


async def load_index() -> dict:
    return await papers.load_index(http)


@app.get("/coach/status")
async def status():
    """Il modello chat di .env e, per il cloud, quanto si è speso e il tetto. Legge solo .env e
    il file della spesa: Impostazioni e il Coach lo chiedono a ogni apertura."""
    chat = provider.settings()
    if chat.prices is None:
        return {"provider": chat.provider, "model": chat.model}
    return {"provider": chat.provider, "model": chat.model, "spent": cloud_spending.total(),
            "limit": chat.prices.limit}


@app.get("/coach/ping")
async def ping():
    """Il controllo della connessione di Impostazioni: il provider risponde, accetta la chiave e
    ha il modello di .env? Chiede l'elenco o la scheda del modello, mai una risposta: nessun
    token speso."""
    chat = provider.settings()
    if chat.provider == "ollama":
        try:
            installed = await ollama.installed_models()
        except (httpx.HTTPError, ValueError):
            raise CoachError(503, "ollama_unreachable", f"Coach ok, {ollama.unreachable()}")
        found = ollama.is_installed(chat.model, installed)
        return {"provider": "ollama", "model": chat.model, "found": found,
                "command": None if found else ollama.pull_command(chat.model)}
    try:
        async with provider.client(chat) as chat_client:
            found = await cloud.find_model(chat_client, chat.model, chat.key)
    except cloud.CloudError as e:
        raise CoachError(502, "provider", str(e)) from e
    return {"provider": "cloud", "model": chat.model, "found": found, "command": None}


@app.post("/coach/workout")
async def generate_workout(request: Request):
    try:
        body = await request.json()
    except (ValueError, RecursionError):
        body = None
    req = workout.parse_request(body)
    chat = provider.settings()
    if chat.prices:
        cloud_spending.check(chat.prices.limit)
    events: asyncio.Queue = asyncio.Queue()

    async def produce():
        try:
            with tracing.request(req.duration):
                async with provider.client(chat) as chat_client:
                    await workout.run(req, events.put_nowait, rides=rides, chat=chat, chat_client=chat_client,
                                      embed=search.encode, load_index=load_index, now_ms=time.time() * 1000,
                                      spending=cloud_spending)
        except CoachError as e:
            events.put_nowait({"type": "error", "error": e.code, "message": e.message})
        except Exception:
            traceback.print_exc()
            events.put_nowait({"type": "error", "error": "internal",
                               "message": "Errore interno del Coach: dettagli con docker compose logs coach"})
        finally:
            events.put_nowait(None)

    async def stream():
        task = asyncio.create_task(produce())
        try:
            while (event := await events.get()) is not None:
                yield json.dumps(event, ensure_ascii=False) + "\n"
        finally:
            task.cancel()

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.post("/coach/forget", status_code=204)
async def forget():
    # Le tracce della schermata Coach contengono i numeri delle corse: vanno via con loro, senza
    # che il clic aspetti Phoenix.
    disconnected = datetime.now(timezone.utc)
    tracing.forget(disconnected)
    await store.forget()
    trace_deletion.schedule(disconnected)
    return Response(status_code=204)
