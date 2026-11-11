"""Ricostruisce papers_index.json, l'indice in cui il Coach cerca i paper, con il modello di
ricerca del servizio Coach: non serve Ollama. Dalla cartella del progetto:

  docker compose run --rm coach-tools python -m app.build_index --reencode
      ricodifica i passaggi già nell'indice, senza PubMed (serve dopo un cambio del modello
      di ricerca): cambiano solo i vettori e il nome del modello. Ricodifica anche i paper
      aggiunti alla libreria (/data/library.json), dopo che l'indice è salvato.
  docker compose run --rm coach-tools python -m app.build_index
      rifà la lista dei paper da PubMed, prende da Europe PMC il testo completo dei paper con
      una licenza che permette di copiarlo, taglia ogni testo in passaggi e li codifica.

Il file si sostituisce solo a lavoro finito: se PubMed o Europe PMC non rispondono, una ricerca
trova per primo un altro paper, o il comando si interrompe, l'indice di prima resta com'è."""

import argparse
import html
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Callable

import httpx

# library usa le funzioni di questo modulo per aggiungere un paper: i due si importano a vicenda,
# e qui library si usa solo dentro le funzioni.
from app import library, search
from app.errors import CoachError
from app.papers import cut_passages
from app.project_files import replace_file

INDEX_FILE = Path("/project/papers_index.json")
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EUROPE_PMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
HEADERS = {"User-Agent": "BikeTR-Coach/1.0"}
# Senza chiave PubMed accetta al massimo 3 richieste al secondo.
PAUSE = 0.35
MIN_ABSTRACT = 100
# Le licenze che permettono di copiare un testo nel repository, che è pubblico, nella forma di license_name.
OPEN_LICENSES = {"cc by": "CC BY", "cc by sa": "CC BY-SA", "cc0": "CC0"}
XLINK_HREF = "{http://www.w3.org/1999/xlink}href"
ALI_LICENSE_REF = "{http://www.niso.org/schemas/ali/1.0/}license_ref"
# Il link della licenza, che la scheda del workout apre: solo una pagina di creativecommons.org.
CC_LINK = re.compile(r"https?://(www\.)?creativecommons\.org/\S*")
# Parti di un testo completo che non sono testo da leggere.
NOT_TEXT = {"table-wrap", "table-wrap-group", "fig", "fig-group"}
# Elementi che vanno a capo: uno spazio attorno, perché due paragrafi non si incollino.
BLOCKS = {"p", "title", "list-item", "caption", "disp-quote", "def-item"}
# Le sezioni del corpo che non sono il lavoro descritto, con qualunque maiuscola, variante e plurale.
LEFT_OUT = re.compile(r"\b(acknowledge?ments?|fundings?|conflicts? of interests?|competing interests?|"
                      r"authors?['’]?s? contributions?|references?|tables?|figures?)\b", re.IGNORECASE)

