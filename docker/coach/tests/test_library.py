"""Libreria: i paper che il Coach cerca, con cosa ne dipende, i passaggi di un paper, e un paper
aggiunto per PMID, salvato fuori da git. L'indice di base è quello dei test, con un paper a testo
completo e il paper di supporto degli esercizi di cadenza aggiunti per i casi che non ha. PubMed ed
Europe PMC sono quelli finti della ricostruzione dell'indice; il modello di ricerca dà vettori fissi."""

import asyncio
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import library, main, papers, search, workout
from app.protocols import PROTOCOLS, Protocol, z2_endurance
from fakes import INDEX
from test_build_index import ARTICLES, OPEN_111, RECORDS, client, fake_pubmed, services  # noqa: F401 (fixture)

WHITTY = "27175601"
SEILER_2010 = "20861519"
SEILER_2013 = "21812820"
FULL_TEXT = {**INDEX["papers"][0], "pmid": "24550842", "textUsed": "fullText", "license": "CC BY",
             "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
             "passages": [{**s, "label": f"PMID:24550842 §{k}"} for k, s in enumerate(INDEX["papers"][0]["passages"], 1)]}
ONE_PASSAGE = {**INDEX["papers"][1], "pmid": WHITTY, "passages": INDEX["papers"][1]["passages"][:1]}
LIBRARY_INDEX = {**INDEX, "papers": [*INDEX["papers"], FULL_TEXT, ONE_PASSAGE,
                                     {**INDEX["papers"][2], "pmid": SEILER_2013}]}
VECTOR = [0.1] * INDEX["embeddingDim"]


@pytest.fixture
def service(monkeypatch, fake_pubmed):
    async def base_index(http):
        return LIBRARY_INDEX
    monkeypatch.setattr(papers, "load_index", base_index)
    monkeypatch.setattr(library, "sources", lambda: client(services))
    monkeypatch.setattr(search, "encode_now", lambda texts: [VECTOR for _ in texts])
    return TestClient(main.app)


def listed(service) -> dict:
    res = service.get("/coach/library")
    assert res.status_code == 200
    return {p["pmid"]: p for p in res.json()["papers"]}


def test_lists_every_paper_with_title_authors_year_and_journal(service):
    papers = listed(service)
    assert list(papers) == [p["pmid"] for p in LIBRARY_INDEX["papers"]]
    first = INDEX["papers"][0]
    assert {k: papers[first["pmid"]][k] for k in ("title", "authors", "year", "journal")} == {
        k: first[k] for k in ("title", "authors", "year", "journal")}


def test_each_paper_says_base_passage_count_and_text_used(service):
    papers = listed(service)
    first = INDEX["papers"][0]
    assert {k: papers[first["pmid"]][k] for k in ("origin", "passageCount", "textUsed", "license")} == {
        "origin": "base", "passageCount": len(first["passages"]), "textUsed": "abstract", "license": None}
    assert {k: papers["24550842"][k] for k in ("textUsed", "license", "licenseUrl")} == {
        "textUsed": "fullText", "license": "CC BY", "licenseUrl": "http://creativecommons.org/licenses/by/4.0/"}


def test_the_list_carries_neither_passages_nor_vectors(service):
    assert all("passages" not in p and "abstract" not in p for p in listed(service).values())


def test_a_supporting_paper_names_its_workouts_and_rules(service):
    papers = listed(service)
    assert papers[WHITTY]["supports"] == {"workouts": ["Z2 + cadence drills"], "rules": []}
    assert papers[SEILER_2013]["supports"]["workouts"] == ["Seiler 4×8' (FTP/VO2)", "Seiler 4×4' (VO2max)"]
    seiler_2010 = papers[SEILER_2010]["supports"]
    assert seiler_2010["workouts"] == [] and len(seiler_2010["rules"]) == 1
    assert seiler_2010["rules"][0].startswith("Hard dal 30% in su") and "[PMID:20861519]" in seiler_2010["rules"][0]


def test_a_paper_nobody_names_has_no_dependency(service):
    assert listed(service)[INDEX["papers"][2]["pmid"]]["supports"] == {"workouts": [], "rules": []}


def test_a_paper_both_a_workout_and_a_rule_cite_names_both(service, monkeypatch):
    monkeypatch.setitem(PROTOCOLS, "z2_endurance", Protocol("Z2 Aerobico", SEILER_2010, z2_endurance))
    supports = listed(service)[SEILER_2010]["supports"]
    assert supports["workouts"] == ["Z2 Aerobico"] and len(supports["rules"]) == 1


