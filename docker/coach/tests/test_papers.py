"""Ricerca dei paper per passaggi: il taglio di un testo in passaggi di frasi intere, e la ricerca
nel database vettoriale in memoria (sqlite-vec) che dà i 4 paper con i passaggi più vicini.

Nell'indice dei test ogni passaggio ha il vettore che il suo paper aveva prima dei passaggi: con lo
stesso vettore della query la ricerca dà gli stessi paper del browser, nello stesso ordine anche a
parità di punteggio. Il resto della ricerca si prova con indici piccoli fatti qui."""

import asyncio
import math
import sqlite3

import httpx
import pytest

from app import papers
from app.papers import PaperIndexError, check_index, citations, cut_passages, load_index, sentences, top_papers
from fixture_data import load

INDEX = load("papers_index.json")
CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")


# --- Il taglio in passaggi ---------------------------------------------------------------------

def test_a_text_becomes_passages_of_whole_sentences_labelled_in_reading_order():
    text = " ".join(f"Ten well-trained cyclists rode four intervals of eight minutes, session number {n}."
                    for n in range(1, 21))
    found = cut_passages("21812820", text)
    assert [p["label"] for p in found] == [f"PMID:21812820 §{k}" for k in range(1, len(found) + 1)]
    assert len(found) > 1 and all(len(p["text"]) <= 600 and p["text"].endswith(".") for p in found)
    # Nessuna frase persa o spezzata, e l'ordine è quello del testo.
    assert " ".join(p["text"] for p in found) == text


def test_a_full_stop_in_a_number_or_an_abbreviation_does_not_end_a_sentence_and_headings_stay_attached():
    text = ("Power rose by 2.5 W/kg vs. Z2 riding (e.g. VO2max, Fig. 2), as reported by Seiler et al. (2010). "
            "METHODS: Ten cyclists rode for 12 weeks. RESULTS: Both groups improved!")
    assert sentences(text) == [
        "Power rose by 2.5 W/kg vs. Z2 riding (e.g. VO2max, Fig. 2), as reported by Seiler et al. (2010).",
        "METHODS: Ten cyclists rode for 12 weeks.",
        "RESULTS: Both groups improved!"]


def test_a_sentence_longer_than_a_passage_is_cut_at_a_space_and_goes_on_in_the_next():
    words = " ".join(f"word{n}" for n in range(200))
    text = f"{words}. Short end."
    found = [p["text"] for p in cut_passages("1", text)]
    assert len(found) == 3 and all(len(t) <= 600 for t in found)
    # Rimettendo uno spazio tra i pezzi torna il testo: ogni taglio è caduto su uno spazio.
    assert " ".join(found) == text
    assert found[-1].endswith("word199. Short end.")


def test_each_section_is_cut_on_its_own_and_the_numbering_goes_on_across_sections():
    found = cut_passages("1", "Abstract one. Abstract two.", "Introduction: Short.", "Methods: Also short.")
    # Le tre sezioni starebbero in un passaggio solo, ma un passaggio non mescola mai due sezioni.
    assert found == [{"label": "PMID:1 §1", "text": "Abstract one. Abstract two."},
                     {"label": "PMID:1 §2", "text": "Introduction: Short."},
                     {"label": "PMID:1 §3", "text": "Methods: Also short."}]


def test_the_test_index_is_cut_by_the_cutter():
    for p in INDEX["papers"]:
        assert [{"label": s["label"], "text": s["text"]} for s in p["passages"]] == cut_passages(p["pmid"],
                                                                                                p["abstract"])


# --- Le citazioni di una risposta ----------------------------------------------------------------

