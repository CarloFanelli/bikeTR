"""Il workout completo dal servizio: per le stesse risposte del modello, lo stesso
risultato del Coach del browser (fixtures/coach_expected.json), con Ollama o con un modello
cloud; gli eventi passo per passo; il modello scelto in .env; le richieste rifiutate prima
di scaricare corse o chiamare il modello. Ollama, il provider cloud, il modello di ricerca,
Strava e l'indice dei paper sono simulati."""

import asyncio
import dataclasses
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app import cloud, main, ollama, papers, search, workout
from app.errors import CoachError
from app.jscompat import js_str
from app.papers import PaperIndexError
from app.protocols import PROTOCOLS
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, INDEX, FakeCloud, FakeOllama, FakeRides, FakeSearch, fixture_index
from fixture_data import NOW_MS, RIDES, activities, load, scenario

CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")
CASE = {c["name"]: c for c in CASES["cases"]}
WORKOUT_CASES = [c for c in CASES["cases"] if "built" in EXPECTED["cases"][c["name"]]]
# Il browser aggiungeva ai paper citati la fonte del protocollo, che qui era un paper su altro
# (23197584, 20861519); il paper di supporto che la sostituisce non è nell'indice di prova.
SUPPORTING_PAPER_REFS = {"too-short-keeps-source": [], "json-in-text": []}
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


async def run_case(case: dict, fake: FakeOllama | FakeCloud, finder: FakeSearch | None = None) -> list:
    events = []
    async with fake.client() as client:
        await workout.run(request_of(case), events.append,
                          rides=FakeRides(activities(scenario(case["scenario"]))),
                          chat=fake.chat, chat_client=client, embed=(finder or fake_search(case)).encode,
                          load_index=fixture_index, now_ms=NOW_MS, spending=main.cloud_spending)
    return events


def chat_request(fake: FakeOllama | FakeCloud, messages: list) -> None:
    """L'unica richiesta arrivata al provider è la chat, con le regole di ciascuno: per Ollama
    temperatura 0,2 e 1.000 token; per il cloud chiave, nessuna temperatura e 4.000 token."""
    if isinstance(fake, FakeOllama):
        [(path, body)] = fake.requests
        assert (path, body) == ("/api/chat", {"model": "qwen2.5:7b", "messages": messages, "stream": True,
                                              "options": {"temperature": 0.2, "num_predict": 1000}})
    else:
        [(path, headers, body)] = fake.requests
        assert (path, headers["authorization"]) == ("/v1/chat/completions", f"Bearer {CLOUD_KEY}")
        assert body == {"model": CLOUD_MODEL, "messages": messages, "stream": True,
                        "stream_options": {"include_usage": True}, "max_tokens": 4000}


@pytest.mark.parametrize("provider", FAKES)
@pytest.mark.parametrize("case", WORKOUT_CASES, ids=lambda c: c["name"])
def test_model_answer_gives_the_browser_workout(case, provider):
    exp, fake, finder = EXPECTED["cases"][case["name"]], fake_model(provider, case), fake_search(case)
    result = asyncio.run(run_case(case, fake, finder=finder))[-1]
    assert result["type"] == "result"
    assert {k: result[k] for k in ("title", "targetWatt", "struttura")} == exp["built"]
    assert result["razionale"] == js_str(exp["razionale"])
    assert [p["pmid"] for p in result["paperRefs"]] == SUPPORTING_PAPER_REFS.get(case["name"], exp["paperRefs"])
    assert [{"pmid": p["pmid"], "score": p["score"]} for p in result["retrievedPapers"]] == exp["retrieved"]
    assert result["fellBack"] == exp["fellBack"]
    assert finder.texts == [exp["query"]]
    # Al provider arriva solo la chat: la query è codificata dal modello di ricerca del servizio.
    chat_request(fake, exp["messages"])


# Quanto basta a decide: FTP per i watt, forma e quota dura per la scelta di ripiego.
CONTEXT = {"ftp": 250, "tsb": 0, "polarizzazione": {"hardPct": 20}}


def index_with_supporting_paper(protocol_id: str) -> tuple[dict, str]:
    pmid = PROTOCOLS[protocol_id].source_pmid
    return {**INDEX, "papers": [*INDEX["papers"], {**INDEX["papers"][0], "pmid": pmid}]}, pmid


