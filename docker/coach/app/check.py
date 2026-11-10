"""Il controllo di una bozza del modello: va bene, o va rimandata al modello con i motivi. Ogni motivo
è scritto dal codice con le cause, i nomi del catalogo e i numeri, mai con il testo del modello:
finisce nel messaggio al modello, nella traccia e, per l'ultima bozza, sulla scheda."""

import json
import re
from dataclasses import dataclass

from app.jscompat import js_str
from app.protocols import PROTOCOLS
from app.selection_rules import fits, minimum_minutes

# Le bozze di una richiesta, la prima compresa: dopo l'ultima rifiutata scelgono le regole di ripiego.
MAX_DRAFTS = 3


@dataclass(frozen=True)
class Verdict:
    """Le cause per cui la bozza non va bene, in ordine, e un motivo per ognuna; nessuna = accettata."""
    causes: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()

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


def retry_message(verdict: Verdict) -> str:
    """Il messaggio che rimanda la bozza al modello: i motivi, poi la richiesta di una nuova risposta."""
    reasons = "\n".join(f"- {r}" for r in verdict.reasons)
    return f"La tua risposta non va bene:\n{reasons}\nScegli di nuovo e restituisci SOLO il JSON."
