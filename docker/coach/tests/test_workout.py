"""Il workout completo dal servizio: per le stesse risposte del modello, lo stesso
risultato del Coach del browser (fixtures/coach_expected.json), con i passaggi dei paper al posto
degli abstract, con Ollama o con un modello cloud; gli eventi passo per passo; il modello scelto in .env; le richieste rifiutate prima
di scaricare corse o chiamare il modello. Ollama, il provider cloud, il modello di ricerca,
Strava e l'indice dei paper sono simulati."""

import asyncio
import dataclasses
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app import cloud, graph, main, ollama, papers, search, workout
from app.errors import CoachError
from app.jscompat import js_str
from app.papers import PaperIndexError
from app.protocols import PROTOCOLS
from app.selection_rules import select
from fakes import (CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, INDEX, FakeCloud, FakeOllama, FakeRides, FakeSearch,
                   fixture_clock, fixture_index)
from fixture_data import NOW_MS, RIDES, activities, case_context, load, scenario, service_query, with_service_sections

CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")
CASE = {c["name"]: c for c in CASES["cases"]}


def allowed_answer(case: dict) -> str:
    """Una risposta che il controllo accetta nella situazione del caso: il primo protocollo che la regola
    di oggi ammette, citando il primo passaggio dato al modello."""
    label = papers.top_papers(INDEX, CASES["queries"][case["query"]])[0]["passages"][0]["label"]
    protocol_id = select(case_context(case), case["duration"])[1][0]
    return json.dumps({"protocolId": protocol_id, "razionale": f"Forma bassa, serve recupero [{label}].",
                       "passaggiUsati": [label]}, ensure_ascii=False)


# La risposta valida del browser sceglie 4×8 Seiler in un giorno di recupero e cita un PMID che il modello
# non ha ricevuto: il controllo la rimanda. Le prove del servizio usano la stessa situazione con una
# risposta che il controllo accetta.
CASE["allowed-answer"] = {**CASE["valid-answer"], "name": "allowed-answer",
                          "answer": allowed_answer(CASE["valid-answer"])}
WORKOUT_CASES = [c for c in CASES["cases"] if "built" in EXPECTED["cases"][c["name"]]]
# Il browser dava Z2 a un protocollo troppo lungo per i minuti, e prendeva un protocollo che la regola di
# oggi non ammette; qui il controllo rimanda la risposta, e con la stessa risposta a ogni bozza si ha il
# workout di una risposta illeggibile nella stessa situazione.
SENT_BACK = {"too-short", "too-short-keeps-source", "valid-answer", "json-in-text", "source-already-cited"}
SAME_ORIGIN = {"Sec-Fetch-Site": "same-origin"}
BODY = {"duration": 60, "timeZone": "Europe/Rome", "profile": RIDES["profiles"]["base"]}


FAKES = {"ollama": FakeOllama, "cloud": FakeCloud}


def fake_model(provider: str, case: dict) -> FakeOllama | FakeCloud:
    return FAKES[provider](case["answer"])


def fake_search(case: dict) -> FakeSearch:
    """Il modello di ricerca restituisce il vettore di query scelto per il caso."""
    return FakeSearch(CASES["queries"][case["query"]])


def request_of(case: dict) -> workout.WorkoutRequest:
    profile = RIDES["profiles"][scenario(case["scenario"])["profile"]]
    return workout.parse_request({"duration": case["duration"], "timeZone": case["timeZone"], "profile": profile})


async def run_case(case: dict, fake: FakeOllama | FakeCloud, finder: FakeSearch | None = None,
                   rides: FakeRides | None = None) -> list:
    events = []
    async with fake.client() as client:
        await graph.run(request_of(case), events.append,
                          rides=rides or FakeRides(activities(scenario(case["scenario"]))),
                          chat=fake.chat, chat_client=client, embed=(finder or fake_search(case)).encode,
                          load_index=fixture_index, now_ms=NOW_MS, spending=main.cloud_spending)
    return events


def workout_of_an_unreadable_answer(case: dict, provider: str) -> dict:
    """Workout, razionale, paper citati e ripiego della stessa situazione con una risposta vuota,
    nella forma di coach_expected.json."""
    unreadable = {**case, "answer": ""}
    result = asyncio.run(run_case(unreadable, fake_model(provider, unreadable)))[-1]
    return {"built": {k: result[k] for k in ("title", "targetWatt", "struttura")}, "razionale": result["razionale"],
            "paperRefs": [p["pmid"] for p in result["paperRefs"]], "fellBack": result["fellBack"]}


