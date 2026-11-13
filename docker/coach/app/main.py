"""Servizio Coach: il lavoro del Coach AI lato server. Raggiunto da nginx su /coach/.

Rotte:
  GET  /coach/status   → il modello chat di .env e, per il cloud, spesa e tetto (nessuna chiamata)
  GET  /coach/ping     → il provider risponde, accetta la chiave e ha il modello? (nessun token)
  POST /coach/workout  → il workout di oggi, come flusso di eventi (una riga JSON l'uno)
  POST /coach/sync     → aggiorna le attività da Strava, al massimo ogni 5 minuti (?force=true:
                         subito, "Aggiorna da Strava"): {status, syncedAt, retryAt}
  GET  /coach/athlete  → atleta, statistiche e ora dell'ultima sincronizzazione salvati:
                         {athlete, stats, syncedAt}, null se nulla è salvato
  GET  /coach/activities?limit=N → le N attività salvate più recenti, come le elenca Strava;
                         senza limit tutte, con i soli campi delle card di Attività
  POST /coach/metrics  → {profile, ids}: il carico di ogni attività salvata fra ids, con i
                         dettagli corsa salvati: {loads: {id: carico}}
  GET  /coach/details/progress → quante attività con potenza o FC hanno i dettagli corsa:
                         {done, total}
  GET  /coach/athlete-data → i dati dell'atleta salvati dall'app, {chiave: valore}
  PUT  /coach/athlete-data/{key} → salva un dato dell'atleta (controllato campo per campo)
  POST /coach/athlete-data/import → {chiave: valore}: i dati di un browser, solo se il server
                         non ne ha (409 not_empty se un altro browser è arrivato prima)
  POST /coach/forget   → cancella attività, dettagli corsa, atleta, statistiche e segmenti
                         salvati e, in Phoenix, le tracce della schermata Coach partite prima
                         (Disconnetti da Strava); impostazioni, calendario, FTP e mesociclo restano
  GET  /coach/library  → i paper che il Coach cerca, senza passaggi, con cosa ne dipende
  GET  /coach/library/{pmid} → i passaggi di un paper, nell'ordine di lettura
  POST /coach/library/search → {query}: fino a 10 paper di PubMed per parole del titolo o degli autori
  POST /coach/library/preview → {pmid}: il paper da PubMed come entrerebbe in libreria (niente salvato)
  POST /coach/library  → {pmid}: aggiunge il paper alla libreria salvata in /data
  DELETE /coach/library/{pmid} → toglie il paper: cancella un aggiunto, nasconde uno di base
  POST /coach/library/{pmid}/restore → rimette un paper di base tolto

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
from typing import Annotated, Any

import httpx
import psycopg
from fastapi import Body, Depends, FastAPI, Header, Query, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from app import cloud, db, graph, library, metrics, ollama, papers, provider, search, tracing, workout
from app.activities import ActivityStore
from app.athlete_data import AthleteData
from app.details import DetailsDownloader
from app.errors import CoachError
from app.spending import SPENDING_FILE, Spending
from app.strava import StravaRides, log, to_ms
from app.trace_deletion import DELETION_FILE, TraceDeletion

# Il file delle corse delle versioni prima del database: le corse ora stanno nel database.
OLD_RIDES_FILE = Path("/data/rides.json")
store = ActivityStore(db.url())
athlete_data = AthleteData(db.url())
cloud_spending = Spending(SPENDING_FILE)
http = httpx.AsyncClient(timeout=15)
rides = StravaRides(store, http)
tracing.setup(tracing.COACH_SCREEN)
trace_deletion = TraceDeletion(DELETION_FILE, http)
saved_library = library.Library(library.LIBRARY_FILE)


def same_origin_only(sec_fetch_site: Annotated[str | None, Header()] = None):
    # Solo la pagina dell'app può usare il Coach: un altro sito non deve poterlo fare.
    if sec_fetch_site and sec_fetch_site != "same-origin":
        raise CoachError(403, "forbidden", "Richiesta rifiutata: arriva da un altro sito")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.migrate(store.conninfo)
    OLD_RIDES_FILE.unlink(missing_ok=True)
    # Una cancellazione delle tracce rimasta in sospeso (Phoenix spento, poi il Coach riavviato) riparte.
    trace_deletion.resume()
    # Il download in sottofondo dei dettagli corsa riparte dalla prima attività che non li ha.
    details = DetailsDownloader(store, rides)
    rides.after_sync = details.poke
    downloading = asyncio.create_task(details.run())
    yield
    downloading.cancel()


app = FastAPI(dependencies=[Depends(same_origin_only)], lifespan=lifespan)


@app.exception_handler(CoachError)
async def coach_error(request: Request, e: CoachError):
    return JSONResponse({"error": e.code, "message": e.message}, status_code=e.status)


@app.exception_handler(psycopg.OperationalError)
async def database_unreachable(request: Request, e: psycopg.OperationalError):
    log(f"database non raggiungibile: {type(e).__name__}")
    return await coach_error(request, CoachError(503, "database_unreachable", db.DATABASE_UNREACHABLE))


async def load_index() -> dict:
    """L'indice che il Coach cerca: i paper di base e quelli aggiunti, letti all'inizio di ogni
    richiesta. Con una libreria salvata illeggibile, i soli paper di base."""
    index, _ = library.searched(await papers.load_index(http), saved_library)
    return index


async def library_view() -> tuple[dict, dict, str | None]:
    """Per la schermata Libreria: i paper di base, quelli che il Coach cerca e l'eventuale messaggio
    sulla libreria salvata. Un indice inutilizzabile la rifiuta con il messaggio del Coach."""
    try:
        base = await papers.load_index(http)
        index, warning = library.searched(base, saved_library)
    except papers.PaperIndexError as e:
        raise CoachError(502, "retrieval", str(e)) from e
    return base, index, warning


async def json_body(request: Request):
    try:
        return await request.json()
    except (ValueError, RecursionError):
        return None


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
    req = workout.parse_request(await json_body(request))
    chat = provider.settings()
    if chat.prices:
        cloud_spending.check(chat.prices.limit)
    events: asyncio.Queue = asyncio.Queue()

    async def produce():
        try:
            with tracing.request(req.duration):
                async with provider.client(chat) as chat_client:
                    await graph.run(req, events.put_nowait, rides=rides, chat=chat, chat_client=chat_client,
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


@app.post("/coach/sync")
async def sync(force: bool = False):
    result = await rides.sync(time.time() * 1000, force)
    return {"status": result.status, "syncedAt": result.synced_at, "retryAt": result.retry_at}


@app.get("/coach/athlete")
async def athlete():
    saved = await store.sync_state()
    if not saved:
        return {"athlete": None, "stats": None, "syncedAt": None}
    return {"athlete": saved["athlete"], "stats": saved["stats"], "syncedAt": to_ms(saved["synced_at"])}


@app.get("/coach/activities")
async def activities(limit: Annotated[int | None, Query(ge=1, le=200)] = None):
    return await store.latest(limit) if limit else await store.cards()


@app.post("/coach/metrics")
async def activity_loads(body: Annotated[Any, Body()]):
    profile, ids = workout.parse_loads_request(body)
    acts = await store.summaries(ids)
    details = await store.details(ids)
    return {"loads": {str(a["id"]): metrics.activity_load(a, details.get(a["id"]), profile) for a in acts}}


@app.get("/coach/details/progress")
async def details_progress():
    return await store.details_progress()


@app.get("/coach/athlete-data")
async def read_athlete_data():
    return await athlete_data.all()


@app.put("/coach/athlete-data/{key}", status_code=204)
async def save_athlete_data(key: str, value: Annotated[Any, Body()]):
    await athlete_data.save(key, value)
    return Response(status_code=204)


@app.post("/coach/athlete-data/import", status_code=204)
async def import_athlete_data(data: Annotated[dict[str, Any], Body()]):
    if not await athlete_data.import_all(data):
        raise CoachError(409, "not_empty", "Il server ha già i dati dell'atleta: quelli del browser non servono.")
    return Response(status_code=204)


@app.post("/coach/forget", status_code=204)
async def forget():
    # Le tracce della schermata Coach contengono i numeri delle corse: vanno via con loro, senza
    # che il clic aspetti Phoenix.
    disconnected = datetime.now(timezone.utc)
    tracing.forget(disconnected)
    await store.forget()
    await athlete_data.forget_strava()
    trace_deletion.schedule(disconnected)
    return Response(status_code=204)


@app.get("/coach/library")
async def library_papers():
    base, index, warning = await library_view()
    return {**library.listing(base, index, saved_library), "warning": warning}


@app.get("/coach/library/{pmid}")
async def library_passages(pmid: str):
    _, index, _ = await library_view()
    return library.passages(index, pmid)


async def addable(request: Request) -> tuple[str, dict]:
    """Il PMID richiesto e i paper di base, se il paper si può aggiungere: numero, non già in
    libreria, sotto il massimo, e libreria salvata leggibile. Nessuna richiesta a PubMed prima."""
    pmid = library.valid_pmid(await json_body(request))
    base, _, _ = await library_view()
    try:
        saved = saved_library.load()
    except library.LibraryUnreadable as e:
        raise CoachError(500, "library_unreadable", str(e)) from e
    library.check_addable(base, saved, pmid)
    return pmid, base


@app.post("/coach/library/search")
async def library_search(request: Request):
    query = library.valid_query(await json_body(request))
    return await asyncio.to_thread(library.matches, query)


@app.post("/coach/library/preview")
async def library_preview(request: Request):
    pmid, _ = await addable(request)
    return library.preview(*await asyncio.to_thread(library.fetch, pmid))


@app.post("/coach/library")
async def library_add(request: Request):
    pmid, base = await addable(request)
    start = time.monotonic()
    paper = await asyncio.to_thread(library.encoded, pmid)
    # Scheda chiusa durante l'indicizzazione: l'atleta non aspetta più il paper, e non lo vedrebbe arrivare.
    if await request.is_disconnected():
        raise CoachError(499, "cancelled", "Aggiunta interrotta: niente è stato salvato")
    await asyncio.to_thread(library.save, saved_library, base, paper)
    return {"pmid": pmid, "passageCount": len(paper["passages"]), "seconds": round(time.monotonic() - start, 1)}


@app.delete("/coach/library/{pmid}")
async def library_remove(pmid: str):
    base, _, _ = await library_view()
    await asyncio.to_thread(library.remove, saved_library, base, pmid)
    return {"pmid": pmid}


@app.post("/coach/library/{pmid}/restore")
async def library_restore(pmid: str):
    await asyncio.to_thread(library.restore, saved_library, pmid)
    return {"pmid": pmid}
