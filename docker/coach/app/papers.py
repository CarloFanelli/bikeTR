"""Ricerca dei paper per passaggi: l'indice papers_index.json (i paper tagliati in passaggi di
frasi intere, ognuno con il suo vettore) e i 4 paper con i passaggi più vicini alla query,
cercati in un database vettoriale in memoria (sqlite-vec).

L'indice si legge da nginx, che serve già la cartella del progetto: montarlo nel
container come singolo file farebbe creare a Docker una cartella vuota al suo posto
quando il file manca, e `git restore papers_index.json` non funzionerebbe più."""

import re
import sqlite3
from contextlib import closing

import httpx
import sqlite_vec

from app.jscompat import js_str
from app.search import SEARCH_MODEL

# Il nome host deve essere localhost: nginx rifiuta gli altri (protezione dal DNS rebinding).
INDEX_URL = "http://web/papers_index.json"
INDEX_HEADERS = {"Host": "localhost"}
TOP_K = 4
PASSAGES_PER_PAPER = 2
PASSAGE_CHARS = 600
# Il k più grande che sqlite-vec accetta in una ricerca dei vicini.
KNN_LIMIT = 4096
PAPER_FIELDS = {"pmid", "title", "authors", "year", "abstract", "textUsed", "passages"}
PASSAGE_FIELDS = {"label", "text", "embedding"}
RESTORE = "Ripristinalo da git: git restore papers_index.json"
REBUILD = "docker compose run --rm coach-tools python -m app.build_index"
REENCODE = f"{REBUILD} --reencode"

# La fine di una frase: punto, punto esclamativo o interrogativo (con le eventuali virgolette o
# parentesi che li chiudono), spazio, e una frase che comincia con una maiuscola, una cifra o
# un'apertura. "2.5 W/kg" non ha spazio dopo il punto, quindi non la spezza.
SENTENCE_END = re.compile(r"([.!?]['\")\]]*)\s+(?=[A-Z0-9(\[\"'])")
# Le parole il cui punto non chiude la frase ("vs. Z2", "e.g. VO2max", "Fig. 2", "et al. (2010)").
ABBREVIATIONS = {"e.g", "i.e", "vs", "fig", "figs", "al", "cf", "approx", "ca", "eq", "ref", "refs", "tab", "no", "dr"}
# Un passaggio citato nel testo, come lo scrivono i modelli ("[PMID:21812820 §2]", "PMID 21812820 § 2",
# "PMID:21812820, §2"), o un paper senza passaggio ("[PMID:21812820]").
CITED_IN_TEXT = re.compile(r"PMID\W{0,3}(\d+)(?:[\s,;]*§\s*(\d+))?", re.IGNORECASE)
# In una voce della lista dei passaggi usati basta il numero: "21812820", "21812820 §2".
CITED_IN_LIST = re.compile(r"(?:PMID\W{0,3})?(\d+)(?:[\s,;]*§\s*(\d+))?", re.IGNORECASE)


class PaperIndexError(Exception):
    """Indice dei paper mancante, illeggibile o codificato con un altro modello di ricerca;
    il messaggio dice come rimediare."""


def sentences(text: str) -> list[str]:
    """Le frasi del testo, in ordine. Il titolo di una sezione di un abstract strutturato
    ("METHODS:") resta attaccato alla frase che lo segue."""
    found, start = [], 0
    for m in SENTENCE_END.finditer(text):
        word = text[start:m.start()].rsplit(maxsplit=1)[-1:]
        if m.group(1) == "." and word and word[0].lstrip("([\"'").lower() in ABBREVIATIONS:
            continue
        found.append(text[start:m.end(1)])
        start = m.end()
    return [*found, text[start:]] if text[start:] else found


def cut_passages(pmid: str, *sections: str) -> list[dict]:
    """Le sezioni del testo in passaggi, con l'etichetta "PMID:n §k" numerata da 1 nell'ordine di
    lettura: ogni sezione si taglia da sola, quindi un passaggio non mescola mai due sezioni."""
    texts = [passage for section in sections for passage in section_passages(section)]
    return [{"label": label(pmid, k), "text": t} for k, t in enumerate(texts, 1)]


def section_passages(text: str) -> list[str]:
    """Il testo in passaggi di frasi intere, al massimo PASSAGE_CHARS caratteri. Una frase più
    lunga di un passaggio si taglia all'ultimo spazio prima del limite e continua nel passaggio dopo."""
    pieces = []
    for sentence in sentences(text):
        while len(sentence) > PASSAGE_CHARS:
            cut = sentence.rfind(" ", 0, PASSAGE_CHARS + 1)
            cut = cut if cut > 0 else PASSAGE_CHARS   # una sola "parola" più lunga di un passaggio
            pieces.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        pieces.append(sentence)
    passages = []
    for piece in pieces:
        if passages and len(passages[-1]) + 1 + len(piece) <= PASSAGE_CHARS:
            passages[-1] += " " + piece
        else:
            passages.append(piece)
    return passages