def chat_request(fake: FakeOllama | FakeCloud, messages: list) -> None:
    """Al provider arrivano solo richieste di chat, la prima con questi messaggi e le regole di
    ciascuno: per Ollama temperatura 0,2 e 1.000 token; per il cloud chiave, nessuna temperatura e
    4.000 token."""
    if isinstance(fake, FakeOllama):
        (path, body), *_ = fake.requests
        assert {p for p, _ in fake.requests} == {"/api/chat"}
        assert (path, body) == ("/api/chat", {"model": "qwen2.5:7b", "messages": messages, "stream": True,
                                              "options": {"temperature": 0.2, "num_predict": 1000}})
    else:
        (path, headers, body), *_ = fake.requests
        assert {p for p, _, _ in fake.requests} == {"/v1/chat/completions"}
        assert (path, headers["authorization"]) == ("/v1/chat/completions", f"Bearer {CLOUD_KEY}")
        assert body == {"model": CLOUD_MODEL, "messages": messages, "stream": True,
                        "stream_options": {"include_usage": True}, "max_tokens": 4000}


@pytest.mark.parametrize("provider", FAKES)
@pytest.mark.parametrize("case", WORKOUT_CASES, ids=lambda c: c["name"])
def test_model_answer_gives_the_browser_workout(case, provider):
    exp, fake, finder = EXPECTED["cases"][case["name"]], fake_model(provider, case), fake_search(case)
    if case["name"] in SENT_BACK:
        exp = {**exp, **workout_of_an_unreadable_answer(case, provider)}
    result = asyncio.run(run_case(case, fake, finder=finder))[-1]
    assert result["type"] == "result"
    assert {k: result[k] for k in ("title", "targetWatt", "struttura")} == exp["built"]
    assert result["razionale"] == js_str(exp["razionale"])
    assert [p["pmid"] for p in result["paperRefs"]] == exp["paperRefs"]
    # Gli stessi paper del browser: nell'indice di prova i passaggi di un paper hanno il suo vettore.
    assert [p["pmid"] for p in result["retrievedPapers"]] == [p["pmid"] for p in exp["retrieved"]]
    assert result["fellBack"] == exp["fellBack"]
    assert finder.texts == [service_query(exp["query"], case_context(case), case["duration"])]
    # Al provider arriva solo la chat: la query è codificata dal modello di ricerca del servizio.
    system, user = exp["messages"]
    found = papers.top_papers(INDEX, finder.vector)
    chat_request(fake, [{**system, "content": with_service_sections(system["content"], found, case_context(case),
                                                                     case["duration"])}, user])


# Quanto basta a decide: FTP per i watt, forma e quota dura per la regola di oggi e la scelta di ripiego.
# Forma 0 e 20% di lavoro duro: la regola base, che ammette sweet spot, soglia, tempo e cadenze Z2.
CONTEXT = {"ftp": 250, "tsb": 0, "polarizzazione": {"hardPct": 20}}
# Forma +12: la regola "fresco", che ammette Seiler, Rønnestad e Over-Under.
FRESH = {**CONTEXT, "tsb": 12}


def index_with_supporting_paper(protocol_id: str, index: dict = INDEX) -> tuple[dict, str]:
    pmid = PROTOCOLS[protocol_id].source_pmid
    return {**index, "papers": [*index["papers"], {**INDEX["papers"][0], "pmid": pmid}]}, pmid


def test_a_protocol_too_long_for_the_minutes_gets_the_choice_of_the_fallback_rules():
    # Atleta stanco (regola del recupero): Over-Under vuole 64 minuti, ne ha 45.
    tired, cited = {**CONTEXT, "tsb": -18}, INDEX["papers"][0]["pmid"]
    answer = f'{{"protocolId":"over_under","razionale":"Forma ok [PMID:{cited}].","passaggiUsati":["{cited}"]}}'
    result = workout.decide(answer, tired, 45, INDEX, [])
    assert (result["protocolId"], result["fellBack"], result["paperRefs"]) == ("z1_recovery", True, [])
    assert result["razionale"] == "Decisione fallback: TSB -18, polarizzazione hard 20% → Recupero attivo Z1"