def test_opening_a_paper_gives_its_passages_in_reading_order_without_vectors(service):
    res = service.get("/coach/library/24550842")
    assert res.status_code == 200
    assert res.json() == {"pmid": "24550842", "passages": [
        {"label": f"PMID:24550842 §{k}", "text": s["text"]} for k, s in enumerate(FULL_TEXT["passages"], 1)]}


def test_a_paper_with_one_passage_opens_with_it(service):
    passages = service.get(f"/coach/library/{WHITTY}").json()["passages"]
    assert passages == [{"label": ONE_PASSAGE["passages"][0]["label"], "text": ONE_PASSAGE["passages"][0]["text"]}]


def test_a_paper_not_in_the_library_is_not_found(service):
    res = service.get("/coach/library/1")
    assert (res.status_code, res.json()["error"]) == (404, "not_found")
    assert res.json()["message"] == "Il paper PMID 1 non è in libreria"


def test_an_unusable_index_is_refused_with_its_message(service, monkeypatch):
    async def broken(http):
        raise papers.PaperIndexError(f"papers_index.json illeggibile. {papers.RESTORE}")
    monkeypatch.setattr(papers, "load_index", broken)
    for path in ("/coach/library", f"/coach/library/{WHITTY}"):
        res = service.get(path)
        assert (res.status_code, res.json()) == (502, {
            "error": "retrieval", "message": f"papers_index.json illeggibile. {papers.RESTORE}"})


# --- Aggiungere un paper per PMID -------------------------------------------------------------

def preview(service, pmid):
    return service.post("/coach/library/preview", json={"pmid": pmid})


def add(service, pmid):
    return service.post("/coach/library", json={"pmid": pmid})


def saved(saved_library) -> dict:
    return json.loads(saved_library.path.read_text(encoding="utf-8"))


def test_a_pmid_gives_a_preview_and_saves_nothing(service, saved_library):
    RECORDS["111"] = OPEN_111
    res = preview(service, "111")
    assert res.status_code == 200
    assert res.json() == {
        "pmid": "111", "title": "Block periodization of high-intensity aerobic intervals",
        "authors": "Rønnestad et al.", "year": "2014", "journal": "Scandinavian journal of medicine & science in sports",
        "textUsed": "fullText", "license": "CC BY", "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
        "reason": "testo completo da Europe PMC (CC BY, PMC111): 3 sezioni", "passageCount": 4}
    assert not saved_library.path.exists()


def test_a_paper_under_a_non_commercial_license_uses_its_abstract_and_says_why(service):
    RECORDS["111"] = {**OPEN_111, "license": "cc by-nc"}
    body = preview(service, "111").json()
    assert (body["textUsed"], body["license"], body["reason"]) == ("abstract", None, library.NO_OPEN_LICENSE)


@pytest.mark.parametrize("pmid", ["", "  ", "12a", "PMID:111", None, 111])
def test_a_pmid_that_is_not_a_number_is_refused_before_pubmed(service, monkeypatch, pmid):
    monkeypatch.setattr(library, "sources", lambda: pytest.fail("PubMed contattato"))
    for res in (preview(service, pmid), add(service, pmid)):
        assert (res.status_code, res.json()) == (400, {"error": "invalid_pmid", "message": "Il PMID è un numero"})


def test_a_pmid_already_in_the_library_is_refused_naming_the_paper(service, monkeypatch):
    monkeypatch.setattr(library, "sources", lambda: pytest.fail("PubMed contattato"))
    first = INDEX["papers"][0]
    res = preview(service, first["pmid"])
    assert (res.status_code, res.json()["message"]) == (
        409, f"Già in libreria: {first['authors']} ({first['year']}). {first['title']}")


def test_a_pmid_pubmed_does_not_know_is_refused(service, monkeypatch):
    monkeypatch.setitem(ARTICLES, "999", "<PubmedArticleSet></PubmedArticleSet>")
    res = preview(service, "999")
    assert (res.status_code, res.json()["message"]) == (404, "PubMed non conosce il PMID 999")


@pytest.mark.parametrize("down, says", [
    ("eutils.ncbi.nlm.nih.gov", "PubMed non raggiungibile (ConnectError)"),
    ("www.ebi.ac.uk", "Europe PMC ha risposto HTTP 503 a search")])
def test_a_service_failing_names_it_and_saves_nothing(service, saved_library, monkeypatch, down, says):
    def handler(request):
        if request.url.host != down:
            return services(request)
        if down == "www.ebi.ac.uk":
            return httpx.Response(503)
        raise httpx.ConnectError("giù", request=request)
    monkeypatch.setattr(library, "sources", lambda: client(handler))
    for res in (preview(service, "111"), add(service, "111")):
        assert (res.status_code, res.json()) == (502, {
            "error": "source", "message": f"{says}: niente è stato salvato, riprova più tardi"})
    assert not saved_library.path.exists()


