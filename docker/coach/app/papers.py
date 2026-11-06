"""Ricerca dei paper: l'indice papers_index.json (i paper con il loro embedding) e i 4
più vicini alla query, come faceva il browser.

L'indice si legge da nginx, che serve già la cartella del progetto: montarlo nel
container come singolo file farebbe creare a Docker una cartella vuota al suo posto
quando il file manca, e `git restore papers_index.json` non funzionerebbe più."""

import math

import httpx

# Il nome host deve essere localhost: nginx rifiuta gli altri (protezione dal DNS rebinding).
INDEX_URL = "http://web/papers_index.json"
INDEX_HEADERS = {"Host": "localhost"}
TOP_K = 4
PAPER_FIELDS = {"pmid", "title", "authors", "year", "abstract", "embedding"}


class PaperIndexError(Exception):
    """Indice dei paper mancante o illeggibile; il messaggio dice come ripristinarlo."""


async def load_index(client: httpx.AsyncClient) -> dict:
    try:
        res = await client.get(INDEX_URL, headers=INDEX_HEADERS)
    except httpx.HTTPError as e:
        raise PaperIndexError("papers_index.json non raggiungibile: controlla nginx con "
                              "docker compose logs web") from e
    if res.status_code != 200:
        raise PaperIndexError(f"papers_index.json non trovato (HTTP {res.status_code}). "
                              "Ripristinalo da git: git restore papers_index.json")
    try:
        index = res.json()
        if not all(PAPER_FIELDS <= p.keys() for p in index["papers"]):
            raise ValueError("campi mancanti")
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise PaperIndexError("papers_index.json illeggibile. Ripristinalo da git: "
                              "git restore papers_index.json") from e
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