def test_too_short_duration_still_cites_the_supporting_paper_of_the_chosen_protocol():
    index, pmid = index_with_supporting_paper("z2_cadence_drills")
    answer = '{"protocolId":"z2_cadence_drills","razionale":"Cadenza.","paperUsati":[]}'
    result = workout.decide(answer, CONTEXT, 45, index)
    assert (result["protocolId"], [p["pmid"] for p in result["paperRefs"]]) == ("z2_endurance", [pmid])


def test_supporting_paper_already_cited_by_the_model_is_not_repeated():
    index, pmid = index_with_supporting_paper("seiler_4x8")
    answer = f'{{"protocolId":"seiler_4x8","razionale":"Forma buona [PMID:{pmid}].","paperUsati":["{pmid}"]}}'
    result = workout.decide(answer, CONTEXT, 60, index)
    assert (result["protocolId"], [p["pmid"] for p in result["paperRefs"]]) == ("seiler_4x8", [pmid])


@pytest.mark.parametrize("provider", FAKES)
def test_answer_stopped_at_the_token_limit_uses_the_fallback_rules(provider):
    case = CASE["valid-answer"]
    fake = fake_model(provider, case)
    # Ollama si è fermato a num_predict (1.000 token), il cloud a max_tokens (4.000).
    fake.done_reason = fake.finish_reason = "length"
    result = asyncio.run(run_case(case, fake))[-1]
    assert result["fellBack"] is True and result["razionale"].startswith("Decisione fallback: TSB ")
    assert (result["modelRaw"], result["truncated"]) == (case["answer"], True)


@pytest.mark.parametrize("provider", FAKES)
def test_result_carries_everything_the_card_shows(provider):
    case = CASE["valid-answer"]
    fake = fake_model(provider, case)
    result = asyncio.run(run_case(case, fake))[-1]
    paper = next(p for p in INDEX["papers"] if p["pmid"] == "20861519")
    assert result["paperRefs"][0] == {k: paper[k] for k in ("pmid", "title", "authors", "year", "journal")}
    assert set(result["retrievedPapers"][0]) == {"pmid", "title", "authors", "year", "score"}
    assert {k: result[k] for k in ("provider", "model", "inputTokens", "outputTokens", "truncated", "modelRaw")} == {
        "provider": provider, "model": fake.chat.model, "inputTokens": 900, "outputTokens": 42,
        "truncated": False, "modelRaw": case["answer"]}
    assert "evalCount" not in result
    assert isinstance(result["seconds"], float)
    assert result["rides"] == {"fromSaved": False, "downloadedAt": NOW_MS, "missingDetails": 0}


@pytest.mark.parametrize("provider", FAKES)
def test_events_name_each_step_and_stream_the_model_text(provider):
    case = CASE["valid-answer"]
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
    case = CASE["valid-answer"]
    fake = fake_model(provider, case)

    async def both():
        return await asyncio.gather(run_case(case, fake), run_case(case, fake))
    first, second = asyncio.run(both())
    assert first[-1]["type"] == second[-1]["type"] == "result"
    assert first[-1]["title"] == second[-1]["title"]
    assert len(fake.requests) == 2


@pytest.mark.parametrize("provider", FAKES)
def test_half_a_surrogate_pair_reaches_the_model_escaped_as_from_the_browser(provider):
    # Un abstract tagliato a 1200 unità UTF-16 in mezzo a un carattere oltre U+FFFF lascia
    # mezza coppia surrogata nel prompt; JSON.stringify la mandava come \ud835.
    case = CASE["valid-answer"]
    fake = fake_model(provider, case)
    fake.chat = dataclasses.replace(fake.chat, model="qwen\ud835")
    assert asyncio.run(run_case(case, fake))[-1]["type"] == "result"
    assert fake.requests[-1][-1]["model"] == "qwen\ud835"


# --- Attraverso la rotta HTTP -------------------------------------------------------------

def make_service(monkeypatch, env: dict) -> SimpleNamespace:
    """Il servizio Coach con .env, Strava, indice, modello di ricerca e i due provider finti."""
    case = CASE["valid-answer"]
    fakes = SimpleNamespace(ollama=FakeOllama(case["answer"]), cloud=FakeCloud(case["answer"]),
                            search=fake_search(case), rides=FakeRides(RIDES["activities"]))
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(main, "rides", fakes.rides)
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
    assert result["title"] == EXPECTED["cases"]["valid-answer"]["built"]["title"]


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
