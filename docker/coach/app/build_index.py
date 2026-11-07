"""Ricostruisce papers_index.json, l'indice in cui il Coach cerca i paper, con il modello di
ricerca del servizio Coach: non serve Ollama. Dalla cartella del progetto:

  docker compose run --rm coach-tools python -m app.build_index --reencode
      ricodifica i paper già nell'indice, senza PubMed (serve dopo un cambio del modello
      di ricerca): cambiano solo i vettori e il nome del modello.
  docker compose run --rm coach-tools python -m app.build_index
      rifà la lista dei paper da PubMed, poi la codifica.

Il file si sostituisce solo a lavoro finito: se PubMed non risponde, o il comando si
interrompe, l'indice di prima resta com'è."""

import argparse
import html
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

from app import search
from app.project_files import give_to_folder_owner

INDEX_FILE = Path("/project/papers_index.json")
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
HEADERS = {"User-Agent": "BikeTR-Coach/1.0"}
# Senza chiave PubMed accetta al massimo 3 richieste al secondo.
PAUSE = 0.35
MIN_ABSTRACT = 100

# Ogni voce: una ricerca PubMed precisa (non PMID fissi, per non indovinare ID sbagliati);
# si tiene il primo risultato.
SEARCHES = [
    ("Seiler-Kjerland-2006", "Seiler Kjerland quantifying training intensity distribution elite endurance athletes"),
    ("Seiler-2010-bestpractice", "Seiler 2010 best practice training intensity duration distribution endurance"),
    ("Ronnestad-2014-block", "Ronnestad Hansen Ellefsen block periodization high-intensity aerobic intervals cyclists"),
    ("Ronnestad-2020-short", "Ronnestad short intervals superior training adaptations cyclists"),
    ("Ronnestad-2010-strength", "Ronnestad Hansen Raastad strength training improves 5-min all-out 185 min cycling"),
    ("Vikmoen-2016-strength", "Vikmoen heavy strength training improves cycling performance well-trained"),
    ("Mujika-2018-periodization", "Mujika Halson Burke integrated multifactorial periodization optimal performance"),
    ("Laursen-Jenkins-2002-HIIT", "Laursen Jenkins scientific basis high-intensity interval training"),
    ("Buchheit-Laursen-2013-HIIT-I", "Buchheit Laursen high-intensity interval training solutions programming puzzle Part I cardiopulmonary"),
    ("Buchheit-Laursen-2013-HIIT-II", "Buchheit Laursen high-intensity interval training solutions programming puzzle Part II anaerobic"),
    ("Stoggl-Sperlich-2014-polarized", "Stoggl Sperlich polarized training endurance athletes"),
    ("Almquist-2020-block", "Almquist block periodization endurance training high-intensity well-trained"),
    ("Casado-2019-marathon", "Casado world-class marathon training intensity distribution"),
    ("Stepto-1999-intervals", "Stepto Hawley effects different interval training cycling performance"),
    ("Seiler-2013-4x8", "Seiler Joranger 4x8 interval training cyclists VO2max FTP"),
    ("Allen-Coggan-NP", "normalized power training stress score cycling Coggan"),
]


class BuildError(Exception):
    """L'indice non si può ricostruire; il messaggio dice perché. Il file non è cambiato."""


def pubmed(client: httpx.Client, path: str, params: dict) -> httpx.Response:
    """Una richiesta a PubMed. Se PubMed non risponde, la ricostruzione si ferma: saltare il
    paper darebbe un indice più corto senza accorgersene."""
    try:
        res = client.get(f"{EUTILS}/{path}", params=params, headers=HEADERS)
    except httpx.HTTPError as e:
        raise BuildError(f"PubMed non raggiungibile ({e.__class__.__name__})") from e
    if res.status_code != 200:
        raise BuildError(f"PubMed ha risposto HTTP {res.status_code} a {path}")
    return res


def first_pmid(client: httpx.Client, query: str) -> str | None:
    res = pubmed(client, "esearch.fcgi", {"db": "pubmed", "term": query, "retmax": 1, "retmode": "json"})
    try:
        ids = res.json()["esearchresult"]["idlist"]
    except (ValueError, KeyError, TypeError) as e:
        raise BuildError("Risposta di PubMed illeggibile (esearch)") from e
    return ids[0] if ids else None