@pytest.mark.parametrize("listed, text, found", [
    (["PMID:21812820 §2"], "", [("21812820", 2)]),
    # Le etichette scritte in altri modi sono la stessa etichetta.
    ([], "Forma alta [PMID:21812820 §2], come in PMID 24550842 § 3 e in [PMID:31977120, §1].",
     [("21812820", 2), ("24550842", 3), ("31977120", 1)]),
    # Un paper citato senza passaggio.
    ([], "Lo dice [PMID:24550842].", [("24550842", None)]),
    # Nella lista basta il numero, anche come numero JSON.
    (["21812820", 16430681, "21812820 §4"], "", [("21812820", None), ("16430681", None), ("21812820", 4)]),
    # Prima la lista, poi il testo; una citazione ripetuta conta una volta.
    (["PMID:21812820 §2"], "Vedi [PMID:31977120 §1] e [PMID:21812820 §2].", [("21812820", 2), ("31977120", 1)]),
    # Una lista che non è una lista non conta; nel testo un numero senza "PMID" non è una citazione.
    ("PMID:21812820 §2", "TSB 12, 4 intervalli da 8 minuti.", []),
], ids=["list", "written-other-ways", "paper-only", "bare-numbers", "list-then-text-once", "not-citations"])
def test_citations_are_read_from_the_list_and_the_text_however_written(listed, text, found):
    assert citations(listed, text) == found


# --- La ricerca --------------------------------------------------------------------------------

def unit(degrees: float) -> list:
    """Un vettore a due numeri, a `degrees` gradi dalla query [1, 0]: più è vicino, più è simile."""
    return [math.cos(math.radians(degrees)), math.sin(math.radians(degrees))]


def paper(pmid: str, *angles: float) -> dict:
    return {"pmid": pmid, "title": f"Paper {pmid}", "authors": "Autori", "year": "2020", "abstract": "Abstract.",
            "textUsed": "abstract",
            "passages": [{"label": f"PMID:{pmid} §{k}", "text": f"Passaggio {k} di {pmid}.", "embedding": unit(a)}
                         for k, a in enumerate(angles, 1)]}


def index_of(*found: dict) -> dict:
    return {"model": INDEX["model"], "embeddingDim": 2, "papers": list(found)}


def search(index: dict) -> list:
    return [(p["pmid"], [s["label"].split()[-1] for s in p["passages"]]) for p in top_papers(index, [1, 0])]


def test_papers_rank_by_their_closest_passage_and_bring_their_two_closest_in_reading_order():
    index = index_of(paper("1", 50, 10, 80), paper("2", 20), paper("3", 30, 5), paper("4", 60, 85),
                     paper("5", 70))
    found = top_papers(index, [1, 0])
    assert search(index) == [("3", ["§1", "§2"]), ("1", ["§1", "§2"]), ("2", ["§1"]), ("4", ["§1", "§2"])]
    # Il punteggio del paper è quello del suo passaggio più vicino; ogni passaggio ha il suo.
    assert [p["score"] for p in found] == pytest.approx([math.cos(math.radians(a)) for a in (5, 10, 20, 60)])
    assert [s["score"] for s in found[0]["passages"]] == pytest.approx([math.cos(math.radians(a)) for a in (30, 5)])
    assert found[0]["passages"][0]["text"] == "Passaggio 1 di 3." and "embedding" not in found[0]["passages"][0]


def test_with_fewer_than_four_papers_all_are_found_each_with_up_to_two_passages():
    assert search(index_of(paper("1", 40, 30, 20), paper("2", 10))) == [("2", ["§1"]), ("1", ["§2", "§3"])]


def test_papers_whose_closest_passages_score_the_same_keep_the_index_order():
    index = index_of(*(paper(str(n), 30, 30) for n in range(1, 7)))
    assert search(index) == [(str(n), ["§1", "§2"]) for n in range(1, 5)]


def test_every_search_builds_its_own_database_in_memory(monkeypatch):
    opened, loaded = [], []
    connect, load_extension = sqlite3.connect, papers.sqlite_vec.load
    monkeypatch.setattr(papers.sqlite3, "connect", lambda path: opened.append(path) or connect(path))
    monkeypatch.setattr(papers.sqlite_vec, "load", lambda db: loaded.append(db) or load_extension(db))
    top_papers(INDEX, CASES["queries"]["middle"])
    top_papers(INDEX, CASES["queries"]["middle"])
    assert opened == [":memory:", ":memory:"] and len(loaded) == 2 and loaded[0] is not loaded[1]


@pytest.mark.parametrize("case", [c for c in CASES["cases"] if "retrieved" in EXPECTED["cases"][c["name"]]],
                         ids=lambda c: c["name"])