def test_a_short_abstract_without_an_open_full_text_is_refused(service, saved_library):
    res = add(service, "222")
    assert res.status_code == 422 and "abstract di 10 caratteri" in res.json()["message"]
    assert not saved_library.path.exists()


def test_confirming_saves_the_paper_cut_and_encoded_like_the_base_papers(service, saved_library):
    RECORDS["111"] = OPEN_111
    res = add(service, "111")
    assert res.status_code == 200
    body = res.json()
    assert (body["pmid"], body["passageCount"]) == ("111", 4) and body["seconds"] >= 0
    file = saved(saved_library)
    assert file["model"] == search.SEARCH_MODEL and [p["pmid"] for p in file["added"]] == ["111"]
    paper = file["added"][0]
    assert [s["label"] for s in paper["passages"]] == [f"PMID:111 §{k}" for k in range(1, 5)]
    assert all(len(s["text"]) <= papers.PASSAGE_CHARS and s["embedding"] == VECTOR for s in paper["passages"])
    assert papers.usable(paper, INDEX["embeddingDim"])
    added = listed(service)["111"]
    assert (added["origin"], added["textUsed"], added["license"]) == ("added", "fullText", "CC BY")


def test_the_next_coach_request_searches_the_added_paper(service):
    # Una richiesta partita prima dell'aggiunta ha già il suo indice, letto all'inizio.
    before = asyncio.run(main.load_index())
    add(service, "333")
    after = asyncio.run(main.load_index())
    assert "333" not in [p["pmid"] for p in before["papers"]] and after["papers"][-1]["pmid"] == "333"
    assert papers.check_index(after) == after
    assert len(LIBRARY_INDEX["papers"]) == len(INDEX["papers"]) + 3   # l'indice di base non cambia


def test_the_same_pmid_confirmed_twice_is_added_once(service, saved_library):
    assert add(service, "333").status_code == 200
    res = add(service, "333")
    assert (res.status_code, res.json()["error"]) == (409, "duplicate")
    paper = library.encoded("333")
    with pytest.raises(Exception, match="Già in libreria"):
        library.save(saved_library, LIBRARY_INDEX, paper)
    assert [p["pmid"] for p in saved(saved_library)["added"]] == ["333"]


def added_papers(n: int) -> list:
    return [{**FULL_TEXT, "pmid": str(900000 + k)} for k in range(n)]


def test_at_most_fifty_added_papers(service, saved_library):
    saved_library.path.write_text(json.dumps({"model": search.SEARCH_MODEL, "added": added_papers(49)}))
    assert add(service, "333").status_code == 200
    res = add(service, "111")
    assert (res.status_code, res.json()["message"]) == (
        409, "La libreria ha già 50 paper aggiunti, il massimo: togline uno prima di aggiungerne un altro")


def test_an_unreadable_library_leaves_the_base_papers_and_the_file_untouched(service, saved_library):
    saved_library.path.write_text("{")
    res = service.get("/coach/library")
    assert list(p["pmid"] for p in res.json()["papers"]) == [p["pmid"] for p in LIBRARY_INDEX["papers"]]
    assert res.json()["warning"].startswith(f"La libreria salvata in {saved_library.path} non si legge")
    assert asyncio.run(main.load_index()) == LIBRARY_INDEX
    refused = add(service, "333")
    assert (refused.status_code, refused.json()["error"]) == (500, "library_unreadable")
    assert saved_library.path.read_text() == "{"


def test_an_added_paper_that_became_a_base_paper_is_listed_once_as_base(service, saved_library):
    saved_library.path.write_text(json.dumps({"model": search.SEARCH_MODEL, "added": [{**FULL_TEXT, "pmid": WHITTY}]}))
    pmids = [p["pmid"] for p in service.get("/coach/library").json()["papers"]]
    assert pmids.count(WHITTY) == 1 and listed(service)[WHITTY]["origin"] == "base"
    assert [p["pmid"] for p in asyncio.run(main.load_index())["papers"]].count(WHITTY) == 1


def test_a_slow_pubmed_does_not_hold_up_the_other_requests(service, monkeypatch):
    monkeypatch.setattr(library, "fetch", lambda pmid: time.sleep(1) or (FULL_TEXT, "motivo"))

    async def both():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://coach") as http:
            started = time.monotonic()
            slow_preview = asyncio.create_task(http.post("/coach/library/preview", json={"pmid": "333"}))
            await asyncio.sleep(0.1)
            await http.get("/coach/status")
            status_took = time.monotonic() - started
            await slow_preview
            return status_took
    assert asyncio.run(both()) < 0.5


