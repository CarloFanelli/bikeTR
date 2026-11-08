"""Ricostruzione dell'indice dei paper con il modello di ricerca, senza Ollama: la ricodifica
cambia solo i vettori e il nome del modello; la ricostruzione da PubMed prende ogni paper dalla
sua ricerca e si ferma se una ricerca trova per primo un altro paper; se PubMed non risponde o il
lavoro si interrompe, il file resta com'era. Ogni paper di supporto dei protocolli ha la sua
ricerca. PubMed è simulato; il modello di ricerca è quello vero."""

import asyncio
import json

import httpx
import pytest

from app import build_index, papers, project_files, search
from app.protocols import PROTOCOLS
from fixture_data import load

INDEX = {**load("papers_index.json"), "model": "nomic-embed-text", "builtAt": "2026-05-07T12:06:22.489Z",
         "count": 10, "embeddingDim": 10}


def without_vectors(index: dict) -> list:
    return [{k: v for k, v in p.items() if k != "embedding"} for p in index["papers"]]


@pytest.fixture
def index_file(tmp_path):
    path = tmp_path / "papers_index.json"
    path.write_text(json.dumps(INDEX), encoding="utf-8")
    return path


def unchanged(index_file, before: bytes) -> bool:
    """Il file è quello di prima, e non resta nessun file temporaneo accanto."""
    return index_file.read_bytes() == before and list(index_file.parent.iterdir()) == [index_file]


def test_reencoding_changes_only_the_vectors_and_the_model_name(index_file):
    assert build_index.main(["--reencode"], path=index_file) == 0
    new = json.loads(index_file.read_text(encoding="utf-8"))
    assert without_vectors(new) == without_vectors(INDEX)
    assert (new["model"], new["builtAt"], new["count"], new["embeddingDim"]) == (
        "BAAI/bge-small-en-v1.5", INDEX["builtAt"], 10, 384)
    assert all(len(p["embedding"]) == 384 for p in new["papers"])
    # Query e paper sono codificati dallo stesso modello: il titolo di un paper trova lui per primo.
    query = asyncio.run(search.encode(INDEX["papers"][3]["title"]))
    assert papers.top_papers(papers.check_index(new), query)[0]["pmid"] == INDEX["papers"][3]["pmid"]
    assert list(index_file.parent.iterdir()) == [index_file]


def test_reencoding_says_how_many_papers_were_cut_at_the_model_limit(index_file, capsys):
    long, short = INDEX["papers"][:2]
    index_file.write_text(json.dumps({**INDEX, "papers": [{**long, "abstract": "watt " * 600},
                                                          {**short, "abstract": "Short abstract."}]}))
    assert build_index.main(["--reencode"], path=index_file) == 0
    assert "Paper oltre i 512 token che il modello di ricerca legge: 1 su 2." in capsys.readouterr().out


@pytest.mark.parametrize("where", ["encoding", "writing"])
def test_interrupted_job_leaves_the_index_unchanged(index_file, monkeypatch, where):
    def interrupt(*args):
        raise KeyboardInterrupt
    monkeypatch.setattr(search, "encode_now", interrupt) if where == "encoding" else \
        monkeypatch.setattr(project_files.os, "replace", interrupt)
    before = index_file.read_bytes()
    with pytest.raises(KeyboardInterrupt):
        build_index.main(["--reencode"], path=index_file)
    assert unchanged(index_file, before)


# --- Ricostruzione da PubMed -----------------------------------------------------------------

SEARCHES = [("buono", "q-buono", "111"), ("secondo", "q-secondo", "333")]
FOUND = {"q-buono": "111", "q-secondo": "333", "q-altro": "444", "q-assente": None, "q-corto": "222"}


def article(title: str, abstract: str, names: list) -> str:
    authors = "".join(f"<Author><LastName>{n}</LastName><ForeName>X</ForeName></Author>" for n in names)
    return (f"<PubmedArticleSet><PubmedArticle><Article><Journal><ISSN>1</ISSN><JournalIssue><PubDate>"
            f"<Year>2014</Year><Month>Jan</Month></PubDate></JournalIssue><Title>Scandinavian journal "
            f"of medicine &amp; science in sports</Title></Journal><ArticleTitle>{title}</ArticleTitle>"
            f"<Abstract>{abstract}</Abstract><AuthorList>{authors}</AuthorList></Article>"
            f"</PubmedArticle></PubmedArticleSet>")


