"""Il workout di oggi, dalla richiesta del browser al risultato.

La logica è quella del Coach che girava nel browser: contesto atleta, ricerca dei
paper, scelta del modello, ripieghi deterministici e paper citati. Strada facendo
`emit` manda al browser gli eventi: step, context, token e infine result; ogni passo lascia
anche la sua parte della traccia in Phoenix (app/tracing.py)."""

import json
import re
import time
from dataclasses import dataclass
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

import httpx

from app import papers, prompts, provider, tracing
from app.chat import Accepted, ChatEnd, ModelError
from app.errors import CoachError
from app.jscompat import is_number, js_str, js_truthy
from app.metrics import Profile, coach_context
from app.protocols import PROTOCOLS
from app.selection_rules import fallback_protocol_id, minimum_minutes
from app.spending import Spending, charge, cost
from app.strava import StravaRides

MIN_DURATION, MAX_DURATION = 30, 240
# Campo del profilo inviato dal browser → nome mostrato nei messaggi d'errore.
PROFILE_FIELDS = {"ftp": "FTP", "lthr": "FC soglia", "hrMax": "FC massima", "weight": "peso",
                  "weeklyHours": "ore settimanali", "weeklyDays": "giorni settimanali"}
NO_RATIONALE = "(razionale non fornito)"


@dataclass(frozen=True)
class WorkoutRequest:
    duration: int
    tz: ZoneInfo
    profile: Profile


def parse_duration(value) -> int:
    if not is_number(value) or value != int(value):
        raise CoachError(400, "invalid_duration", "La durata deve essere un numero intero di minuti")
    if not MIN_DURATION <= value <= MAX_DURATION:
        raise CoachError(400, "invalid_duration",
                         f"La durata deve essere tra {MIN_DURATION} e {MAX_DURATION} minuti")
    return int(value)


def parse_time_zone(name) -> ZoneInfo:
    try:
        if isinstance(name, str):
            return ZoneInfo(name)
    except (KeyError, ValueError, OSError):  # KeyError comprende ZoneInfoNotFoundError
        pass
    raise CoachError(400, "invalid_time_zone", "Fuso orario del browser non valido")


def parse_profile(raw) -> Profile:
    """Ogni valore è un numero maggiore di zero, oppure manca (null): allora il Coach usa
    gli stessi valori predefiniti e salta gli stessi calcoli del browser."""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise CoachError(400, "invalid_profile", "Profilo atleta non valido")
    for key, label in PROFILE_FIELDS.items():
        value = raw.get(key)
        if value is not None and not (is_number(value) and value > 0):
            raise CoachError(400, "invalid_profile",
                             f"Valore non valido per {label}: serve un numero maggiore di zero")
    return Profile(ftp=raw.get("ftp"), lthr=raw.get("lthr"), hr_max=raw.get("hrMax"),
                   weight=raw.get("weight"), weekly_hours=raw.get("weeklyHours"),
                   weekly_days=raw.get("weeklyDays"))


def parse_request(body) -> WorkoutRequest:
    """Controlla tutto prima di scaricare corse o chiamare il modello. Il modello lo sceglie
    .env: quello che manda una scheda aperta prima dell'aggiornamento è ignorato."""
    if not isinstance(body, dict):
        raise CoachError(400, "invalid_request", "Richiesta non valida")
    req = WorkoutRequest(duration=parse_duration(body.get("duration")),
                         tz=parse_time_zone(body.get("timeZone")),
                         profile=parse_profile(body.get("profile")))
    if not req.profile.ftp:
        raise CoachError(400, "no_ftp", "FTP non disponibile")
    return req


def parse_model_json(text: str):
    """tryParseModelJSON del browser: il testo intero, altrimenti dalla prima "{"
    all'ultima "}". NaN e Infinity non sono JSON per il browser."""
    def reject(name):
        raise ValueError(name)

    candidates = [text]
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        candidates.append(match.group(0))
    for candidate in candidates:
        try:
            return json.loads(candidate, parse_constant=reject)
        except (ValueError, RecursionError):
            pass
    return None


def paper_ref(p: dict) -> dict:
    return {"pmid": p["pmid"], "title": p["title"], "authors": p["authors"], "year": p["year"],
            "journal": p.get("journal")}


def fallback_warning(parsed, chosen: str | None, duration: int, truncated: bool) -> str:
    """L'avviso della scheda: perché le regole di ripiego hanno scelto al posto del modello. Solo
    testo del codice (nomi del catalogo, numeri), mai testo scritto dal modello."""
    by_rules = "il Coach ha scelto con le regole di selezione."
    if truncated:
        return f"⚠️ La risposta del modello si è interrotta prima della fine: {by_rules}"
    if not isinstance(parsed, dict):
        return f"⚠️ La risposta del modello non era leggibile: {by_rules}"
    if chosen not in PROTOCOLS:
        return f"⚠️ Il modello non ha indicato un protocollo del catalogo: {by_rules}"
    return (f"⚠️ Il modello ha scelto {PROTOCOLS[chosen].name}, che richiede almeno {minimum_minutes(chosen)} "
            f"minuti: con {duration} minuti {by_rules}")