# Ogni voce: un nome, una ricerca PubMed precisa e il PMID che deve trovare per primo. Il paper
# si scarica dalla ricerca; il PMID serve solo a controllare che la ricerca trovi ancora quello.
# I paper di supporto dei protocolli (protocols.py) devono essere tutti qui.
SEARCHES = [
    ("Seiler-Kjerland-2006", "Seiler Kjerland quantifying training intensity distribution elite endurance athletes",
     "16430681"),
    ("Seiler-2010-bestpractice", "Seiler 2010 best practice training intensity duration distribution endurance",
     "20861519"),
    ("Stoggl-Sperlich-2014-polarized", "Stoggl Sperlich polarized training greater impact key endurance variables "
     "threshold high intensity high volume", "24550842"),
    ("Sitko-2025-zone2", "Sitko zone 2 training experts viewpoint definition training methods expected adaptations",
     "40010355"),
    ("Spragg-2023-durability", "Spragg training characteristics durability professional cyclists competitive season",
     "35239466"),
    ("Seiler-2013-4x8", "Seiler adaptations aerobic interval training interactive effects exercise intensity "
     "total work duration", "21812820"),
    ("Ronnestad-2020-short", "Ronnestad superior performance improvements elite cyclists short-interval "
     "effort-matched long-interval", "31977120"),
    ("Ronnestad-2021-microcycle", "Ronnestad microcycle short intervals versus long intervals cyclists superior "
     "physiological adaptations", "33735833"),
    ("Ronnestad-2014-block", "Ronnestad Hansen Ellefsen block periodization high-intensity aerobic intervals cyclists",
     "22646668"),
    ("Whitty-2016-cadence", "Whitty low high cadence interval training freely chosen cadence endurance-trained "
     "cyclists", "27175601"),
    ("Hansen-2012-strength", "Hansen Ronnestad cyclists improvement pedaling efficacy performance heavy strength "
     "training", "23197584"),
    ("Vikmoen-2017-strength", "Vikmoen heavy strength training improves cycling performance well-trained",
     "28292885"),
    ("Mujika-2018-periodization", "Mujika Halson Burke integrated multifactorial periodization optimal performance",
     "29848161"),
    ("Laursen-Jenkins-2002-HIIT", "Laursen Jenkins scientific basis high-intensity interval training", "11772161"),
    ("Buchheit-Laursen-2013-HIIT-I", "Buchheit Laursen high-intensity interval training solutions programming "
     "puzzle Part I cardiopulmonary emphasis", "23539308"),
    ("Buchheit-Laursen-2013-HIIT-II", "Buchheit Laursen high-intensity interval training solutions programming "
     "puzzle Part II anaerobic", "23832851"),
    ("Stepto-1999-intervals", "Stepto Hawley effects different interval training cycling performance", "10331896"),
]


class BuildError(Exception):
    """L'indice non si può ricostruire; il messaggio dice perché. Il file non è cambiato."""


def get(client: httpx.Client, service: str, base: str, path: str, params: dict | None = None) -> httpx.Response:
    """Una richiesta a PubMed o a Europe PMC. Se il servizio non risponde, la ricostruzione si
    ferma: saltare un paper, o il suo testo completo, darebbe un indice diverso senza accorgersene."""
    try:
        res = client.get(f"{base}/{path}", params=params, headers=HEADERS)
    except httpx.HTTPError as e:
        raise BuildError(f"{service} non raggiungibile ({e.__class__.__name__})") from e
    if res.status_code != 200:
        raise BuildError(f"{service} ha risposto HTTP {res.status_code} a {path}")
    return res


def pubmed(client: httpx.Client, path: str, params: dict) -> httpx.Response:
    return get(client, "PubMed", EUTILS, path, params)


def found_pmids(client: httpx.Client, query: str, retmax: int, sort: str | None = None) -> list[str]:
    """I PMID che PubMed trova per la ricerca, nel suo ordine. Il testo va come parametro: httpx lo
    codifica, qualunque carattere contenga."""
    params = {"db": "pubmed", "term": query, "retmax": retmax, "retmode": "json", **({"sort": sort} if sort else {})}
    res = pubmed(client, "esearch.fcgi", params)
    try:
        return [str(pmid) for pmid in res.json()["esearchresult"]["idlist"]]
    except (ValueError, KeyError, TypeError) as e:
        raise BuildError("Risposta di PubMed illeggibile (esearch)") from e


def first_pmid(client: httpx.Client, query: str) -> str | None:
    ids = found_pmids(client, query, 1)
    return ids[0] if ids else None


def plain(s: str) -> str:
    """Testo senza tag XML, con le entità decodificate e gli spazi compattati."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def first(pattern: str, xml: str) -> str:
    m = re.search(pattern, xml)
    return m.group(1) if m else ""


def author_line(last_names: list[str]) -> str:
    """Gli autori come li cita l'elenco: "Seiler", "Seiler & Tønnessen", "Seiler et al."."""
    if len(last_names) > 2:
        return f"{last_names[0]} et al."
    return " & ".join(last_names)


