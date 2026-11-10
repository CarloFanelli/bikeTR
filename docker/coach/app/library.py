"""Libreria: i paper che il Coach cerca. Sono i paper di base, quelli di papers_index.json nel
progetto, più i paper che l'atleta aggiunge per PMID, salvati in /data/library.json: nel volume
dei dati del Coach, fuori da git, come le corse e la spesa. papers_index.json non cambia mai.

Forma del file: {model: modello di ricerca dei vettori, added: [paper con passaggi e vettori]}.

Un paper si aggiunge come la ricostruzione dell'indice prende i suoi: stessi servizi, stessa regola
della licenza, stesso taglio in passaggi, stesso modello di ricerca. L'elenco della schermata non
porta né passaggi né vettori (con molti testi completi peserebbe megabyte): i passaggi di un paper
si chiedono quando lo si apre."""

import json
import re
from pathlib import Path

import httpx

from app import build_index, papers, search
from app.errors import CoachError
from app.project_files import replace_file
from app.protocols import PROTOCOLS
from app.selection_rules import RULES
from app.shared_files import locked

LIBRARY_FILE = Path("/data/library.json")
MAX_ADDED = 50
PMID = re.compile(r"\d{1,10}")
LISTED_FIELDS = ("pmid", "title", "authors", "year", "journal", "textUsed")
NO_OPEN_LICENSE = "Europe PMC non ha il testo completo con una licenza che permette di copiarlo (CC BY, CC BY-SA, CC0)"


class LibraryUnreadable(Exception):
    """Il file della libreria c'è ma non si legge: nessuno lo sovrascrive, il Coach cerca i paper di base."""


class Library:
    def __init__(self, path: Path):
        self.path = path

    def unreadable(self) -> LibraryUnreadable:
        return LibraryUnreadable(f"La libreria salvata in {self.path} non si legge: il Coach cerca solo i paper di "
                                 "base, e il file resta com'è finché non lo ripari o lo cancelli.")

    def load(self) -> dict:
        """La libreria salvata; vuota prima del primo paper aggiunto."""
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {"model": search.SEARCH_MODEL, "added": []}
        except (OSError, ValueError, RecursionError) as e:
            raise self.unreadable() from e
        if not (isinstance(saved, dict) and isinstance(saved.get("model"), str) and isinstance(saved.get("added"), list)
                and all(isinstance(p, dict) and isinstance(p.get("pmid"), str) for p in saved["added"])):
            raise self.unreadable()
        return saved

    def change(self, edit) -> dict:
        """Rilegge la libreria sotto il lucchetto, la cambia con edit e la sostituisce intera."""
        with locked(self.path):
            saved = edit(self.load())
            replace_file(self.path, json.dumps(saved, ensure_ascii=False, separators=(",", ":")))
            return saved


def merged(base: dict, saved: dict) -> dict:
    """L'indice che il Coach cerca: i paper di base, poi quelli aggiunti. Un paper aggiunto che nel
    frattempo è diventato di base (dopo un git pull) resta fuori: vale la copia di base."""
    base_pmids = {p["pmid"] for p in base["papers"]}
    added = [p for p in saved["added"] if p["pmid"] not in base_pmids]
    return {**base, "papers": [*base["papers"], *added]}


def searched(base: dict, library: Library) -> tuple[dict, str | None]:
    """L'indice da cercare e, se la libreria salvata non si legge, il messaggio che lo dice: allora
    il Coach cerca i paper di base."""
    try:
        saved = library.load()
        index = merged(base, saved)
        if not all(papers.usable(p, base["embeddingDim"]) for p in index["papers"]):
            raise library.unreadable()
    except LibraryUnreadable as e:
        return base, str(e)
    return index, None


def supports(pmid: str) -> dict:
    """I workout (per nome) e le regole di selezione (in italiano) di cui il paper è il paper di supporto."""
    return {"workouts": [p.name for p in PROTOCOLS.values() if p.source_pmid == pmid],
            "rules": [r.sentence() for r in RULES if r.source_pmid == pmid]}


def listing(base: dict, index: dict) -> list[dict]:
    base_pmids = {p["pmid"] for p in base["papers"]}
    return [{**{k: p.get(k) for k in LISTED_FIELDS}, "origin": "base" if p["pmid"] in base_pmids else "added",
             "passageCount": len(p["passages"]), "license": p.get("license"), "licenseUrl": p.get("licenseUrl"),
             "supports": supports(p["pmid"])}
            for p in index["papers"]]