def decide(model_raw: str, ctx: dict, duration: int, index: dict, truncated: bool = False) -> dict:
    """Dal testo del modello al workout. Una risposta che non si può usare (troncata, illeggibile,
    senza un protocollo del catalogo o con un protocollo che non entra nei minuti) lascia la scelta
    al primo protocollo che le regole ammettono, con il razionale di ripiego e senza i paper del modello."""
    parsed = None if truncated else parse_model_json(model_raw)
    chosen = js_str(parsed.get("protocolId")) if isinstance(parsed, dict) else None
    built = PROTOCOLS[chosen].build(ctx["ftp"], duration) if chosen in PROTOCOLS else None
    if built is not None:
        protocol_id = chosen
        razionale = js_str(parsed.get("razionale")) if js_truthy(parsed.get("razionale")) else NO_RATIONALE
        cited = parsed["paperUsati"] if isinstance(parsed.get("paperUsati"), list) else []
        warning = None
    else:
        protocol_id = fallback_protocol_id(ctx, duration)
        built = PROTOCOLS[protocol_id].build(ctx["ftp"], duration)
        hard = ctx["polarizzazione"]["hardPct"]
        razionale = (f"Decisione fallback: TSB {js_str(ctx['tsb'])}, polarizzazione hard "
                     f"{'—' if hard is None else js_str(hard)}% → {PROTOCOLS[protocol_id].name}")
        cited, warning = [], fallback_warning(parsed, chosen, duration, truncated)
    tracing.note_decision(chosen, protocol_id, warning)

    # Paper citati: solo quelli dell'indice, nell'ordine e con i doppioni della risposta;
    # poi la fonte del protocollo dato, se non c'è già.
    by_pmid = {}
    for p in index["papers"]:
        by_pmid.setdefault(p["pmid"], p)
    refs = [by_pmid[js_str(pmid)] for pmid in cited if js_str(pmid) in by_pmid]
    source = PROTOCOLS[protocol_id].source_pmid
    if source and source in by_pmid and all(p["pmid"] != source for p in refs):
        refs.append(by_pmid[source])

    return {"protocolId": protocol_id, **built, "razionale": razionale,
            "paperRefs": [paper_ref(p) for p in refs], "fellBack": warning is not None,
            "fallbackWarning": warning}


def step(name: str, message: str, **extra) -> dict:
    return {"type": "step", "step": name, "message": message, **extra}


async def run(req: WorkoutRequest, emit: Callable[[dict], None], *, rides: StravaRides,
              chat: provider.ChatSettings, chat_client: httpx.AsyncClient,
              embed: Callable[[str], Awaitable[list]], load_index: Callable[[], Awaitable[dict]],
              now_ms: float, spending: Spending) -> None:
    emit(step("rides", "Scarico le corse da Strava…"))
    with tracing.step("rides"):
        data = await rides.refresh(now_ms, progress=lambda done, total: emit(
            step("details", f"Scarico dettagli corse {done}/{total}", done=done, total=total)))
        ctx = coach_context(data.activities, data.details, req.profile, now_ms, req.tz)
        tracing.note_rides(data.from_saved, ctx)
    emit({"type": "context", "context": ctx})
    result = await from_context(ctx, req.duration, emit, chat=chat, chat_client=chat_client, embed=embed,
                                load_index=load_index, spending=spending)
    emit({"type": "result", **result,
          "rides": {"fromSaved": data.from_saved, "downloadedAt": data.downloaded_at,
                    "missingDetails": data.missing_details}})


async def from_context(ctx: dict, duration: int, emit: Callable[[dict], None], *, chat: provider.ChatSettings,
                       chat_client: httpx.AsyncClient, embed: Callable[[str], Awaitable[list]],
                       load_index: Callable[[], Awaitable[dict]], spending: Spending) -> dict:
    """Dal contesto atleta al workout: paper, modello e decisione. Il servizio ci arriva dalle
    corse di Strava, il set di valutazione dai numeri già pronti delle sue situazioni."""
    emit(step("papers", "Recupero paper rilevanti…"))
    started = time.monotonic()
    with tracing.step("papers"):
        try:
            index = await load_index()
            query = prompts.retrieval_query(ctx, duration)
            retrieved = papers.top_papers(index, await embed(query))
        except papers.PaperIndexError as e:
            raise CoachError(502, "retrieval", str(e)) from e
        tracing.note_papers(query, retrieved)

    emit(step("model", "Il modello sta scegliendo il protocollo…"))
    messages = [{"role": "system", "content": prompts.system_prompt(retrieved)},
                {"role": "user", "content": prompts.user_prompt(ctx, duration)}]
    answer, end, accepted = [], ChatEnd(None, None, False), False
    with tracing.step("model"):
        try:
            async for piece in provider.stream(chat, chat_client, messages):
                if isinstance(piece, Accepted):
                    accepted = True
                elif isinstance(piece, ChatEnd):
                    end = piece
                else:
                    answer.append(piece)
                    emit({"type": "token", "text": piece})
        except ModelError as e:
            raise CoachError(502, "model", str(e)) from e
        finally:
            model_raw, answer_cost = "".join(answer), cost(chat.prices, end.input_tokens, end.output_tokens)
            # Anche quando Stop annulla la richiesta: accettata la richiesta, il provider fa pagare
            # ciò che ha già scritto. Una richiesta rifiutata o mai arrivata non costa nulla.
            charged = None   # Ollama non costa nulla
            if chat.prices:
                charged = charge(chat.prices, end.input_tokens, end.output_tokens) if accepted else 0.0
                if accepted:
                    spending.add(charged)
            tracing.note_model(chat, messages, model_raw, end, answer_cost, charged)

    with tracing.step("decision"):
        decision = decide(model_raw, ctx, duration, index, end.truncated)
    return {**decision,
            "retrievedPapers": [{"pmid": p["pmid"], "title": p["title"], "authors": p["authors"],
                                 "year": p["year"], "score": p["score"]} for p in retrieved],
            "provider": chat.provider, "model": chat.model, "seconds": round(time.monotonic() - started, 1),
            "inputTokens": end.input_tokens, "outputTokens": end.output_tokens, "truncated": end.truncated,
            "cost": answer_cost, "modelRaw": model_raw}
