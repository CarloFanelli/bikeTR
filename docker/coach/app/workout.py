"""Il workout di oggi: la richiesta del browser controllata, la ricerca dei paper e la decisione
sull'ultima bozza del modello, con ripieghi deterministici e paper citati con i loro passaggi. La
logica è quella del Coach che girava nel browser; i passi della richiesta li mette in fila il grafo
(app/graph.py)."""

from dataclasses import dataclass
from typing import Awaitable, Callable
from zoneinfo import ZoneInfo

from app import papers, prompts, tracing
from app.check import Verdict, check_draft, citation_label, read_draft
from app.errors import CoachError
from app.jscompat import is_number, js_str, js_truthy
from app.metrics import Profile
from app.protocols import PROTOCOLS
from app.selection_rules import fallback_protocol_id, minimum_minutes

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


def paper_ref(p: dict, quoted: list) -> dict:
    """Il paper come lo mostra la scheda, con i passaggi citati; un testo completo citato porta la sua
    licenza e il suo link, perché la scheda ne riporta il testo."""
    ref = {"pmid": p["pmid"], "title": p["title"], "authors": p["authors"], "year": p["year"],
           "journal": p.get("journal"), "passages": [{"label": s["label"], "text": s["text"]} for s in quoted]}
    if quoted and p.get("textUsed") == "fullText":
        ref |= {"license": p["license"], "licenseUrl": p["licenseUrl"]}
    return ref


def card_papers(listed, razionale: str, protocol_id: str, index: dict, retrieved: list,
                dropped: tuple = ()) -> list[dict]:
    """I paper della scheda: ogni paper citato una volta, nell'ordine della prima citazione (la lista
    dei passaggi usati, poi il razionale), con i passaggi citati tra quelli dati al modello, in ordine
    di etichetta; poi il paper di supporto del protocollo, se manca, con il suo passaggio più vicino
    quando la ricerca l'ha trovato. Solo paper dell'indice e passaggi dati: un'etichetta inventata
    non arriva alla scheda, né una citazione tolta dal controllo (`dropped`)."""
    by_pmid = {}
    for p in index["papers"]:
        by_pmid.setdefault(p["pmid"], p)
    given = {s["label"]: s for p in retrieved for s in p["passages"]}
    quoted: dict[str, dict[str, dict]] = {}
    for pmid, number in papers.citations(listed, razionale):
        if pmid in by_pmid and (pmid, number) not in dropped:
            chosen = quoted.setdefault(pmid, {})
            cited = papers.label(pmid, number) if number is not None else None
            if cited in given:
                chosen[cited] = given[cited]
    source = PROTOCOLS[protocol_id].source_pmid
    if source and source in by_pmid and source not in quoted:
        found = next((p for p in retrieved if p["pmid"] == source), None)
        closest = max(found["passages"], key=lambda s: s["score"]) if found else None
        quoted[source] = {closest["label"]: closest} if closest else {}
    return [paper_ref(by_pmid[pmid], sorted(chosen.values(), key=lambda s: papers.number_of(s["label"])))
            for pmid, chosen in quoted.items()]


def fallback_warning(cause: str, chosen: str | None, duration: int) -> str:
    """L'avviso della scheda: perché le regole di ripiego hanno scelto al posto del modello, dalla
    causa dell'ultima bozza. Solo testo del codice (nomi del catalogo, numeri), mai testo scritto dal
    modello."""
    by_rules = "il Coach ha scelto con le regole di selezione."
    if cause == "truncated":
        return f"⚠️ La risposta del modello si è interrotta prima della fine: {by_rules}"
    if cause == "unreadable":
        return f"⚠️ La risposta del modello non era leggibile: {by_rules}"
    if cause == "not_in_catalog":
        return f"⚠️ Il modello non ha indicato un protocollo del catalogo: {by_rules}"
    if cause == "not_allowed":
        return f"⚠️ Il modello ha scelto {PROTOCOLS[chosen].name}, che non è ammesso oggi: {by_rules}"
    return (f"⚠️ Il modello ha scelto {PROTOCOLS[chosen].name}, che richiede almeno {minimum_minutes(chosen)} "
            f"minuti: con {duration} minuti {by_rules}")


def decide(model_raw: str, ctx: dict, duration: int, index: dict, retrieved: list, truncated: bool = False,
           verdict: Verdict | None = None) -> dict:
    """Dall'ultima bozza del modello al workout, con i paper trovati dalla ricerca (`retrieved`): i
    loro passaggi sono quelli che la scheda può citare. Una bozza che sbaglia solo le citazioni tiene
    protocollo e razionale, senza le citazioni inventate. Una bozza che non si può usare (troncata,
    illeggibile, senza un protocollo del catalogo, con un protocollo che non entra nei minuti o che la
    regola di oggi non ammette) lascia la scelta al primo protocollo che le regole ammettono, con il
    razionale di ripiego, senza i paper del modello e con la causa. `verdict` è quello del controllo
    sulla stessa bozza; senza, il controllo si rifà qui."""
    parsed, chosen = read_draft(model_raw, truncated)
    if verdict is None:
        verdict = check_draft(model_raw, truncated, ctx, duration, retrieved)
    dropped = ()
    if verdict.ok or verdict.causes == ("invented",):
        protocol_id, dropped = chosen, verdict.invented
        razionale = js_str(parsed.get("razionale")) if js_truthy(parsed.get("razionale")) else NO_RATIONALE
        listed, cause, warning = parsed.get("passaggiUsati"), None, None
    else:
        protocol_id = fallback_protocol_id(ctx, duration)
        hard = ctx["polarizzazione"]["hardPct"]
        razionale = (f"Decisione fallback: TSB {js_str(ctx['tsb'])}, polarizzazione hard "
                     f"{'—' if hard is None else js_str(hard)}% → {PROTOCOLS[protocol_id].name}")
        cause = verdict.causes[0]
        listed, warning = [], fallback_warning(cause, chosen, duration)
    tracing.note_decision(chosen, protocol_id, warning)
    return {"protocolId": protocol_id, **PROTOCOLS[protocol_id].build(ctx["ftp"], duration), "razionale": razionale,
            "paperRefs": card_papers(listed, razionale, protocol_id, index, retrieved, dropped),
            "fellBack": warning is not None, "fallbackCause": cause, "fallbackWarning": warning,
            "citationsDropped": [citation_label(*c) for c in dropped]}


def step(name: str, message: str, **extra) -> dict:
    return {"type": "step", "step": name, "message": message, **extra}


async def find_papers(ctx: dict, duration: int, *, embed: Callable[[str], Awaitable[list]],
                      load_index: Callable[[], Awaitable[dict]]) -> tuple[dict, str, list]:
    """La ricerca dei paper per un atleta: l'indice letto, il testo di ricerca e i paper più
    vicini. Un indice rifiutato diventa un errore del Coach, con il messaggio che dice come rimediare."""
    try:
        index = await load_index()
        query = prompts.retrieval_query(ctx, duration)
        return index, query, papers.top_papers(index, await embed(query))
    except papers.PaperIndexError as e:
        raise CoachError(502, "retrieval", str(e)) from e