def parse_article(xml: str) -> dict:
    """Titolo, autori, anno, rivista e abstract dall'XML di PubMed (efetch)."""
    parts = re.findall(r"(<AbstractText[^>]*>)([\s\S]*?)</AbstractText>", xml)
    labelled = []
    for tag, text in parts:
        label = re.search(r'Label="([^"]+)"', tag)
        labelled.append(f"{label.group(1)}: {plain(text)}" if label and len(parts) > 1 else plain(text))
    names = [plain(n) for n in re.findall(r"<LastName>([^<]+)</LastName>", xml)]
    return {
        "title": plain(first(r"<ArticleTitle[^>]*>([\s\S]*?)</ArticleTitle>", xml)),
        "authors": author_line(names),
        "year": (first(r"<PubDate>[\s\S]*?<Year>(\d{4})</Year>", xml)
                 or first(r"<MedlineDate>(\d{4})", xml)),
        "journal": plain(first(r"<Journal>[\s\S]*?<Title>([\s\S]*?)</Title>", xml)),
        "abstract": " ".join(labelled).strip(),
    }


def license_name(raw) -> str | None:
    """Il nome della licenza, se permette di copiare il testo: "cc by", "CC BY 4.0" e "cc-by-sa"
    danno CC BY, CC BY e CC BY-SA. None per ogni altra licenza (CC BY-NC, CC BY-ND…) o nessuna."""
    words = [w for w in re.split(r"[^a-z0-9]+", str(raw or "").lower()) if w and not w.isdigit()]
    return OPEN_LICENSES.get(" ".join(words))


def open_license(client: httpx.Client, pmid: str) -> tuple[str | None, str | None]:
    """La licenza del paper secondo Europe PMC, se permette di copiarlo, e il suo PMCID se Europe
    PMC ne ha il testo completo."""
    res = get(client, "Europe PMC", EUROPE_PMC, "search",
              {"query": f"EXT_ID:{pmid} AND SRC:MED", "resultType": "core", "format": "json"})
    time.sleep(PAUSE)
    try:
        found = res.json()["resultList"]["result"]
        record = found[0] if found else {}
        pmcid = record.get("pmcid") if record.get("inEPMC") == "Y" else None
        if pmcid is not None and not re.fullmatch(r"PMC\d+", pmcid):
            raise ValueError(f"PMCID non valido: {pmcid}")
        return license_name(record.get("license")), pmcid
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise BuildError("Risposta di Europe PMC illeggibile (search)") from e


def full_text(client: httpx.Client, pmcid: str) -> ET.Element:
    res = get(client, "Europe PMC", EUROPE_PMC, f"{pmcid}/fullTextXML")
    time.sleep(PAUSE)
    try:
        return ET.fromstring(res.content)
    except ET.ParseError as e:
        raise BuildError("Risposta di Europe PMC illeggibile (fullTextXML)") from e


def flat_text(element: ET.Element) -> str:
    """Il testo dell'elemento senza tabelle né figure, con gli spazi compattati."""
    def walk(e: ET.Element) -> str:
        parts = [e.text or ""]
        for child in e:
            if child.tag not in NOT_TEXT:
                inner = walk(child)
                parts.append(f" {inner} " if child.tag in BLOCKS else inner)
            parts.append(child.tail or "")
        return "".join(parts)
    return re.sub(r"\s+", " ", walk(element)).strip()


def title_of(section: ET.Element) -> str:
    """Il titolo della sezione senza la numerazione ("2.1. Participants" → "Participants")."""
    title = section.find("title")
    return "" if title is None else re.sub(r"^[\d.]+\s+", "", flat_text(title))


def section_text(section: ET.Element) -> str:
    """Il titolo e il testo della sezione, con le sottosezioni nell'ordine di lettura; quelle da
    lasciare fuori restano fuori anche qui."""
    parts = []
    for child in section:
        if child.tag == "sec":
            if not LEFT_OUT.search(title_of(child)):
                parts.append(section_text(child))
        elif child.tag not in ("title", "label") and child.tag not in NOT_TEXT:
            parts.append(flat_text(child))
    body, title = " ".join(p for p in parts if p), title_of(section)
    if not (title and body):
        return body
    return f"{title} {body}" if title[-1] in ".:?!" else f"{title}: {body}"


def body_sections(article: ET.Element) -> list[str]:
    """Le sezioni del corpo da leggere, in ordine: solo quelle con un titolo (le altre, nei testi di
    oggi, sono note di citazione e finanziamento), senza riferimenti, ringraziamenti, finanziamenti,
    conflitti di interesse e contributi degli autori."""
    body = article.find("body")
    sections = [] if body is None else body.findall("sec")
    return [text for s in sections if title_of(s) and not LEFT_OUT.search(title_of(s)) and (text := section_text(s))]