@pytest.mark.parametrize("duration, protocol_id, fell_back", [(64, "over_under", False),
                                                              (63, "seiler_4x8", True)])
def test_a_protocol_fits_from_its_minimum_minutes(duration, protocol_id, fell_back):
    result = workout.decide('{"protocolId":"over_under","razionale":"x","passaggiUsati":[]}', FRESH, duration, INDEX,
                            [])
    assert (result["protocolId"], result["fellBack"]) == (protocol_id, fell_back)


def test_a_protocol_too_long_cites_the_supporting_paper_of_the_protocol_given():
    # Con 45 minuti le regole danno Z2: si cita la sua fonte, non quella delle cadenze scelte dal modello.
    index, _ = index_with_supporting_paper("z2_cadence_drills")
    index, given_source = index_with_supporting_paper("z2_endurance", index)
    answer = '{"protocolId":"z2_cadence_drills","razionale":"Cadenza.","passaggiUsati":[]}'
    result = workout.decide(answer, CONTEXT, 45, index, [])
    assert (result["protocolId"], [p["pmid"] for p in result["paperRefs"]]) == ("z2_endurance", [given_source])


def test_a_protocol_that_fits_but_the_rule_of_today_does_not_allow_gets_the_choice_of_the_fallback_rules():
    # La regola base non ammette Rønnestad, anche se entra in 60 minuti.
    result = workout.decide('{"protocolId":"ronnestad_30_15","razionale":"x","passaggiUsati":[]}', CONTEXT, 60, INDEX,
                            [])
    assert (result["protocolId"], result["fellBack"], result["fallbackCause"]) == ("sweet_spot_3x15", True,
                                                                                  "not_allowed")


UNREADABLE = "⚠️ La risposta del modello non era leggibile: il Coach ha scelto con le regole di selezione."
NOT_IN_CATALOG = ("⚠️ Il modello non ha indicato un protocollo del catalogo: il Coach ha scelto con le regole di "
                  "selezione.")


@pytest.mark.parametrize("answer, duration, warning", [
    ("", 60, UNREADABLE),
    ("Penso che oggi sia meglio un lavoro aerobico.", 60, UNREADABLE),
    ('[{"protocolId":"seiler_4x8"}]', 60, UNREADABLE),
    ("42", 60, UNREADABLE),
    ('"seiler_4x8"', 60, UNREADABLE),
    ('{"protocolId":"vo2_extreme","razionale":"x","passaggiUsati":[]}', 60, NOT_IN_CATALOG),
    ('{"razionale":"x","passaggiUsati":[]}', 60, NOT_IN_CATALOG),
    ('{"protocolId":"","razionale":"x"}', 60, NOT_IN_CATALOG),
    ('{"protocolId":null,"razionale":"x"}', 60, NOT_IN_CATALOG),
    ('{"protocolId":"Over_Under","razionale":"x"}', 60, NOT_IN_CATALOG),
    ('{"protocolId":" over_under","razionale":"x"}', 60, NOT_IN_CATALOG),
    ('{"protocolId":"over_under","razionale":"x"}', 45, "⚠️ Il modello ha scelto Over-Under, che richiede almeno 64 "
     "minuti: con 45 minuti il Coach ha scelto con le regole di selezione."),
    ('{"protocolId":"over_under","razionale":"x"}', 30, "⚠️ Il modello ha scelto Over-Under, che richiede almeno 64 "
     "minuti: con 30 minuti il Coach ha scelto con le regole di selezione."),
    ('{"protocolId":"ronnestad_30_15","razionale":"x"}', 40, "⚠️ Il modello ha scelto Rønnestad 30/15, che richiede "
     "almeno 55 minuti: con 40 minuti il Coach ha scelto con le regole di selezione."),
    ('{"protocolId":"tempo_2x20","razionale":"x"}', 59, "⚠️ Il modello ha scelto Tempo 2×20', che richiede almeno 60 "
     "minuti: con 59 minuti il Coach ha scelto con le regole di selezione."),
    ('{"protocolId":"seiler_4x8","razionale":"x","passaggiUsati":[]}', 60, "⚠️ Il modello ha scelto Seiler 4×8' "
     "(FTP/VO2), che non è ammesso oggi: il Coach ha scelto con le regole di selezione."),
    ('{"protocolId":"sweet_spot_3x15","razionale":"x","passaggiUsati":[]}', 60, None),
])
def test_the_warning_says_why_the_fallback_rules_chose(answer, duration, warning):
    assert workout.decide(answer, CONTEXT, duration, INDEX, [])["fallbackWarning"] == warning


