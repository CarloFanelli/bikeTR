"""Il modello di ricerca: trasforma un testo in un vettore (embedding) dentro il servizio
Coach, senza Ollama né un provider cloud. Il Dockerfile lo scarica nell'immagine, quindi
dopo l'installazione funziona anche senza internet."""

import asyncio
import os
import threading

from fastembed import TextEmbedding

SEARCH_MODEL = os.environ["SEARCH_MODEL"]
# Token letti al massimo dal modello, compresi i due segni di inizio e fine: di un testo più
# lungo codifica solo l'inizio.
MAX_TOKENS = 512

_model: TextEmbedding | None = None
_lock = threading.Lock()


def model() -> TextEmbedding:
    """Il modello, caricato dal disco alla prima richiesta (circa un secondo) e poi tenuto in
    memoria. Il lucchetto fa aspettare la seconda di due richieste simultanee, che altrimenti
    lo caricherebbe una seconda volta."""
    global _model
    with _lock:
        if _model is None:
            _model = TextEmbedding(SEARCH_MODEL, cache_dir=os.environ["SEARCH_MODEL_DIR"])
        return _model


def encode_now(texts: list[str]) -> list[list[float]]:
    return [vector.tolist() for vector in model().embed(texts)]


async def encode(text: str) -> list[float]:
    """Il vettore della query di ricerca. Il calcolo occupa il processore: gira in un altro
    thread, così le altre richieste (e Stop) non restano ferme ad aspettarlo."""
    return (await asyncio.to_thread(encode_now, [text]))[0]


def cut(text: str) -> bool:
    """True se il testo supera ciò che il modello legge, e quindi ne è codificato solo l'inizio."""
    return model().token_count(text) >= MAX_TOKENS
