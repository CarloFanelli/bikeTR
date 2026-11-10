"""Libreria: i paper che il Coach cerca, con cosa ne dipende, e i passaggi di un paper. L'indice è
quello dei test, con un paper a testo completo e il paper di supporto degli esercizi di cadenza
aggiunti per i casi che l'indice dei test non ha."""

import pytest

from fakes import INDEX
from test_workout import make_service

WHITTY = "27175601"
SEILER_2010 = "20861519"
SEILER_2013 = "21812820"
FULL_TEXT = {**INDEX["papers"][0], "pmid": "24550842", "textUsed": "fullText", "license": "CC BY",
             "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
             "passages": [{**s, "label": f"PMID:24550842 §{k}"} for k, s in enumerate(INDEX["papers"][0]["passages"], 1)]}
ONE_PASSAGE = {**INDEX["papers"][1], "pmid": WHITTY, "passages": INDEX["papers"][1]["passages"][:1]}
LIBRARY_INDEX = {**INDEX, "papers": [*INDEX["papers"], FULL_TEXT, ONE_PASSAGE,
                                     {**INDEX["papers"][2], "pmid": SEILER_2013}]}


@pytest.fixture
def service(monkeypatch):
    async def library_index():
        return LIBRARY_INDEX
    fakes = make_service(monkeypatch, {})
    monkeypatch.setattr("app.main.load_index", library_index)
    return fakes


def listed(service) -> dict:
    res = service.client.get("/coach/library")
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
    from app import protocols
    monkeypatch.setitem(protocols.PROTOCOLS, "z2_endurance",
                        protocols.Protocol("Z2 Aerobico", SEILER_2010, protocols.z2_endurance))
    supports = listed(service)[SEILER_2010]["supports"]
    assert supports["workouts"] == ["Z2 Aerobico"] and len(supports["rules"]) == 1


def test_opening_a_paper_gives_its_passages_in_reading_order_without_vectors(service):
    res = service.client.get("/coach/library/24550842")
    assert res.status_code == 200
    assert res.json() == {"pmid": "24550842", "passages": [
        {"label": f"PMID:24550842 §{k}", "text": s["text"]} for k, s in enumerate(FULL_TEXT["passages"], 1)]}


def test_a_paper_with_one_passage_opens_with_it(service):
    passages = service.client.get(f"/coach/library/{WHITTY}").json()["passages"]
    assert passages == [{"label": ONE_PASSAGE["passages"][0]["label"], "text": ONE_PASSAGE["passages"][0]["text"]}]


def test_a_paper_not_in_the_library_is_not_found(service):
    res = service.client.get("/coach/library/1")
    assert (res.status_code, res.json()["error"]) == (404, "not_found")
    assert res.json()["message"] == "Il paper PMID 1 non è in libreria"


def test_an_unusable_index_is_refused_with_its_message(service, monkeypatch):
    from app import papers

    async def broken():
        raise papers.PaperIndexError(f"papers_index.json illeggibile. {papers.RESTORE}")
    monkeypatch.setattr("app.main.load_index", broken)
    for path in ("/coach/library", f"/coach/library/{WHITTY}"):
        res = service.client.get(path)
        assert (res.status_code, res.json()) == (502, {
            "error": "retrieval", "message": f"papers_index.json illeggibile. {papers.RESTORE}"})