def citations(listed, text: str) -> list[tuple[str, int | None]]:
    """Le citazioni di una risposta, ognuna una volta, prima quelle della lista dei passaggi usati e
    poi quelle del testo: (PMID, numero del passaggio), o (PMID, None) per un paper senza passaggio.
    Un numero nel testo senza "PMID" davanti (TSB, minuti) non è una citazione."""
    entries = [js_str(e) for e in listed] if isinstance(listed, list) else []
    found = [*(m for e in entries for m in CITED_IN_LIST.finditer(e)), *CITED_IN_TEXT.finditer(text)]
    return list(dict.fromkeys((m[1], int(m[2]) if m[2] else None) for m in found))


def label(pmid: str, number: int) -> str:
    return f"PMID:{pmid} §{number}"


def number_of(passage_label: str) -> int:
    """Il numero del passaggio nella sua etichetta: "PMID:21812820 §12" dà 12."""
    return int(passage_label.rsplit("§", 1)[1])


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


def usable(paper: dict, dim) -> bool:
    """Tutti i campi, licenza e suo link per un testo completo, e passaggi con vettori della
    lunghezza dichiarata dall'indice (embeddingDim)."""
    return (PAPER_FIELDS <= paper.keys() and bool(paper["passages"])
            and (paper["textUsed"] != "fullText" or bool(paper.get("license") and paper.get("licenseUrl")))
            and all(PASSAGE_FIELDS <= s.keys() and len(s["embedding"]) == dim for s in paper["passages"]))


def check_index(index) -> dict:
    """L'indice, se il Coach può cercarci: almeno un paper, ogni paper utilizzabile, vettori fatti
    dal modello di ricerca in uso (vettori di un altro modello darebbero paper a caso)."""
    try:
        dim = index.get("embeddingDim")
        if not index["papers"]:
            raise ValueError("nessun paper")
        if any("passages" not in p and "embedding" in p for p in index["papers"]):
            raise PaperIndexError(f"papers_index.json è di una versione precedente, senza passaggi. {RESTORE}, "
                                  f"o ricostruiscilo con: {REBUILD}")
        if not all(usable(p, dim) for p in index["papers"]):
            raise ValueError("campi mancanti")
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise PaperIndexError(f"papers_index.json illeggibile. {RESTORE}") from e
    if index.get("model") != SEARCH_MODEL:
        raise PaperIndexError(f"papers_index.json è codificato con {index.get('model') or 'un modello senza nome'}, "
                              f"non con il modello di ricerca del Coach ({SEARCH_MODEL}). "
                              f"Ricodificalo con: {REENCODE}")
    return index


def nearest_passages(index: dict, query_embedding: list) -> list[tuple[float, int]]:
    """(punteggio, posizione) di ogni passaggio dell'indice, dal più vicino alla query. Il database
    è in memoria e nasce a ogni ricerca: due richieste insieme non ne condividono uno, e un indice
    ricostruito vale dalla richiesta dopo."""
    vectors = [s["embedding"] for p in index["papers"] for s in p["passages"]]
    with closing(sqlite3.connect(":memory:")) as db:
        db.enable_load_extension(True)
        sqlite_vec.load(db)
        db.enable_load_extension(False)
        db.execute(f"CREATE VIRTUAL TABLE passages USING vec0(embedding float[{int(index['embeddingDim'])}] "
                   "distance_metric=cosine)")
        db.executemany("INSERT INTO passages(rowid, embedding) VALUES (?, ?)",
                       [(row, sqlite_vec.serialize_float32(v)) for row, v in enumerate(vectors)])
        hits = db.execute("SELECT rowid, distance FROM passages WHERE embedding MATCH ? AND k = ?",
                          (sqlite_vec.serialize_float32(query_embedding), min(len(vectors), KNN_LIMIT))).fetchall()
    # sqlite-vec non tiene l'ordine dell'indice tra distanze uguali: a parità di punteggio lo
    # rimette la posizione, come faceva sorted() nella ricerca per abstract.
    return sorted(((1 - distance, row) for row, distance in hits), key=lambda hit: (-hit[0], hit[1]))


def top_papers(index: dict, query_embedding: list) -> list:
    """I TOP_K paper con il passaggio più vicino alla query, ognuno con i suoi PASSAGES_PER_PAPER
    passaggi più vicini, nell'ordine di lettura, e con il punteggio del più vicino. A parità di
    punteggio vince il paper che viene prima nell'indice."""
    owners = [(n, s) for n, p in enumerate(index["papers"]) for s in p["passages"]]
    closest: dict[int, list] = {}
    for score, row in nearest_passages(index, query_embedding):
        n, passage = owners[row]
        closest.setdefault(n, []).append((row, score, passage))
    found = []
    for n, hits in list(closest.items())[:TOP_K]:
        paper = {k: v for k, v in index["papers"][n].items() if k != "passages"}
        given = sorted(hits[:PASSAGES_PER_PAPER], key=lambda hit: hit[0])
        found.append({**paper, "score": hits[0][1],
                      "passages": [{"label": s["label"], "text": s["text"], "score": score} for _, score, s in given]})
    return found
