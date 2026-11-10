"""Ricostruzione dell'indice dei paper con il modello di ricerca, senza Ollama: la ricodifica
cambia solo i vettori dei passaggi e il nome del modello; la ricostruzione da PubMed prende ogni
paper dalla sua ricerca, ne taglia in passaggi il testo completo se Europe PMC lo ha con una licenza
che permette di copiarlo, altrimenti l'abstract, e si ferma se una ricerca trova per primo un altro
paper; se PubMed o Europe PMC non rispondono o il lavoro si interrompe, il file resta com'era. Ogni
paper di supporto dei protocolli ha la sua ricerca. PubMed ed Europe PMC sono simulati; il modello
di ricerca è quello vero."""

import asyncio
import json
import re
import socket
import threading
import xml.etree.ElementTree as ET

import httpx
import pytest

from app import build_index, papers, project_files, search, shared_files
from app.protocols import PROTOCOLS
from fixture_data import FIXTURES, load

INDEX = {**load("papers_index.json"), "model": "nomic-embed-text", "builtAt": "2026-05-07T12:06:22.489Z",
         "count": 10, "embeddingDim": 10}


def without_vectors(index: dict) -> list:
    return [{**p, "passages": [{k: v for k, v in s.items() if k != "embedding"} for s in p["passages"]]}
            for p in index["papers"]]


@pytest.fixture
def index_file(tmp_path):
    path = tmp_path / "papers_index.json"
    path.write_text(json.dumps(INDEX), encoding="utf-8")
    return path


def unchanged(index_file, before: bytes) -> bool:
    """Il file è quello di prima, e non resta nessun file temporaneo accanto."""
    return index_file.read_bytes() == before and list(index_file.parent.iterdir()) == [index_file]


def test_reencoding_changes_only_the_passage_vectors_and_the_model_name_without_internet(index_file, monkeypatch):
    def no_network(*args):
        raise AssertionError("la ricodifica non deve usare la rete")
    monkeypatch.setattr(socket.socket, "connect", no_network)
    assert build_index.main(["--reencode"], path=index_file) == 0
    new = json.loads(index_file.read_text(encoding="utf-8"))
    assert without_vectors(new) == without_vectors(INDEX)
    assert (new["model"], new["builtAt"], new["count"], new["embeddingDim"]) == (
        "BAAI/bge-small-en-v1.5", INDEX["builtAt"], 10, 384)
    assert all(len(s["embedding"]) == 384 for p in new["papers"] for s in p["passages"])
    # Query e passaggi sono codificati dallo stesso modello: il testo di un passaggio trova il suo paper per primo.
    query = asyncio.run(search.encode(INDEX["papers"][3]["passages"][1]["text"]))
    [first, *_] = papers.top_papers(papers.check_index(new), query)
    assert first["pmid"] == INDEX["papers"][3]["pmid"] and first["score"] == pytest.approx(1, abs=1e-5)
    assert INDEX["papers"][3]["passages"][1]["label"] in [s["label"] for s in first["passages"]]
    assert list(index_file.parent.iterdir()) == [index_file]


def test_reencoding_says_how_many_passages_were_cut_at_the_model_limit(index_file, capsys):
    long, short = INDEX["papers"][:2]
    too_long = {**long["passages"][0], "text": "watt " * 600}
    index_file.write_text(json.dumps({**INDEX, "papers": [{**long, "passages": [too_long]},
                                                          {**short, "passages": short["passages"][:1]}]}))
    assert build_index.main(["--reencode"], path=index_file) == 0
    assert "Passaggi oltre i 512 token che il modello di ricerca legge: 1 su 2." in capsys.readouterr().out


def test_reencoding_an_index_from_before_passages_asks_for_a_rebuild_and_leaves_it_unchanged(index_file, capsys):
    old = [{k: v for k, v in p.items() if k not in ("textUsed", "passages")} | {"embedding": [1.0] * 10}
           for p in INDEX["papers"]]
    index_file.write_text(json.dumps({**INDEX, "papers": old}), encoding="utf-8")
    before = index_file.read_bytes()
    assert build_index.main(["--reencode"], path=index_file) == 1
    assert unchanged(index_file, before)
    assert ("papers_index.json è di una versione precedente, senza passaggi: ricostruiscilo da PubMed"
            in capsys.readouterr().err)


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