def passages(index: dict, pmid: str) -> dict:
    """I passaggi del paper nell'ordine di lettura, con le etichette e senza vettori."""
    paper = find(index, pmid)
    if paper is None:
        raise CoachError(404, "not_found", f"Il paper PMID {pmid} non è in libreria")
    return {"pmid": pmid, "passages": [{"label": s["label"], "text": s["text"]} for s in paper["passages"]]}


def find(index: dict, pmid: str) -> dict | None:
    return next((p for p in index["papers"] if p["pmid"] == pmid), None)


def valid_pmid(body) -> str:
    raw = body.get("pmid") if isinstance(body, dict) else None
    pmid = raw.strip() if isinstance(raw, str) else ""
    if not PMID.fullmatch(pmid):
        raise CoachError(400, "invalid_pmid", "Il PMID è un numero")
    return pmid


def check_addable(base: dict, saved: dict, pmid: str) -> None:
    """Rifiuta un PMID già in libreria o un paper oltre il massimo degli aggiunti."""
    index = merged(base, saved)
    present = find(index, pmid)
    if present is not None:
        raise CoachError(409, "duplicate", f"Già in libreria: {present['authors']} ({present['year']}). {present['title']}")
    if len(index["papers"]) - len(base["papers"]) >= MAX_ADDED:
        raise CoachError(409, "full", f"La libreria ha già {MAX_ADDED} paper aggiunti, il massimo: "
                                      "togline uno prima di aggiungerne un altro")


def sources() -> httpx.Client:
    return httpx.Client(timeout=30)


def fetch(pmid: str) -> tuple[dict, str]:
    """Il paper da PubMed con il testo che userà, in passaggi senza vettori, e perché quel testo.
    Bloccante (pause tra le richieste, come la ricostruzione): va chiamato in un altro thread."""
    notes = []
    try:
        with sources() as client:
            meta = build_index.parse_article(build_index.pubmed(
                client, "efetch.fcgi", {"db": "pubmed", "id": pmid, "rettype": "abstract", "retmode": "xml"}).text)
            # PubMed risponde 200 anche a un PMID che non conosce, senza articolo.
            if not meta["title"]:
                raise CoachError(404, "unknown_pmid", f"PubMed non conosce il PMID {pmid}")
            paper = build_index.with_text(client, {"pmid": pmid, **meta}, notes.append)
    except build_index.BuildError as e:
        raise CoachError(502, "source", f"{e}: niente è stato salvato, riprova più tardi") from e
    if paper["textUsed"] == "abstract" and len(meta["abstract"]) < build_index.MIN_ABSTRACT:
        raise CoachError(422, "too_short", f"Il PMID {pmid} ha un abstract di {len(meta['abstract'])} caratteri e "
                                           "nessun testo completo con licenza aperta: il Coach non lo troverebbe")
    return paper, notes[-1] if notes else NO_OPEN_LICENSE


def preview(paper: dict, reason: str) -> dict:
    return {**{k: paper.get(k) for k in LISTED_FIELDS}, "license": paper.get("license"),
            "licenseUrl": paper.get("licenseUrl"), "reason": reason, "passageCount": len(paper["passages"])}


def encoded(pmid: str) -> dict:
    """Il paper scaricato, tagliato e codificato come i paper di base. Bloccante: va chiamato in un
    altro thread."""
    paper, _ = fetch(pmid)
    vectors = iter(search.encode_now([s["text"] for s in paper["passages"]]))
    return {**paper, "passages": [{**s, "embedding": next(vectors)} for s in paper["passages"]]}


def save(library: Library, base: dict, paper: dict) -> None:
    """Aggiunge il paper alla libreria salvata. Duplicato e massimo si ricontrollano sotto il
    lucchetto: un'altra scheda può aver aggiunto nel frattempo. Bloccante (il lucchetto può
    aspettare un comando di coach-tools): va chiamato in un altro thread."""
    def append(saved: dict) -> dict:
        check_addable(base, saved, paper["pmid"])
        return {**saved, "added": [*saved["added"], paper]}

    try:
        library.change(append)
    except LibraryUnreadable as e:
        raise CoachError(500, "library_unreadable", str(e)) from e