def test_supporting_paper_already_cited_by_the_model_is_not_repeated():
    source = found_paper("seiler_4x8", 0.5)
    index, pmid = {**INDEX, "papers": [*INDEX["papers"], source]}, source["pmid"]
    answer = f'{{"protocolId":"seiler_4x8","razionale":"Forma buona [PMID:{pmid}].","passaggiUsati":["{pmid}"]}}'
    result = workout.decide(answer, FRESH, 60, index, [source])
    assert (result["protocolId"], [p["pmid"] for p in result["paperRefs"]]) == ("seiler_4x8", [pmid])


# --- I paper della scheda: i passaggi citati, la licenza, il paper di supporto ------------------

RETRIEVED = papers.top_papers(INDEX, CASES["queries"]["middle"])


def cite(*labels: str, rationale: str = "Forma alta.", protocol: str = "sweet_spot_3x15") -> str:
    return json.dumps({"protocolId": protocol, "razionale": rationale, "passaggiUsati": list(labels)})


def card(result: dict) -> list:
    return [(p["pmid"], [s["label"] for s in p["passages"]]) for p in result["paperRefs"]]


def test_each_cited_paper_is_shown_once_with_its_cited_passages_quoted_in_label_order():
    first, second = RETRIEVED[0], RETRIEVED[1]
    early, late = (s["label"] for s in first["passages"])
    answer = cite(late, late, rationale=f"Forma alta [{late}], come in [PMID:{second['pmid']}] e in [{early}].")
    result = workout.decide(answer, CONTEXT, 60, INDEX, RETRIEVED)
    # Sweet spot è un protocollo di pratica: nessun paper di supporto si aggiunge.
    assert card(result) == [(first["pmid"], [early, late]), (second["pmid"], [])]
    paper = next(p for p in INDEX["papers"] if p["pmid"] == first["pmid"])
    assert result["paperRefs"][0] == {**{k: paper[k] for k in ("pmid", "title", "authors", "year", "journal")},
                                      "passages": [{"label": s["label"], "text": s["text"]} for s in first["passages"]]}


def test_citations_not_given_to_the_model_are_dropped_and_the_protocol_and_rationale_are_kept():
    pmid, given = RETRIEVED[0]["pmid"], {s["label"] for s in RETRIEVED[0]["passages"]}
    in_index = next(p for p in INDEX["papers"] if p["pmid"] == pmid)
    not_given = next(s["label"] for s in in_index["passages"] if s["label"] not in given)
    kept = RETRIEVED[1]["passages"][0]["label"]
    answer = cite(not_given, f"PMID:{pmid} §99", "PMID:99999999 §1", kept, rationale="Forma alta [PMID:99999999].")
    result = workout.decide(answer, CONTEXT, 60, INDEX, RETRIEVED)
    assert (result["protocolId"], result["razionale"], result["fellBack"]) == ("sweet_spot_3x15", "Forma alta "
                                                                               "[PMID:99999999].", False)
    assert card(result) == [(RETRIEVED[1]["pmid"], [kept])]
    assert result["citationsDropped"] == [not_given, f"PMID:{pmid} §99", "PMID:99999999 §1", "PMID:99999999"]


def test_an_answer_breaking_the_rule_and_inventing_citations_gets_the_fallback_rules():
    answer = cite("PMID:99999999 §1", protocol="seiler_4x8")
    result = workout.decide(answer, CONTEXT, 60, INDEX, RETRIEVED)
    assert (result["fellBack"], result["fallbackCause"], result["citationsDropped"]) == (True, "not_allowed", [])


def found_paper(protocol_id: str, *scores: float, **fields) -> dict:
    """Il paper di supporto del protocollo come lo trova la ricerca: i passaggi, con questi punteggi."""
    pmid = PROTOCOLS[protocol_id].source_pmid
    return {"pmid": pmid, "title": "Il paper di supporto", "authors": "Autori", "year": "2011", "journal": None,
            "abstract": "Abstract.", "textUsed": "abstract", "score": max(scores),
            "passages": [{"label": f"PMID:{pmid} §{k}", "text": f"Passaggio {k}.", "score": score}
                         for k, score in enumerate(scores, 1)], **fields}