def license_link(article: ET.Element) -> str | None:
    """L'indirizzo Creative Commons della licenza, in una delle tre forme dei testi completi."""
    for license in article.iter("license"):
        for url in (license.get(XLINK_HREF), *(e.text for e in license.iter(ALI_LICENSE_REF)),
                    *(e.get(XLINK_HREF) for e in license.iter("ext-link"))):
            if url and CC_LINK.fullmatch(url.strip()):
                return url.strip()
    return None


def say(note: str) -> None:
    print(f"  ↳ {note}")


def with_text(client: httpx.Client, paper: dict, note: Callable[[str], None] = say) -> dict:
    """Il paper con il testo che usa, tagliato in passaggi ancora senza vettori: il testo completo
    se Europe PMC lo ha con una licenza che permette di copiarlo, altrimenti l'abstract. note riceve
    perché, tranne quando la licenza non permette di copiarlo."""
    abstract = {**paper, "textUsed": "abstract", "passages": cut_passages(paper["pmid"], paper["abstract"])}
    license, pmcid = open_license(client, paper["pmid"])
    if license is None:
        return abstract
    if pmcid is None:
        note(f"licenza {license}, ma Europe PMC non ha il testo completo: uso l'abstract")
        return abstract
    article = full_text(client, pmcid)
    url, sections = license_link(article), body_sections(article)
    if url is None:
        note(f"licenza {license}, ma il testo completo non ha il link della licenza: uso l'abstract")
        return abstract
    if not sections:
        note(f"licenza {license}, ma il testo completo non ha sezioni da leggere: uso l'abstract")
        return abstract
    note(f"testo completo da Europe PMC ({license}, {pmcid}): {len(sections)} sezioni")
    return {**paper, "textUsed": "fullText", "license": license, "licenseUrl": url,
            "passages": cut_passages(paper["pmid"], paper["abstract"], *sections)}


def fetch_papers(client: httpx.Client) -> list[dict]:
    """I paper delle SEARCHES con i loro passaggi, senza vettori. Una ricerca che non trova per
    primo il paper atteso, o un abstract troppo corto, ferma tutto, come PubMed che non risponde:
    un indice senza quel paper toglierebbe al Coach la fonte di un protocollo senza accorgersene."""
    papers = []
    for tag, query, expected in SEARCHES:
        pmid = first_pmid(client, query)
        time.sleep(PAUSE)
        if pmid != expected:
            raise BuildError(f"{tag}: la ricerca trova per primo {f'il PMID {pmid}' if pmid else 'nessun paper'} "
                             f"invece del PMID {expected}; correggi il testo della ricerca in build_index.py")
        meta = parse_article(pubmed(client, "efetch.fcgi",
                                    {"db": "pubmed", "id": pmid, "rettype": "abstract", "retmode": "xml"}).text)
        time.sleep(PAUSE)
        if len(meta["abstract"]) < MIN_ABSTRACT:
            raise BuildError(f"{tag} (PMID {pmid}): abstract di {len(meta['abstract'])} caratteri, troppo corto "
                             "perché il modello di ricerca lo trovi")
        print(f"✓ [{tag}] PMID {pmid} ({meta['year']}) {meta['authors']}")
        papers.append(with_text(client, {"pmid": pmid, **meta}))
    return papers


def finished(built_at: str | None, papers: list[dict]) -> dict:
    """L'indice completo: ogni passaggio con il vettore del modello di ricerca, calcolato dal solo
    testo del passaggio, e il nome di quel modello."""
    texts = [s["text"] for p in papers for s in p["passages"]]
    cut = sum(search.cut(t) for t in texts)
    if cut:
        print(f"Passaggi oltre i {search.MAX_TOKENS} token che il modello di ricerca legge: {cut} su {len(texts)}. "
              "Di questi è codificato solo l'inizio.")
    vectors = iter(search.encode_now(texts))
    encoded = [{**p, "passages": [{**s, "embedding": next(vectors)} for s in p["passages"]]} for p in papers]
    return {"model": search.SEARCH_MODEL, "builtAt": built_at, "count": len(papers),
            "embeddingDim": len(encoded[0]["passages"][0]["embedding"]), "papers": encoded}


