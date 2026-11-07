"""Ricerca dei paper: l'indice papers_index.json (i paper con il loro embedding) e i 4
più vicini alla query, come faceva il browser.

L'indice si legge da nginx, che serve già la cartella del progetto: montarlo nel
container come singolo file farebbe creare a Docker una cartella vuota al suo posto
quando il file manca, e `git restore papers_index.json` non funzionerebbe più."""

import math

import httpx

from app.search import SEARCH_MODEL

# Il nome host deve essere localhost: nginx rifiuta gli altri (protezione dal DNS rebinding).
INDEX_URL = "http://web/papers_index.json"
INDEX_HEADERS = {"Host": "localhost"}
TOP_K = 4
PAPER_FIELDS = {"pmid", "title", "authors", "year", "abstract", "embedding"}
RESTORE = "Ripristinalo da git: git restore papers_index.json"
REENCODE = "docker compose run --rm coach-tools python -m app.build_index --reencode"


class PaperIndexError(Exception):
    """Indice dei paper mancante, illeggibile o codificato con un altro modello di ricerca;
    il messaggio dice come rimediare."""


async def load_index(client: httpx.AsyncClient) -> dict:
    try:
        res = await client.get(INDEX_URL, headers=INDEX_HEADERS)
    except httpx.HTTPError as e:
        raise PaperIndexError("papers_index.json non raggiungibile: controlla nginx con "
                              "docker compose logs web") from e
    if res.status_code != 200:
        raise PaperIndexError(f"papers_index.json non trovato (HTTP {res.status_code}). {RESTORE}")
    try:
        index = res.json()
    except ValueError as e:
        raise PaperIndexError(f"papers_index.json illeggibile. {RESTORE}") from e
    return check_index(index)


def check_index(index) -> dict:
    """L'indice, se il Coach può cercarci: almeno un paper, tutti i campi, e i vettori fatti
    dal modello di ricerca in uso (vettori di un altro modello darebbero paper a caso)."""
    try:
        if not index["papers"] or not all(PAPER_FIELDS <= p.keys() for p in index["papers"]):
            raise ValueError("nessun paper o campi mancanti")
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise PaperIndexError(f"papers_index.json illeggibile. {RESTORE}") from e
    if index.get("model") != SEARCH_MODEL:
        raise PaperIndexError(f"papers_index.json è codificato con {index.get('model') or 'un modello senza nome'}, "
                              f"non con il modello di ricerca del Coach ({SEARCH_MODEL}). "
                              f"Ricodificalo con: {REENCODE}")
    return index


def cosine(a: list, b: list) -> float:
    """cosineSim del browser: stessa sequenza di operazioni, quindi stesso risultato al bit."""
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    return dot / (math.sqrt(na) * math.sqrt(nb) or 1)


def top_papers(index: dict, query_embedding: list, k: int = TOP_K) -> list:
    """I k paper più simili. sorted() è stabile: a parità di punteggio vince l'ordine
    dell'indice, come Array.sort del browser."""
    scored = [{**p, "score": cosine(query_embedding, p["embedding"])} for p in index["papers"]]
    return sorted(scored, key=lambda p: p["score"], reverse=True)[:k]