@pytest.mark.parametrize("answer, ctx, protocol_id", [
    (cite(protocol="seiler_4x8"), FRESH, "seiler_4x8"),
    # Risposta illeggibile, atleta un po' stanco: le regole di ripiego danno Z2, e si aggiunge il suo paper.
    ("", {**CONTEXT, "tsb": -12}, "z2_endurance"),
], ids=["model-choice", "fallback-rules"])
def test_an_uncited_supporting_paper_is_added_quoting_its_closest_passage_when_found(answer, ctx, protocol_id):
    source = found_paper(protocol_id, 0.4, 0.7, 0.5)
    index = {**INDEX, "papers": [*INDEX["papers"], source]}
    result = workout.decide(answer, ctx, 60, index, [*RETRIEVED[:3], source])
    assert (result["protocolId"], card(result)) == (protocol_id, [(source["pmid"], [f"PMID:{source['pmid']} §2"])])
    # La ricerca non l'ha trovato: si aggiunge senza citazione.
    assert card(workout.decide(answer, ctx, 60, index, RETRIEVED)) == [(source["pmid"], [])]


def test_a_quoted_full_text_carries_its_license_and_an_abstract_does_not():
    url = "http://creativecommons.org/licenses/by/4.0/"
    full = found_paper("seiler_4x8", 0.4, 0.7, textUsed="fullText", license="CC BY", licenseUrl=url)
    index = {**INDEX, "papers": [*INDEX["papers"], full]}
    abstract = RETRIEVED[0]
    answer = cite(abstract["passages"][0]["label"], f"PMID:{full['pmid']} §1", protocol="seiler_4x8")
    refs = {p["pmid"]: p for p in workout.decide(answer, FRESH, 60, index, [abstract, full])["paperRefs"]}
    assert (refs[full["pmid"]]["license"], refs[full["pmid"]]["licenseUrl"]) == ("CC BY", url)
    assert "license" not in refs[abstract["pmid"]] and "licenseUrl" not in refs[abstract["pmid"]]
    # Un testo completo senza passaggi citati non ha niente da accreditare.
    [ref] = workout.decide(cite(protocol="seiler_4x8"), FRESH, 60, index, [abstract])["paperRefs"]
    assert (ref["pmid"], ref["passages"]) == (full["pmid"], []) and "license" not in ref


@pytest.mark.parametrize("provider", FAKES)
def test_answer_stopped_at_the_token_limit_uses_the_fallback_rules(provider):
    case = CASE["allowed-answer"]
    fake = fake_model(provider, case)
    # Ollama si è fermato a num_predict (1.000 token), il cloud a max_tokens (4.000).
    fake.done_reason = fake.finish_reason = "length"
    result = asyncio.run(run_case(case, fake))[-1]
    assert result["fellBack"] is True and result["razionale"].startswith("Decisione fallback: TSB ")
    # La risposta era un JSON completo e valido: vale comunque l'interruzione.
    assert result["fallbackWarning"] == ("⚠️ La risposta del modello si è interrotta prima della fine: il Coach ha "
                                         "scelto con le regole di selezione.")
    assert (result["modelRaw"], result["truncated"]) == (case["answer"], True)


@pytest.mark.parametrize("provider", FAKES)
def test_result_carries_everything_the_card_shows(provider):
    case = CASE["allowed-answer"]
    fake = fake_model(provider, case)
    result = asyncio.run(run_case(case, fake))[-1]
    found = papers.top_papers(INDEX, CASES["queries"][case["query"]])
    paper, passage = next(p for p in INDEX["papers"] if p["pmid"] == found[0]["pmid"]), found[0]["passages"][0]
    assert result["paperRefs"][0] == {**{k: paper[k] for k in ("pmid", "title", "authors", "year", "journal")},
                                      "passages": [{"label": passage["label"], "text": passage["text"]}]}
    assert set(result["retrievedPapers"][0]) == {"pmid", "title", "authors", "year", "score", "passages"}
    # Il punteggio di ogni paper trovato è quello del suo passaggio più vicino; i passaggi dati, con etichetta
    # e punteggio, finiscono nei file dei risultati.
    assert [(p["pmid"], p["score"], p["passages"]) for p in result["retrievedPapers"]] == [
        (p["pmid"], max(s["score"] for s in p["passages"]), [{"label": s["label"], "score": s["score"]}
                                                             for s in p["passages"]]) for p in found]
    assert {k: result[k] for k in ("provider", "model", "inputTokens", "outputTokens", "truncated", "modelRaw")} == {
        "provider": provider, "model": fake.chat.model, "inputTokens": 900, "outputTokens": 42,
        "truncated": False, "modelRaw": case["answer"]}
    assert "evalCount" not in result
    assert isinstance(result["seconds"], float)
    assert result["rides"] == {"fromSaved": False, "downloadedAt": NOW_MS, "missingDetails": 0}