ARTICLES = {
    "111": article("Block <i>periodization</i> of high-intensity\n  aerobic intervals",
                   '<AbstractText Label="PURPOSE">Compare block and traditional periodization in '
                   'well-trained cyclists over twelve weeks.</AbstractText><AbstractText Label="RESULTS">'
                   'VO<sub>2max</sub> rose by 8.8% &#177; 5.9% with block training.</AbstractText>',
                   ["Rønnestad", "Hansen", "Ellefsen"]),
    "222": article("A short note", "<AbstractText>Too short.</AbstractText>", ["Coggan"]),
    "333": article("Polarized training in endurance athletes",
                   "<AbstractText>Nine weeks of polarized training raised peak oxygen uptake more than threshold, "
                   "high-intensity or high-volume training.</AbstractText>", ["Stöggl", "Sperlich"]),
}


def pubmed(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("esearch.fcgi"):
        pmid = FOUND[request.url.params["term"]]
        return httpx.Response(200, json={"esearchresult": {"idlist": [pmid] if pmid else []}})
    return httpx.Response(200, text=ARTICLES[request.url.params["id"]])


def client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture
def fake_pubmed(monkeypatch):
    monkeypatch.setattr(build_index, "SEARCHES", SEARCHES)
    monkeypatch.setattr(build_index, "PAUSE", 0)


def test_rebuild_from_pubmed_takes_each_paper_from_its_search(index_file, fake_pubmed, capsys):
    assert build_index.main([], path=index_file, client=client(pubmed)) == 0
    new = json.loads(index_file.read_text(encoding="utf-8"))
    assert without_vectors(new)[0] == {
        "pmid": "111", "title": "Block periodization of high-intensity aerobic intervals",
        "authors": "Rønnestad et al.", "year": "2014",
        "journal": "Scandinavian journal of medicine & science in sports",
        "abstract": "PURPOSE: Compare block and traditional periodization in well-trained cyclists over "
                    "twelve weeks. RESULTS: VO2max rose by 8.8% ± 5.9% with block training."}
    assert [p["pmid"] for p in new["papers"]] == ["111", "333"]
    assert (new["model"], new["count"], new["embeddingDim"]) == ("BAAI/bge-small-en-v1.5", 2, 384)
    assert "[secondo] PMID 333 (2014) Stöggl & Sperlich" in capsys.readouterr().out


@pytest.mark.parametrize("search, message", [
    (("altro", "q-altro", "333"), "altro: la ricerca trova per primo il PMID 444 invece del PMID 333"),
    (("assente", "q-assente", "333"), "assente: la ricerca trova per primo nessun paper invece del PMID 333"),
    (("corto", "q-corto", "222"), "corto (PMID 222): abstract di 10 caratteri, troppo corto"),
], ids=["another-paper-first", "no-result", "short-abstract"])
def test_search_not_giving_its_paper_stops_the_rebuild_and_leaves_the_index_unchanged(
        index_file, fake_pubmed, monkeypatch, capsys, search, message):
    monkeypatch.setattr(build_index, "SEARCHES", [SEARCHES[0], search, SEARCHES[1]])
    before = index_file.read_bytes()
    assert build_index.main([], path=index_file, client=client(pubmed)) == 1
    assert unchanged(index_file, before)
    err = capsys.readouterr().err
    assert message in err and "papers_index.json non è cambiato" in err


@pytest.mark.parametrize("failure", [httpx.ConnectError("rete assente"), httpx.Response(503)],
                         ids=["unreachable", "error"])
def test_pubmed_failing_midway_stops_the_rebuild_and_leaves_the_index_unchanged(index_file, fake_pubmed,
                                                                                 capsys, failure):
    def handler(request):
        if request.url.params.get("term") != "q-secondo":
            return pubmed(request)
        if isinstance(failure, Exception):
            raise failure
        return failure
    before = index_file.read_bytes()
    assert build_index.main([], path=index_file, client=client(handler)) == 1
    assert unchanged(index_file, before)
    assert "papers_index.json non è cambiato" in capsys.readouterr().err


# --- Le ricerche dell'indice vero ----------------------------------------------------------

def test_every_supporting_paper_has_a_search_that_fetches_it():
    expected = {pmid for _, _, pmid in build_index.SEARCHES}
    missing = {pid: p.source_pmid for pid, p in PROTOCOLS.items() if p.source_pmid and p.source_pmid not in expected}
    assert missing == {}


def test_each_paper_has_one_search_so_a_shared_supporting_paper_is_in_the_index_once():
    pmids = [pmid for _, _, pmid in build_index.SEARCHES]
    assert len(pmids) == len(set(pmids))