# Europe PMC: la scheda di ogni paper (licenza, PMCID, testo completo presente) e i testi completi.
# Senza una voce qui, la scheda non ha licenza: il paper usa l'abstract.
RECORDS: dict[str, dict] = {}
FULL_TEXT = (FIXTURES / "full_text.xml").read_text(encoding="utf-8")
FULL_TEXTS = {"PMC111": FULL_TEXT}
OPEN_111 = {"pmid": "111", "license": "cc by", "pmcid": "PMC111", "inEPMC": "Y"}


def pubmed(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("esearch.fcgi"):
        pmid = FOUND[request.url.params["term"]]
        return httpx.Response(200, json={"esearchresult": {"idlist": [pmid] if pmid else []}})
    return httpx.Response(200, text=ARTICLES[request.url.params["id"]])


def europe_pmc(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/search"):
        pmid = re.fullmatch(r"EXT_ID:(\d+) AND SRC:MED", request.url.params["query"])[1]
        return httpx.Response(200, json={"resultList": {"result": [RECORDS.get(pmid, {"pmid": pmid, "inEPMC": "N"})]}})
    # Un PMCID senza testo completo: Europe PMC risponde 500, non 404.
    pmcid = request.url.path.split("/")[-2]
    return httpx.Response(200, text=FULL_TEXTS[pmcid]) if pmcid in FULL_TEXTS else httpx.Response(500)


def services(request: httpx.Request) -> httpx.Response:
    return europe_pmc(request) if request.url.host == "www.ebi.ac.uk" else pubmed(request)


def client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture
def fake_pubmed(monkeypatch):
    monkeypatch.setattr(build_index, "SEARCHES", SEARCHES)
    monkeypatch.setattr(build_index, "PAUSE", 0)
    RECORDS.clear()


def test_rebuild_from_pubmed_takes_each_paper_from_its_search_and_cuts_its_abstract(index_file, fake_pubmed,
                                                                                     monkeypatch, capsys):
    monkeypatch.setattr(papers, "PASSAGE_CHARS", 100)
    assert build_index.main([], path=index_file, client=client(services)) == 0
    new = json.loads(index_file.read_text(encoding="utf-8"))
    abstract = ("PURPOSE: Compare block and traditional periodization in well-trained cyclists over twelve weeks. "
                "RESULTS: VO2max rose by 8.8% ± 5.9% with block training.")
    assert without_vectors(new)[0] == {
        "pmid": "111", "title": "Block periodization of high-intensity aerobic intervals",
        "authors": "Rønnestad et al.", "year": "2014",
        "journal": "Scandinavian journal of medicine & science in sports", "abstract": abstract,
        "textUsed": "abstract",
        "passages": [{"label": "PMID:111 §1", "text": "PURPOSE: Compare block and traditional periodization in "
                                                       "well-trained cyclists over twelve weeks."},
                     {"label": "PMID:111 §2", "text": "RESULTS: VO2max rose by 8.8% ± 5.9% with block training."}]}
    assert [p["pmid"] for p in new["papers"]] == ["111", "333"]
    assert (new["model"], new["count"], new["embeddingDim"]) == ("BAAI/bge-small-en-v1.5", 2, 384)
    assert all(len(s["embedding"]) == 384 for p in new["papers"] for s in p["passages"])
    assert papers.check_index(new) == new
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
    assert build_index.main([], path=index_file, client=client(services)) == 1
    assert unchanged(index_file, before)
    err = capsys.readouterr().err
    assert message in err and "papers_index.json non è cambiato" in err


@pytest.mark.parametrize("failure", [httpx.ConnectError("rete assente"), httpx.Response(503)],
                         ids=["unreachable", "error"])
def test_pubmed_failing_midway_stops_the_rebuild_and_leaves_the_index_unchanged(index_file, fake_pubmed,
                                                                                 capsys, failure):
    def handler(request):
        if request.url.params.get("term") != "q-secondo":
            return services(request)
        if isinstance(failure, Exception):
            raise failure
        return failure
    before = index_file.read_bytes()
    assert build_index.main([], path=index_file, client=client(handler)) == 1
    assert unchanged(index_file, before)
    assert "papers_index.json non è cambiato" in capsys.readouterr().err


# --- Il testo completo da Europe PMC -------------------------------------------------------

ABSTRACT_111 = ("PURPOSE: Compare block and traditional periodization in well-trained cyclists over twelve weeks. "
                "RESULTS: VO2max rose by 8.8% ± 5.9% with block training.")


def rebuilt_paper(index_file, pmid: str = "111") -> dict:
    new = json.loads(index_file.read_text(encoding="utf-8"))
    assert papers.check_index(new) == new
    return next(p for p in without_vectors(new) if p["pmid"] == pmid)


def test_a_paper_under_an_open_license_is_cut_from_its_abstract_and_its_body_sections(index_file, fake_pubmed,
                                                                                      capsys):
    RECORDS["111"] = OPEN_111
    seen = []
    assert build_index.main([], path=index_file, client=client(lambda r: seen.append(r.url) or services(r))) == 0
    paper = rebuilt_paper(index_file)
    assert (paper["textUsed"], paper["license"], paper["licenseUrl"]) == (
        "fullText", "CC BY", "http://creativecommons.org/licenses/by/4.0/")
    # Ogni sezione ha i suoi passaggi, anche quando due starebbero in uno; tabelle, figure, la sottosezione
    # sul finanziamento, ringraziamenti, conflitti, la sezione senza titolo e i riferimenti restano fuori.
    assert paper["passages"] == [
        {"label": "PMID:111 §1", "text": ABSTRACT_111},
        {"label": "PMID:111 §2", "text": "Introduction: Heavy strength training improves cycling economy. "
                                         "Few studies tested well-trained cyclists."},
        {"label": "PMID:111 §3", "text": "Methods: Participants: Twelve cyclists took part. "
                                         "Training: They lifted twice a week."},
        {"label": "PMID:111 §4", "text": "VO2max: It rose by 3%."}]
    # Un paper senza licenza aperta registra l'abstract e nessuna licenza.
    assert rebuilt_paper(index_file, "333")["textUsed"] == "abstract"
    assert "license" not in rebuilt_paper(index_file, "333")
    searched = [u for u in seen if u.path.endswith("/europepmc/webservices/rest/search")]
    assert [(u.params["query"], u.params["resultType"], u.params["format"]) for u in searched] == [
        ("EXT_ID:111 AND SRC:MED", "core", "json"), ("EXT_ID:333 AND SRC:MED", "core", "json")]
    assert [u.path for u in seen if u.path.endswith("fullTextXML")] == [
        "/europepmc/webservices/rest/PMC111/fullTextXML"]
    assert "↳ testo completo da Europe PMC (CC BY, PMC111): 3 sezioni" in capsys.readouterr().out


@pytest.mark.parametrize("raw, name", [
    ("cc by", "CC BY"), ("CC BY 4.0", "CC BY"), ("CC-BY", "CC BY"), ("cc-by-sa", "CC BY-SA"),
    ("CC BY-SA 4.0", "CC BY-SA"), ("cc0", "CC0"), ("CC0 1.0", "CC0"),
    ("cc by-nc", None), ("CC BY-NC-ND 4.0", None), ("cc by-nd", None), ("cc by-nc-sa", None),
    ("implied-oa", None), ("", None), (None, None)])
def test_only_licenses_that_allow_copying_are_recognized_however_written(raw, name):
    assert build_index.license_name(raw) == name


def jats(body: str, license: str = '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"/>') -> str:
    return (f'<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><permissions>{license}</permissions>'
            f'</front><body>{body}</body></article>')


@pytest.mark.parametrize("record, full_text, says", [
    ({**OPEN_111, "license": "cc by-nc"}, None, None),
    ({k: v for k, v in OPEN_111.items() if k != "license"}, None, None),
    ({**OPEN_111, "inEPMC": "N"}, None, "licenza CC BY, ma Europe PMC non ha il testo completo: uso l'abstract"),
    ({k: v for k, v in OPEN_111.items() if k != "pmcid"}, None,
     "licenza CC BY, ma Europe PMC non ha il testo completo: uso l'abstract"),
    (OPEN_111, FULL_TEXT.replace("creativecommons.org", "example.org"),
     "licenza CC BY, ma il testo completo non ha il link della licenza: uso l'abstract"),
    (OPEN_111, jats("<sec><p>Cite this article.</p></sec><sec><title>References</title></sec>"),
     "licenza CC BY, ma il testo completo non ha sezioni da leggere: uso l'abstract"),
], ids=["license-nc", "no-license", "not-in-europe-pmc", "no-pmcid", "no-cc-link", "no-sections"])
def test_a_paper_without_a_full_text_it_may_copy_uses_its_abstract(index_file, fake_pubmed, monkeypatch, capsys,
                                                                   record, full_text, says):
    RECORDS["111"] = record
    if full_text is not None:
        monkeypatch.setitem(FULL_TEXTS, "PMC111", full_text)
    assert build_index.main([], path=index_file, client=client(services)) == 0
    paper = rebuilt_paper(index_file)
    assert (paper["textUsed"], [s["text"] for s in paper["passages"]]) == ("abstract", [ABSTRACT_111])
    assert "license" not in paper and "licenseUrl" not in paper
    out = capsys.readouterr().out
    assert (says in out) if says else "↳" not in out


@pytest.mark.parametrize("license", [
    '<license xlink:href="http://creativecommons.org/licenses/by/3.0/"><license-p>Open.</license-p></license>',
    '<license xmlns:ali="http://www.niso.org/schemas/ali/1.0/"><ali:license_ref>'
    'http://creativecommons.org/licenses/by/3.0/</ali:license_ref></license>',
    '<license><license-p>Under the <ext-link xlink:href="http://example.org/terms">terms</ext-link> and the '
    '<ext-link xlink:href="http://creativecommons.org/licenses/by/3.0/">CC BY</ext-link> license.</license-p>'
    '</license>',
], ids=["license", "ali-license-ref", "ext-link"])
def test_the_license_link_is_found_in_each_form_the_full_texts_use(license):
    article = ET.fromstring(jats("", license))
    assert build_index.license_link(article) == "http://creativecommons.org/licenses/by/3.0/"


@pytest.mark.parametrize("url", ["http://example.org/creativecommons.org/licenses/by/4.0/",
                                 "javascript:alert(1)//creativecommons.org/", "creativecommons.org/licenses/by/4.0/"])
def test_a_license_link_off_creativecommons_org_is_not_a_license_link(url):
    # La scheda del workout apre il link: deve essere una pagina di creativecommons.org.
    article = ET.fromstring(jats("", f'<license xlink:href="{url}"/>'))
    assert build_index.license_link(article) is None


@pytest.mark.parametrize("title", [
    "Acknowledgements", "Acknowledgments", "ACKNOWLEDGEMENT", "Conflict of Interests", "Conflicts of interest",
    "Competing interests", "Funding", "Disclosure of funding", "Author contributions", "Authors' contributions",
    "Author’s contributions", "References", "Supplementary tables", "Figure legends"])
def test_left_out_sections_are_recognized_whatever_their_case_variant_or_plural(title):
    article = ET.fromstring(jats(f"<sec><title>Results</title><p>Power rose.</p></sec>"
                                 f"<sec><title>{title}</title><p>Not the work.</p></sec>"))
    assert build_index.body_sections(article) == ["Results: Power rose."]


def test_subsections_of_a_kept_section_are_kept_in_reading_order():
    article = ET.fromstring(jats("<sec><title>Discussion</title><p>First.</p>"
                                 "<sec><title>Limitations?</title><p>Second.</p>"
                                 "<sec><p>Third, untitled.</p></sec></sec><p>Fourth.</p></sec>"))
    assert build_index.body_sections(article) == ["Discussion: First. Limitations? Second. Third, untitled. Fourth."]


@pytest.mark.parametrize("failure, message", [
    ("search-unreachable", "Europe PMC non raggiungibile (ConnectError)"),
    ("search-error", "Europe PMC ha risposto HTTP 503 a search"),
    ("search-broken", "Risposta di Europe PMC illeggibile (search)"),
    ("bad-pmcid", "Risposta di Europe PMC illeggibile (search)"),
    ("full-text-error", "Europe PMC ha risposto HTTP 500 a PMC111/fullTextXML"),
    ("full-text-broken", "Risposta di Europe PMC illeggibile (fullTextXML)"),
])
def test_europe_pmc_failing_stops_the_rebuild_and_leaves_the_index_unchanged(index_file, fake_pubmed, monkeypatch,
                                                                             capsys, failure, message):
    RECORDS["111"] = {**OPEN_111, "pmcid": "PMC111/../x"} if failure == "bad-pmcid" else OPEN_111
    if failure == "full-text-error":
        monkeypatch.delitem(FULL_TEXTS, "PMC111")
    if failure == "full-text-broken":
        monkeypatch.setitem(FULL_TEXTS, "PMC111", FULL_TEXT[:400])

    def handler(request):
        if request.url.path.endswith("/search") and failure.startswith("search"):
            if failure == "search-unreachable":
                raise httpx.ConnectError("rete assente")
            return httpx.Response(503) if failure == "search-error" else httpx.Response(200, text="{non json")
        return services(request)
    before = index_file.read_bytes()
    assert build_index.main([], path=index_file, client=client(handler)) == 1
    assert unchanged(index_file, before)
    err = capsys.readouterr().err
    assert message in err and "papers_index.json non è cambiato" in err


# --- Le ricerche dell'indice vero ----------------------------------------------------------

def test_every_supporting_paper_has_a_search_that_fetches_it():
    expected = {pmid for _, _, pmid in build_index.SEARCHES}
    missing = {pid: p.source_pmid for pid, p in PROTOCOLS.items() if p.source_pmid and p.source_pmid not in expected}
    assert missing == {}


def test_each_paper_has_one_search_so_a_shared_supporting_paper_is_in_the_index_once():
    pmids = [pmid for _, _, pmid in build_index.SEARCHES]
    assert len(pmids) == len(set(pmids))


# --- Ricodifica dei paper aggiunti alla libreria ------------------------------------------------

def added_library(saved_library, model="nomic-embed-text") -> bytes:
    paper = {**INDEX["papers"][0], "pmid": "111", "passages": INDEX["papers"][0]["passages"][:2]}
    saved_library.path.write_text(json.dumps({"model": model, "added": [paper], "removed": ["16430681"]}),
                                  encoding="utf-8")
    return saved_library.path.read_bytes()


def test_reencoding_also_reencodes_the_added_papers_without_internet(index_file, saved_library, monkeypatch, capsys):
    before = json.loads(added_library(saved_library))
    monkeypatch.setattr(socket.socket, "connect", lambda *args: pytest.fail("la ricodifica non deve usare la rete"))
    assert build_index.main(["--reencode"], path=index_file) == 0
    after = json.loads(saved_library.path.read_text(encoding="utf-8"))
    assert after["model"] == search.SEARCH_MODEL and after["removed"] == ["16430681"]
    assert without_vectors({"papers": after["added"]}) == without_vectors({"papers": before["added"]})
    assert all(len(s["embedding"]) == 384 for s in after["added"][0]["passages"])
    out = capsys.readouterr().out
    assert "Ricodifico 2 passaggi di 1 paper aggiunti" in out and "libreria: 1 paper aggiunti, 2 passaggi" in out


def test_reencoding_without_a_saved_library_reencodes_only_the_base_papers(index_file, saved_library, capsys):
    assert build_index.main(["--reencode"], path=index_file) == 0
    assert not saved_library.path.exists() and "aggiunti" not in capsys.readouterr().out


def test_an_unreadable_library_stops_the_reencoding_and_changes_neither_file(index_file, saved_library, capsys):
    saved_library.path.write_text("{")
    before = index_file.read_bytes()
    assert build_index.main(["--reencode"], path=index_file) == 1
    assert index_file.read_bytes() == before and saved_library.path.read_text() == "{"
    assert f"La libreria salvata in {saved_library.path} non si legge" in capsys.readouterr().err


def test_a_failing_base_index_leaves_the_library_unchanged(index_file, saved_library, monkeypatch):
    before = added_library(saved_library)
    monkeypatch.setattr(project_files.os, "replace", lambda *args: (_ for _ in ()).throw(KeyboardInterrupt))
    with pytest.raises(KeyboardInterrupt):
        build_index.main(["--reencode"], path=index_file)
    assert saved_library.path.read_bytes() == before


def test_reencoding_the_library_waits_for_the_coach_service_writing_it(index_file, saved_library):
    added_library(saved_library)
    done = threading.Event()
    with shared_files.locked(saved_library.path):
        worker = threading.Thread(target=lambda: build_index.main(["--reencode"], path=index_file) or done.set())
        worker.start()
        assert not done.wait(2)
    worker.join(30)
    assert done.is_set() and json.loads(saved_library.path.read_text())["model"] == search.SEARCH_MODEL
