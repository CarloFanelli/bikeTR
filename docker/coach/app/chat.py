"""Ciò che Ollama e il provider cloud hanno in comune: il limite di silenzio, l'errore del
modello e i pezzi della risposta. Ogni provider dà il testo man mano che arriva (str),
poi un solo ChatEnd; workout.py non conosce i campi di Ollama o di OpenAI."""

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
class ChatEnd:
    """La fine della risposta: i token letti e scritti (None se il provider non li dice) e
    se il modello si è fermato al limite di token."""
    input_tokens: int | None
    output_tokens: int | None
    truncated: bool


def token_count(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
