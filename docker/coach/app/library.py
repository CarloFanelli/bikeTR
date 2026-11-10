"""Libreria: i paper che il Coach cerca, come li mostra la schermata Libreria. L'elenco non porta
né passaggi né vettori (con molti testi completi peserebbe megabyte): i passaggi di un paper si
chiedono quando lo si apre."""

from app.errors import CoachError
from app.protocols import PROTOCOLS
from app.selection_rules import RULES

LISTED_FIELDS = ("pmid", "title", "authors", "year", "journal", "textUsed")


def supports(pmid: str) -> dict:
    """I workout (per nome) e le regole di selezione (in italiano) di cui il paper è il paper di supporto."""
    return {"workouts": [p.name for p in PROTOCOLS.values() if p.source_pmid == pmid],
            "rules": [r.sentence() for r in RULES if r.source_pmid == pmid]}


def listing(index: dict) -> list[dict]:
    return [{**{k: p.get(k) for k in LISTED_FIELDS}, "origin": "base", "passageCount": len(p["passages"]),
             "license": p.get("license"), "licenseUrl": p.get("licenseUrl"), "supports": supports(p["pmid"])}
            for p in index["papers"]]


def passages(index: dict, pmid: str) -> dict:
    """I passaggi del paper nell'ordine di lettura, con le etichette e senza vettori."""
    paper = next((p for p in index["papers"] if p["pmid"] == pmid), None)
    if paper is None:
        raise CoachError(404, "not_found", f"Il paper PMID {pmid} non è in libreria")
    return {"pmid": pmid, "passages": [{"label": s["label"], "text": s["text"]} for s in paper["passages"]]}