@pytest.mark.parametrize("provider", FAKES)
def test_events_name_each_step_and_stream_the_model_text(provider):
    case = CASE["allowed-answer"]
    events = asyncio.run(run_case(case, fake_model(provider, case)))
    names = [e.get("step", e["type"]) for e in events]
    assert names[:6] == ["rides", "details", "details", "context", "papers", "model"]
    assert set(names[6:-1]) == {"token"} and names[-1] == "result"
    assert events[2] == {"type": "step", "step": "details", "message": "Scarico dettagli corse 2/2",
                         "done": 2, "total": 2}
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert len(tokens) > 1 and "".join(tokens) == case["answer"]
    assert events[3]["context"]["oggi"] == "sabato"


@pytest.mark.parametrize("provider", FAKES)
def test_two_tabs_at_the_same_time_are_both_served(provider):
    case = CASE["allowed-answer"]
    fake = fake_model(provider, case)

    async def both():
        return await asyncio.gather(run_case(case, fake), run_case(case, fake))
    first, second = asyncio.run(both())
    assert first[-1]["type"] == second[-1]["type"] == "result"
    assert first[-1]["title"] == second[-1]["title"]
    assert len(fake.requests) == 2


@pytest.mark.parametrize("provider", FAKES)
def test_half_a_surrogate_pair_reaches_the_model_escaped_as_from_the_browser(provider):
    # Un nome di modello incollato può contenere mezza coppia surrogata; JSON.stringify la
    # mandava come \ud835.
    case = CASE["allowed-answer"]
    fake = fake_model(provider, case)
    fake.chat = dataclasses.replace(fake.chat, model="qwen\ud835")
    assert asyncio.run(run_case(case, fake))[-1]["type"] == "result"
    assert fake.requests[-1][-1]["model"] == "qwen\ud835"


# --- Attraverso la rotta HTTP -------------------------------------------------------------

def make_service(monkeypatch, env: dict) -> SimpleNamespace:
    """Il servizio Coach con .env, Strava, indice, modello di ricerca e i due provider finti."""
    case = CASE["allowed-answer"]
    fakes = SimpleNamespace(ollama=FakeOllama(case["answer"]), cloud=FakeCloud(case["answer"]),
                            search=fake_search(case), rides=FakeRides(RIDES["activities"]))
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(main, "rides", fakes.rides)
    fixture_clock(monkeypatch)
    monkeypatch.setattr(main, "load_index", fixture_index)
    monkeypatch.setattr(ollama, "client", fakes.ollama.client)
    monkeypatch.setattr(cloud, "client", fakes.cloud.client)
    monkeypatch.setattr(search, "encode", fakes.search.encode)
    fakes.client = TestClient(main.app)
    return fakes


@pytest.fixture
def service(monkeypatch):
    return make_service(monkeypatch, {})



def post(service, body, headers=SAME_ORIGIN):
    if isinstance(body, dict):
        return service.client.post("/coach/workout", json=body, headers=headers)
    return service.client.post("/coach/workout", content=body, headers=headers)


def events_of(res) -> list:
    return [json.loads(line) for line in res.text.splitlines()]


def test_generate_streams_the_workout(service):
    res = post(service, BODY)
    assert res.status_code == 200 and res.headers["content-type"] == "application/x-ndjson"
    result = events_of(res)[-1]
    assert result["type"] == "result"
    assert (result["protocolId"], result["fellBack"]) == (json.loads(CASE["allowed-answer"]["answer"])["protocolId"],
                                                          False)


def test_empty_profile_values_use_the_defaults(service):
    res = post(service, {**BODY, "profile": RIDES["profiles"]["noLthr"]})
    assert events_of(res)[-1]["type"] == "result"
    res = post(service, {**BODY, "profile": {"ftp": 250}})
    assert events_of(res)[-1]["type"] == "result"


