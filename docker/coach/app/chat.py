"""Ciò che Ollama e il provider cloud hanno in comune: il limite di silenzio, l'errore del
modello e i pezzi della risposta. Ogni provider dà Accepted quando accetta la richiesta, il
testo man mano che arriva (str) e le richieste di strumenti (ToolCall), poi un solo ChatEnd;
workout.py e graph.py non conoscono i campi di Ollama o di OpenAI."""

from dataclasses import dataclass

import httpx

# Secondi di silenzio concessi al modello tra un pezzo di risposta e il successivo,
# compresa l'attesa della prima parola (o del ragionamento nascosto); il tempo totale
# non ha limite.
READ_TIMEOUT = 180
# Il default di httpx è 5 secondi per ogni attesa: su CPU, o con un modello cloud che
# ragiona, la prima parola arriva anche minuti dopo.
TIMEOUT = httpx.Timeout(10, read=READ_TIMEOUT)


class ModelError(Exception):
    """Il modello non risponde, non c'è o risponde con un errore; il messaggio è per l'utente."""


@dataclass(frozen=True)
class Accepted:
    """Il provider ha accettato la richiesta (HTTP 200) e comincia a rispondere. Da qui in poi
    fa pagare ciò che scrive, anche se la risposta si interrompe; prima, non è costata nulla."""


@dataclass(frozen=True)
class ChatEnd:
    """La fine della risposta: i token letti e scritti (None se il provider non li dice) e
    se il modello si è fermato al limite di token."""
    input_tokens: int | None
    output_tokens: int | None
    truncated: bool


def token_count(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


@dataclass(frozen=True)
class ToolCall:
    """Il modello chiede uno strumento: l'id che il provider gli dà (vuoto se non ne dà), il nome e
    gli argomenti come il modello li ha scritti (un oggetto, o il testo JSON che lo contiene)."""
    id: str
    name: str
    arguments: object


def no_tools(model: str) -> str:
    """Il messaggio per un modello che non sa chiedere strumenti, con COACH_SEARCH_MODE=model o
    COACH_RIDE_TOOLS=on."""
    return (f"Il modello {model} non sa usare gli strumenti, quindi non può cercare da solo i paper né guardare "
            "le uscite: scegli un altro modello chat in .env, o metti COACH_SEARCH_MODE=fixed e COACH_RIDE_TOOLS=off.")
