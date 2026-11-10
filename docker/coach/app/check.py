"""Il controllo di una bozza del modello: va bene, o va rimandata al modello con i motivi. Una bozza
deve arrivare intera, leggersi, indicare un protocollo del catalogo che entra nei minuti e che la
regola di selezione di oggi ammette, e citare solo i passaggi dati. Ogni motivo è scritto dal codice
con le cause, i nomi e gli id del catalogo, i numeri e le etichette, mai con il testo del modello:
finisce nel messaggio al modello, nella traccia e, per l'ultima bozza, sulla scheda."""

import json
import re
from dataclasses import dataclass

from app import papers
from app.jscompat import js_str
from app.protocols import PROTOCOLS
from app.selection_rules import fits, minimum_minutes, select

# Le bozze di una richiesta, la prima compresa: dopo l'ultima rifiutata scelgono le regole di ripiego.
MAX_DRAFTS = 3


@dataclass(frozen=True)
class Verdict:
    """Le cause per cui la bozza non va bene, in ordine, e un motivo per ognuna; nessuna = accettata.
    `invented` sono le citazioni fuori dai passaggi dati: (PMID, numero del passaggio o None)."""
    causes: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    invented: tuple[tuple[str, int | None], ...] = ()

    @property
    def ok(self) -> bool:
        return not self.causes


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


def read_draft(model_raw: str, truncated: bool) -> tuple[dict | None, str | None]:
    """Il JSON della bozza e il protocollo che indica: nessuno dei due da una bozza troncata o illeggibile."""
    parsed = None if truncated else parse_model_json(model_raw)
    if not isinstance(parsed, dict):
        return None, None
    return parsed, js_str(parsed.get("protocolId"))


def usable(parsed: dict | None, chosen: str | None, truncated: bool, duration: int) -> Verdict:
    """Una bozza si può usare se è arrivata intera, si legge, indica un protocollo del catalogo e il
    protocollo entra nei minuti."""
    if truncated:
        return Verdict(("truncated",), ("La risposta si è interrotta prima della fine: rispondi più in breve, "
                                        "con il solo oggetto JSON.",))
    if parsed is None:
        return Verdict(("unreadable",), ("La risposta non era un oggetto JSON leggibile: rispondi con il solo "
                                         "oggetto JSON, senza testo prima o dopo.",))
    if chosen not in PROTOCOLS:
        return Verdict(("not_in_catalog",), ("Il protocolId indicato non è un id del catalogo: scegline uno "
                                             "dal catalogo.",))
    if not fits(chosen, duration):
        return Verdict(("too_long",), (f"{PROTOCOLS[chosen].name} richiede almeno {minimum_minutes(chosen)} "
                                       f"minuti e la durata disponibile è {duration} minuti: scegli un protocollo "
                                       "che entra nella durata.",))
    return Verdict()


def cited(parsed: dict | None, model_raw: str) -> list[tuple[str, int | None]]:
    """Le citazioni della risposta, ognuna una volta: le voci della lista dei passaggi usati
    (paperUsati nei file di prima dei passaggi) e ogni etichetta o PMID scritti nel testo, razionale
    compreso. (PMID, numero del passaggio), o (PMID, None) per un paper senza passaggio. Il razionale
    si legge anche decodificato: nel testo grezzo il JSON può scrivere "§" come \\u00a7."""
    lists = [parsed.get(key) for key in ("passaggiUsati", "paperUsati")] if parsed else []
    text = f"{model_raw}\n{js_str(parsed.get('razionale'))}" if parsed else model_raw
    return papers.citations([e for listed in lists if isinstance(listed, list) for e in listed], text)


def not_given(citations, labels_given: set[str], pmids_given: set[str]) -> list[tuple[str, int | None]]:
    """Le citazioni che il modello non ha ricevuto: un'etichetta fuori dai passaggi dati, o il PMID di
    un paper non dato."""
    return [(pmid, number) for pmid, number in citations
            if (papers.label(pmid, number) not in labels_given if number is not None else pmid not in pmids_given)]


def citation_label(pmid: str, number: int | None) -> str:
    return papers.label(pmid, number) if number is not None else f"PMID:{pmid}"


def check_draft(model_raw: str, truncated: bool, ctx: dict, duration: int, retrieved: list) -> Verdict:
    """Il controllo completo: la bozza si può usare, la regola di selezione di oggi ammette il suo
    protocollo nei minuti, e cita solo i passaggi dati (e i loro paper, più la fonte della regola di
    oggi, che il prompt mostra accanto alla regola). Tutte le cause insieme, l'eventuale citazione
    inventata per ultima."""
    parsed, chosen = read_draft(model_raw, truncated)
    verdict = usable(parsed, chosen, truncated, duration)
    if parsed is None:
        return verdict
    causes, reasons = list(verdict.causes), list(verdict.reasons)
    rule, allowed = select(ctx, duration)
    if verdict.ok and chosen not in allowed:
        causes.append("not_allowed")
        reasons.append(f"{PROTOCOLS[chosen].name} ({chosen}) non è ammesso oggi: con la forma, la quota dura e i "
                       f"{duration} minuti di oggi la regola di selezione ammette solo "
                       f"{', '.join(f'{pid} ({PROTOCOLS[pid].name})' for pid in allowed)}.")
    labels_given = {s["label"] for p in retrieved for s in p["passages"]}
    pmids_given = {p["pmid"] for p in retrieved} | ({rule.source_pmid} if rule.source_pmid else set())
    invented = not_given(cited(parsed, model_raw), labels_given, pmids_given)
    if invented:
        causes.append("invented")
        reasons.append(f"Hai citato {', '.join(citation_label(*c) for c in invented)}, che non sono tra i passaggi "
                       "forniti: cita solo le etichette dei passaggi forniti, o lascia passaggiUsati vuoto.")
    return Verdict(tuple(causes), tuple(reasons), tuple(invented))


# Le cause in breve, per la riga del passo sulla schermata Coach.
CAUSE_PHRASES = {
    "truncated": "La risposta si è interrotta",
    "unreadable": "La risposta non era leggibile",
    "not_in_catalog": "Il protocollo scelto non è nel catalogo",
    "too_long": "Il protocollo scelto non entra nei minuti",
    "not_allowed": "Il protocollo scelto non è ammesso oggi",
    "invented": "La risposta cita passaggi non forniti",
}


def retry_step(verdict: Verdict, attempt: int) -> str:
    """La riga del passo quando il controllo rimanda una bozza: le cause in breve e il tentativo."""
    causes = "; ".join(CAUSE_PHRASES[c] for c in verdict.causes)
    return f"{causes}: il modello riprova, tentativo {attempt} di {MAX_DRAFTS}"


def retry_message(verdict: Verdict) -> str:
    """Il messaggio che rimanda la bozza al modello: i motivi, poi la richiesta di una nuova risposta."""
    reasons = "\n".join(f"- {r}" for r in verdict.reasons)
    return f"La tua risposta non va bene:\n{reasons}\nScegli di nuovo e restituisci SOLO il JSON."