def write_index(path: Path, index: dict) -> None:
    """Un'interruzione a metà non lascia un indice troncato."""
    replace_file(path, json.dumps(index, ensure_ascii=False, separators=(",", ":")))


def reencode(path: Path) -> dict:
    """I passaggi dell'indice ricodificati, senza tagliarli di nuovo: etichette e testi restano."""
    try:
        index = json.loads(path.read_text(encoding="utf-8"))
        old = [p for p in index["papers"] if "passages" not in p]
        papers = [{**p, "passages": [{k: v for k, v in s.items() if k != "embedding"} for s in p["passages"]]}
                  for p in index["papers"] if "passages" in p]
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        raise BuildError(f"{path.name} mancante o illeggibile: ripristinalo con git restore papers_index.json, "
                         "o ricostruiscilo da PubMed (lo stesso comando senza --reencode)") from e
    if old:
        raise BuildError(f"{path.name} è di una versione precedente, senza passaggi: ricostruiscilo da PubMed "
                         "(lo stesso comando senza --reencode)")
    if not papers:
        raise BuildError(f"{path.name} non contiene paper da ricodificare")
    print(f"Ricodifico {sum(len(p['passages']) for p in papers)} passaggi di {len(papers)} paper "
          f"con {search.SEARCH_MODEL}…")
    # builtAt resta: dice quando la lista dei paper è stata presa da PubMed.
    return finished(index.get("builtAt"), papers)


def reencode_library(saved: "library.Library") -> None:
    """I passaggi dei paper aggiunti ricodificati con il modello di ricerca in uso, sotto il lucchetto
    della libreria: il servizio Coach che aggiunge un paper intanto aspetta. Senza libreria salvata,
    niente da fare."""
    if not saved.path.exists():
        return

    def encoded(current: dict) -> dict:
        added = [{**p, "passages": [{k: v for k, v in s.items() if k != "embedding"} for s in p["passages"]]}
                 for p in current["added"]]
        if added:
            print(f"Ricodifico {sum(len(p['passages']) for p in added)} passaggi di {len(added)} paper aggiunti "
                  f"con {search.SEARCH_MODEL}…")
            added = finished(None, added)["papers"]
        print(f"✅ Salvata la libreria: {len(added)} paper aggiunti, {sum(len(p['passages']) for p in added)} passaggi")
        return {**current, "model": search.SEARCH_MODEL, "added": added}

    try:
        saved.change(encoded)
    except CoachError as e:
        raise BuildError(e.message) from e


def rebuild(client: httpx.Client) -> dict:
    print(f"Cerco {len(SEARCHES)} paper su PubMed…")
    papers = fetch_papers(client)
    print(f"Codifico {sum(len(p['passages']) for p in papers)} passaggi di {len(papers)} paper "
          f"con {search.SEARCH_MODEL}…")
    return finished(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), papers)


def main(argv: list[str] | None = None, path: Path = INDEX_FILE, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.build_index", description=__doc__.splitlines()[0])
    parser.add_argument("--reencode", action="store_true",
                        help="ricodifica i passaggi già nell'indice, senza PubMed")
    args = parser.parse_args(argv)
    saved = library.Library(library.LIBRARY_FILE)
    try:
        if args.reencode:
            # Una libreria illeggibile ferma tutto prima di scrivere: nessuno dei due file cambia.
            saved.load()
            index = reencode(path)
        else:
            with client or httpx.Client(timeout=30) as pubmed_client:
                index = rebuild(pubmed_client)
    except (BuildError, library.LibraryUnreadable) as e:
        print(f"✗ {e}. {path.name} non è cambiato.", file=sys.stderr)
        return 1
    write_index(path, index)
    print(f"✅ Salvato {path.name}: {len(index['papers'])} paper, "
          f"{sum(len(p['passages']) for p in index['papers'])} passaggi, vettori di {index['embeddingDim']} numeri, "
          f"modello {index['model']}")
    if args.reencode:
        # Solo dopo l'indice: con l'indice fallito, la libreria avrebbe vettori di un altro modello.
        try:
            reencode_library(saved)
        except BuildError as e:
            print(f"✗ {e}. La libreria non è cambiata.", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
