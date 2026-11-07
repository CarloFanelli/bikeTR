"""Servizio Coach: il lavoro del Coach AI lato server. Raggiunto da nginx su /coach/.

Rotte:
  GET  /coach/ping?model=  → Ollama risponde? il modello chat manca?
  POST /coach/workout      → il workout di oggi, come flusso di eventi (una riga JSON l'uno)
  POST /coach/forget       → cancella corse e dettagli corsa salvati (Disconnetti da Strava)

Gli errori sono {error: codice, message: testo in italiano da mostrare}: come risposta
JSON se la richiesta è rifiutata subito, come evento {type: "error", ...} se il flusso
è già partito.
"""

import asyncio
import json
import time
import traceback
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from app import ollama, papers, provider, search, workout
from app.errors import CoachError
from app.spending import SPENDING_FILE, Spending
from app.store import RideStore
from app.strava import StravaRides

store = RideStore(Path("/data/rides.json"))
cloud_spending = Spending(SPENDING_FILE)
http = httpx.AsyncClient(timeout=15)
rides = StravaRides(store, http)


def same_origin_only(sec_fetch_site: Annotated[str | None, Header()] = None):
    # Solo la pagina dell'app può usare il Coach: un altro sito non deve poterlo fare.
    if sec_fetch_site and sec_fetch_site != "same-origin":
        raise CoachError(403, "forbidden", "Richiesta rifiutata: arriva da un altro sito")


app = FastAPI(dependencies=[Depends(same_origin_only)])


@app.exception_handler(CoachError)
async def coach_error(request: Request, e: CoachError):
    return JSONResponse({"error": e.code, "message": e.message}, status_code=e.status)


async def load_index() -> dict:
    return await papers.load_index(http)


@app.get("/coach/ping")
async def ping(model: str = ""):
    model = ollama.chat_model(model)
    try:
        installed = await ollama.installed_models()
    except (httpx.HTTPError, ValueError):
        raise CoachError(503, "ollama_unreachable", f"Coach ok, {ollama.unreachable()}")
    missing = [] if ollama.is_installed(model, installed) else [model]
    return {
        "models": installed,
        "missing": [{"model": m, "command": ollama.pull_command(m)} for m in missing],
    }


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
    await store.forget()
    return Response(status_code=204)