def plain(s: str) -> str:
    """Testo senza tag XML, con le entità decodificate e gli spazi compattati."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def first(pattern: str, xml: str) -> str:
    m = re.search(pattern, xml)
    return m.group(1) if m else ""


def parse_article(xml: str) -> dict:
    """Titolo, autori, anno, rivista e abstract dall'XML di PubMed (efetch)."""
    parts = re.findall(r"(<AbstractText[^>]*>)([\s\S]*?)</AbstractText>", xml)
    labelled = []
    for tag, text in parts:
        label = re.search(r'Label="([^"]+)"', tag)
        labelled.append(f"{label.group(1)}: {plain(text)}" if label and len(parts) > 1 else plain(text))
    names = [plain(n) for n in re.findall(r"<LastName>([^<]+)</LastName>", xml)]
    authors = (names[0] if len(names) == 1 else f"{names[0]} & {names[1]}" if len(names) == 2
               else f"{names[0]} et al." if names else "")
    return {
        "title": plain(first(r"<ArticleTitle[^>]*>([\s\S]*?)</ArticleTitle>", xml)),
        "authors": authors,
        "year": (first(r"<PubDate>[\s\S]*?<Year>(\d{4})</Year>", xml)
                 or first(r"<MedlineDate>(\d{4})", xml)),
        "journal": plain(first(r"<Journal>[\s\S]*?<Title>([\s\S]*?)</Title>", xml)),
        "abstract": " ".join(labelled).strip(),
    }


def fetch_papers(client: httpx.Client) -> list[dict]:
    """I paper delle SEARCHES, senza vettori. Una ricerca senza risultati, un PMID già preso o
    un abstract troppo corto saltano quel paper; PubMed che non risponde ferma tutto."""
    papers, seen = [], set()
    for tag, query in SEARCHES:
        pmid = first_pmid(client, query)
        time.sleep(PAUSE)
        if pmid is None:
            print(f"⚠️  {tag}: nessun risultato su PubMed, salto")
            continue
        if pmid in seen:
            print(f"⚠️  {tag}: PMID {pmid} già nell'indice, salto")
            continue
        seen.add(pmid)
        meta = parse_article(pubmed(client, "efetch.fcgi",
                                    {"db": "pubmed", "id": pmid, "rettype": "abstract", "retmode": "xml"}).text)
        time.sleep(PAUSE)
        if len(meta["abstract"]) < MIN_ABSTRACT:
            print(f"⚠️  {tag} (PMID {pmid}): abstract corto ({len(meta['abstract'])} caratteri), salto")
            continue
        papers.append({"pmid": pmid, **meta})
        print(f"✓ [{tag}] PMID {pmid} ({meta['year']}) {meta['authors']}")
    return papers


def finished(built_at: str | None, papers: list[dict]) -> dict:
    """L'indice completo: i paper con il vettore del modello di ricerca, calcolato da titolo
    e abstract, e il nome di quel modello."""
    texts = [f"{p['title']}\n\n{p['abstract']}" for p in papers]
    cut = sum(search.cut(t) for t in texts)
    if cut:
        print(f"Paper oltre i {search.MAX_TOKENS} token che il modello di ricerca legge: {cut} su {len(papers)}. "
              "Di questi è codificato solo l'inizio.")
    vectors = search.encode_now(texts)
    return {"model": search.SEARCH_MODEL, "builtAt": built_at, "count": len(papers), "embeddingDim": len(vectors[0]),
            "papers": [{**p, "embedding": vector} for p, vector in zip(papers, vectors)]}


def write_index(path: Path, index: dict) -> None:
    """File temporaneo, poi rename: un'interruzione a metà non lascia un indice troncato."""
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        give_to_folder_owner(tmp)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def reencode(path: Path) -> dict:
    try:
        index = json.loads(path.read_text(encoding="utf-8"))
        papers = [{k: v for k, v in p.items() if k != "embedding"} for p in index["papers"]]
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        raise BuildError(f"{path.name} mancante o illeggibile: ripristinalo con git restore papers_index.json, "
                         "o ricostruiscilo da PubMed (lo stesso comando senza --reencode)") from e
    if not papers:
        raise BuildError(f"{path.name} non contiene paper da ricodificare")
    print(f"Ricodifico {len(papers)} paper con {search.SEARCH_MODEL}…")
    # builtAt resta: dice quando la lista dei paper è stata presa da PubMed.
    return finished(index.get("builtAt"), papers)


def rebuild(client: httpx.Client) -> dict:
    print(f"Cerco {len(SEARCHES)} paper su PubMed…")
    papers = fetch_papers(client)
    if not papers:
        raise BuildError("Nessun paper trovato su PubMed")
    print(f"Codifico {len(papers)} paper con {search.SEARCH_MODEL}…")
    return finished(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), papers)


def main(argv: list[str] | None = None, path: Path = INDEX_FILE, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.build_index", description=__doc__.splitlines()[0])
    parser.add_argument("--reencode", action="store_true",
                        help="ricodifica i paper già nell'indice, senza PubMed")
    args = parser.parse_args(argv)
    try:
        if args.reencode:
            index = reencode(path)
        else:
            with client or httpx.Client(timeout=30) as pubmed_client:
                index = rebuild(pubmed_client)
    except BuildError as e:
        print(f"✗ {e}. {path.name} non è cambiato.", file=sys.stderr)
        return 1
    write_index(path, index)
    print(f"✅ Salvato {path.name}: {len(index['papers'])} paper, vettori di {index['embeddingDim']} numeri, "
          f"modello {index['model']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
