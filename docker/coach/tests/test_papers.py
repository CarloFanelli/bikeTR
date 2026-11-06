"""Ricerca dei paper: con lo stesso vettore della query, gli stessi 4 paper del codice del
browser, nello stesso ordine anche a parità di punteggio."""

import asyncio

import httpx
import pytest

from app.papers import PaperIndexError, cosine, load_index, top_papers
from fixture_data import load

INDEX = load("papers_index.json")
CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")


@pytest.mark.parametrize("case", [c for c in CASES["cases"] if "retrieved" in EXPECTED["cases"][c["name"]]],
                         ids=lambda c: c["name"])
def test_query_vector_returns_the_browser_papers_in_order(case):
    found = top_papers(INDEX, CASES["queries"][case["query"]])
    assert [{"pmid": p["pmid"], "score": p["score"]} for p in found] == EXPECTED["cases"][case["name"]]["retrieved"]


def test_equal_scores_keep_the_index_order():
    papers = [p["pmid"] for p in INDEX["papers"]]
    found = top_papers(INDEX, CASES["queries"]["tieQuery"])
    assert found[1]["score"] == found[2]["score"]
    assert [p["pmid"] for p in found[1:3]] == [papers[1], papers[7]]


def test_cosine_of_a_zero_vector_or_different_lengths():
    assert cosine([0, 0], [1, 2]) == 0
    assert cosine([3, 4, 99], [3, 4]) == pytest.approx(1)


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


@pytest.mark.parametrize("response,message", [
    (httpx.Response(404), "papers_index.json non trovato (HTTP 404). Ripristinalo da git: git restore papers_index.json"),
    (httpx.Response(200, text="{non json"), "papers_index.json illeggibile. Ripristinalo da git: git restore papers_index.json"),
    (httpx.Response(200, json={"papers": [{"pmid": "1"}]}), "papers_index.json illeggibile. Ripristinalo da git: git restore papers_index.json"),
])
def test_missing_or_unreadable_index_says_how_to_restore_it(response, message):
    with pytest.raises(PaperIndexError) as e:
        fetch_index(lambda request: response)
    assert str(e.value) == message