@pytest.mark.parametrize("duration", [30, 240])
def test_the_shortest_and_longest_durations_are_accepted(service, duration):
    assert events_of(post(service, {**BODY, "duration": duration}))[-1]["type"] == "result"


def with_profile(**values) -> dict:
    return {**BODY, "profile": {**BODY["profile"], **values}}


@pytest.mark.parametrize("body,headers,status,code,message", [
    ({**BODY, "duration": 241}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere tra 30 e 240 minuti"),
    ({**BODY, "duration": 29}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere tra 30 e 240 minuti"),
    # La durata che manda una scheda aperta prima dell'aggiornamento.
    ({**BODY, "duration": 20}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere tra 30 e 240 minuti"),
    ({**BODY, "duration": 45.5}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere un numero intero di minuti"),
    ({**BODY, "duration": "60"}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere un numero intero di minuti"),
    (with_profile(weight=-70), SAME_ORIGIN, 400, "invalid_profile", "Valore non valido per peso: serve un numero maggiore di zero"),
    (with_profile(lthr="165"), SAME_ORIGIN, 400, "invalid_profile", "Valore non valido per FC soglia: serve un numero maggiore di zero"),
    (with_profile(weeklyDays=True), SAME_ORIGIN, 400, "invalid_profile", "Valore non valido per giorni settimanali: serve un numero maggiore di zero"),
    ({**BODY, "profile": RIDES["profiles"]["noFtp"]}, SAME_ORIGIN, 400, "no_ftp", "FTP non disponibile"),
    ({**BODY, "timeZone": "Marte/Olympus"}, SAME_ORIGIN, 400, "invalid_time_zone", "Fuso orario del browser non valido"),
    (b"{non json", SAME_ORIGIN, 400, "invalid_request", "Richiesta non valida"),
    (b"[" * 100_000 + b"]" * 100_000, SAME_ORIGIN, 400, "invalid_request", "Richiesta non valida"),
    (json.dumps(BODY).replace('"duration": 60', '"duration": 1' + "0" * 400).encode(), SAME_ORIGIN, 400,
     "invalid_duration", "La durata deve essere un numero intero di minuti"),
    (BODY, {"Sec-Fetch-Site": "cross-site"}, 403, "forbidden", "Richiesta rifiutata: arriva da un altro sito"),
])
def test_refused_requests_download_nothing_and_call_no_model(service, body, headers, status, code, message):
    res = post(service, body, headers)
    assert (res.status_code, res.json()) == (status, {"error": code, "message": message})
    assert service.rides.calls == 0 and service.ollama.requests == [] and service.search.texts == []


def test_model_sent_by_a_tab_opened_before_the_update_is_ignored(service):
    result = events_of(post(service, {**BODY, "model": "x" * 101}))[-1]
    assert (result["type"], result["provider"], result["model"]) == ("result", "ollama", "qwen2.5:7b")
    assert service.ollama.requests[-1][1]["model"] == "qwen2.5:7b"


def test_each_request_uses_the_chat_model_named_in_env(service, monkeypatch):
    # Un .env vecchio, con il solo OLLAMA_CHAT_MODEL: basta quello.
    monkeypatch.setenv("OLLAMA_CHAT_MODEL", "qwen2.5:3b")
    assert events_of(post(service, BODY))[-1]["model"] == "qwen2.5:3b"
    monkeypatch.setenv("OLLAMA_CHAT_MODEL", "llama3:8b")
    assert events_of(post(service, BODY))[-1]["model"] == "llama3:8b"
    assert [body["model"] for _, body in service.ollama.requests] == ["qwen2.5:3b", "llama3:8b"]


@pytest.mark.parametrize("env,message", [
    ({"COACH_PROVIDER": "cloud"}, "Con COACH_PROVIDER=cloud manca in .env: CLOUD_URL, CLOUD_API_KEY, CLOUD_MODEL, "
                                  "CLOUD_PRICE_IN, CLOUD_PRICE_OUT, CLOUD_SPENDING_LIMIT"),
    ({**CLOUD_ENV, "CLOUD_SPENDING_LIMIT": ""}, "Con COACH_PROVIDER=cloud manca in .env: CLOUD_SPENDING_LIMIT"),
    ({**CLOUD_ENV, "CLOUD_PRICE_OUT": "0,5"},
     'CLOUD_PRICE_OUT in .env vale "0,5": serve un numero di dollari, 0 o più, con il punto per i decimali'),
    ({**CLOUD_ENV, "CLOUD_API_KEY": " "}, "Con COACH_PROVIDER=cloud manca in .env: CLOUD_API_KEY"),
    ({**CLOUD_ENV, "CLOUD_URL": ""}, "Con COACH_PROVIDER=cloud manca in .env: CLOUD_URL"),
    ({"COACH_PROVIDER": "claud"}, 'COACH_PROVIDER in .env vale "claud": i valori ammessi sono ollama e cloud'),
    ({"OLLAMA_CHAT_MODEL": "x" * 101},
     "Il nome del modello deve avere al massimo 100 caratteri (OLLAMA_CHAT_MODEL in .env)"),
    ({**CLOUD_ENV, "CLOUD_MODEL": "x" * 101},
     "Il nome del modello deve avere al massimo 100 caratteri (CLOUD_MODEL in .env)"),
], ids=["cloud-empty", "no-limit", "comma-price", "no-key", "no-url", "misspelled", "long-ollama-model", "long-cloud-model"])
def test_wrong_env_refuses_the_request_before_any_call(monkeypatch, env, message):
    service = make_service(monkeypatch, env)
    res = post(service, BODY)
    assert (res.status_code, res.json()) == (500, {"error": "invalid_settings", "message": message})
    assert service.rides.calls == 0 and service.search.texts == []
    assert service.ollama.requests == [] and service.cloud.requests == []


def test_browser_reference_also_stopped_before_any_call_without_ftp():
    assert EXPECTED["cases"]["no-ftp"] == {"noFtp": True, "fetches": 0}


async def missing_index() -> dict:
    raise PaperIndexError("papers_index.json non trovato (HTTP 404). Ripristinalo da git: git restore papers_index.json")


def not_connected(service):
    service.rides.error = CoachError(401, "not_connected", "Strava non collegato")


def bug(service):
    service.rides.error = RuntimeError("bug")


BREAKAGES = {
    "chat model missing": (lambda s: setattr(s.ollama, "status", 404), "model",
                           f"Modello {CASES['model']} non installato in Ollama. Scaricalo con: "
                           + ollama.pull_command(CASES["model"])),
    "chat error": (lambda s: setattr(s.ollama, "status", 500), "model",
                   'Chat HTTP 500: {"error":"qualcosa non va"}'),
    "ollama down": (lambda s: setattr(s.ollama, "down", True), "model",
                    f"Ollama non raggiungibile su {ollama.OLLAMA_URL}"),
    "strava not connected": (not_connected, "not_connected", "Strava non collegato"),
    "bug": (bug, "internal", "Errore interno del Coach: dettagli con docker compose logs coach"),
}


@pytest.mark.parametrize("name", list(BREAKAGES))
def test_failures_during_the_stream_end_with_an_error_event(service, name):
    breakage, code, message = BREAKAGES[name]
    breakage(service)
    assert events_of(post(service, BODY))[-1] == {"type": "error", "error": code, "message": message}


def test_missing_paper_index_says_how_to_restore_it(service, monkeypatch):
    monkeypatch.setattr(main, "load_index", missing_index)
    assert events_of(post(service, BODY))[-1] == {
        "type": "error", "error": "retrieval",
        "message": "papers_index.json non trovato (HTTP 404). Ripristinalo da git: git restore papers_index.json"}
    assert service.ollama.requests == [] and service.search.texts == []


def test_index_of_another_search_model_gives_the_command_that_reencodes_it(service, monkeypatch):
    async def old_index() -> dict:
        return papers.check_index({**INDEX, "model": "nomic-embed-text"})
    monkeypatch.setattr(main, "load_index", old_index)
    assert events_of(post(service, BODY))[-1] == {
        "type": "error", "error": "retrieval",
        "message": "papers_index.json è codificato con nomic-embed-text, non con il modello di ricerca del Coach "
                   "(BAAI/bge-small-en-v1.5). Ricodificalo con: "
                   "docker compose run --rm coach-tools python -m app.build_index --reencode"}
    assert service.ollama.requests == [] and service.search.texts == []