def test_query_vector_returns_the_browser_papers_in_order(case):
    found = top_papers(INDEX, CASES["queries"][case["query"]])
    expected = EXPECTED["cases"][case["name"]]["retrieved"]
    assert [p["pmid"] for p in found] == [p["pmid"] for p in expected]
    # sqlite-vec calcola con numeri a 32 bit, il browser a 64.
    assert [p["score"] for p in found] == pytest.approx([p["score"] for p in expected], abs=1e-6)


def test_equal_scores_keep_the_index_order():
    pmids = [p["pmid"] for p in INDEX["papers"]]
    found = top_papers(INDEX, CASES["queries"]["tieQuery"])
    assert found[1]["score"] == found[2]["score"]
    assert [p["pmid"] for p in found[1:3]] == [pmids[1], pmids[7]]


# --- L'indice -----------------------------------------------------------------------------------

def fetch_index(handler):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await load_index(client)
    return asyncio.run(go())


def test_index_is_read_from_nginx_as_localhost():
    seen = []

    def handler(request):
        seen.append((str(request.url), request.headers["host"]))
        return httpx.Response(200, json=INDEX)
    assert fetch_index(handler) == INDEX
    assert seen == [("http://web/papers_index.json", "localhost")]


UNREADABLE = "papers_index.json illeggibile. Ripristinalo da git: git restore papers_index.json"


@pytest.mark.parametrize("response,message", [
    (httpx.Response(404), "papers_index.json non trovato (HTTP 404). Ripristinalo da git: git restore papers_index.json"),
    (httpx.Response(200, text="{non json"), UNREADABLE),
    (httpx.Response(200, json={"papers": [{"pmid": "1"}]}), UNREADABLE),
    (httpx.Response(200, json={"model": INDEX["model"], "papers": []}), UNREADABLE),
    (httpx.Response(200, json=[]), UNREADABLE),
    # Vettori più lunghi di quanto dichiara l'indice: il database non li accetterebbe.
    (httpx.Response(200, json={**INDEX, "embeddingDim": 384}), UNREADABLE),
    (httpx.Response(200, json={**INDEX, "papers": [{**INDEX["papers"][0], "passages": []}]}), UNREADABLE),
    # Un testo completo senza licenza o senza il suo link: la scheda non potrebbe citarne la licenza.
    (httpx.Response(200, json={**INDEX, "papers": [{**INDEX["papers"][0], "textUsed": "fullText",
                                                    "license": "CC BY"}]}), UNREADABLE),
    (httpx.Response(200, json={**INDEX, "papers": [{**INDEX["papers"][0], "textUsed": "fullText",
                                                    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"}]}),
     UNREADABLE),
])
def test_missing_or_unreadable_index_says_how_to_restore_it(response, message):
    with pytest.raises(PaperIndexError) as e:
        fetch_index(lambda request: response)
    assert str(e.value) == message


def test_an_index_from_before_passages_says_how_to_restore_or_rebuild_it():
    old = {**INDEX, "papers": [{k: v for k, v in p.items() if k not in ("textUsed", "passages")}
                               | {"embedding": p["passages"][0]["embedding"]} for p in INDEX["papers"]]}
    with pytest.raises(PaperIndexError) as e:
        check_index(old)
    assert str(e.value) == ("papers_index.json è di una versione precedente, senza passaggi. Ripristinalo da git: "
                            "git restore papers_index.json, o ricostruiscilo con: "
                            "docker compose run --rm coach-tools python -m app.build_index")


@pytest.mark.parametrize("model,named", [("nomic-embed-text", "nomic-embed-text"), (None, "un modello senza nome")])
def test_index_of_another_search_model_gives_the_command_that_reencodes_it(model, named):
    with pytest.raises(PaperIndexError) as e:
        check_index({**INDEX, "model": model})
    assert str(e.value) == (f"papers_index.json è codificato con {named}, non con il modello di ricerca del Coach "
                            "(BAAI/bge-small-en-v1.5). Ricodificalo con: "
                            "docker compose run --rm coach-tools python -m app.build_index --reencode")