# --- Togliere e ripristinare -------------------------------------------------------------------

def remove(service, pmid):
    return service.delete(f"/coach/library/{pmid}")


def restore(service, pmid):
    return service.post(f"/coach/library/{pmid}/restore")


def test_removing_an_added_paper_deletes_it(service, saved_library):
    add(service, "333")
    assert remove(service, "333").status_code == 200
    assert "333" not in listed(service) and saved(saved_library)["added"] == []


def test_removing_a_base_paper_moves_it_to_the_removed_list_until_restored(service, saved_library):
    assert remove(service, WHITTY).status_code == 200
    body = service.get("/coach/library").json()
    assert WHITTY not in [p["pmid"] for p in body["papers"]]
    assert [(p["pmid"], p["title"]) for p in body["removed"]] == [(WHITTY, ONE_PASSAGE["title"])]
    assert saved(saved_library)["removed"] == [WHITTY]
    assert restore(service, WHITTY).status_code == 200
    body = service.get("/coach/library").json()
    assert [p["pmid"] for p in body["papers"]] == [p["pmid"] for p in LIBRARY_INDEX["papers"]] and body["removed"] == []


def test_the_next_coach_request_does_not_search_a_removed_paper(service):
    before = asyncio.run(main.load_index())
    remove(service, WHITTY)
    assert WHITTY in [p["pmid"] for p in before["papers"]]
    assert WHITTY not in [p["pmid"] for p in asyncio.run(main.load_index())["papers"]]
    restore(service, WHITTY)
    assert WHITTY in [p["pmid"] for p in asyncio.run(main.load_index())["papers"]]


def test_a_removed_supporting_paper_does_not_reach_the_workout_card(service):
    remove(service, WHITTY)
    index = asyncio.run(main.load_index())
    assert workout.card_papers([], "", "z2_cadence_drills", index, []) == []
    restore(service, WHITTY)
    index = asyncio.run(main.load_index())
    assert [p["pmid"] for p in workout.card_papers([], "", "z2_cadence_drills", index, [])] == [WHITTY]


def test_the_last_paper_cannot_be_removed(service, monkeypatch, saved_library):
    async def one_paper(http):
        return {**LIBRARY_INDEX, "papers": [ONE_PASSAGE]}
    monkeypatch.setattr(papers, "load_index", one_paper)
    res = remove(service, WHITTY)
    assert (res.status_code, res.json()) == (409, {
        "error": "last_paper", "message": "È l'ultimo paper della libreria: il Coach ne ha bisogno di almeno uno"})
    assert not saved_library.path.exists()


def test_restoring_twice_or_removing_twice_changes_nothing_more(service, saved_library):
    remove(service, WHITTY)
    assert remove(service, WHITTY).status_code == 200 and saved(saved_library)["removed"] == [WHITTY]
    restore(service, WHITTY)
    assert restore(service, WHITTY).status_code == 200 and saved(saved_library)["removed"] == []


def test_a_paper_not_in_the_library_cannot_be_removed(service):
    res = remove(service, "1")
    assert (res.status_code, res.json()["error"]) == (404, "not_found")


def test_a_removed_base_paper_is_restored_not_added_again(service, monkeypatch):
    monkeypatch.setattr(library, "sources", lambda: pytest.fail("PubMed contattato"))
    remove(service, WHITTY)
    res = preview(service, WHITTY)
    assert (res.status_code, res.json()) == (409, {
        "error": "removed_base",
        "message": "È un paper di base che hai tolto: ripristinalo dall'elenco dei paper tolti"})


def test_removals_of_pmids_no_longer_among_the_base_papers_are_ignored(service, saved_library):
    saved_library.path.write_text(json.dumps({"model": search.SEARCH_MODEL, "added": [], "removed": ["1", WHITTY]}))
    body = service.get("/coach/library").json()
    assert [p["pmid"] for p in body["removed"]] == [WHITTY]
    assert len(body["papers"]) == len(LIBRARY_INDEX["papers"]) - 1


def test_a_library_saved_before_removals_reads_as_nothing_removed(service, saved_library):
    saved_library.path.write_text(json.dumps({"model": search.SEARCH_MODEL, "added": []}))
    assert service.get("/coach/library").json()["removed"] == []
    assert remove(service, WHITTY).status_code == 200


def test_an_unreadable_library_refuses_removing_and_restoring(service, saved_library):
    saved_library.path.write_text("{")
    for res in (remove(service, WHITTY), restore(service, WHITTY)):
        assert (res.status_code, res.json()["error"]) == (500, "library_unreadable")
    assert saved_library.path.read_text() == "{"
