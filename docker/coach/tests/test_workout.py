"""Il workout completo dal servizio: per le stesse risposte del modello, lo stesso
risultato del Coach del browser (fixtures/coach_expected.json); gli eventi passo per
passo; le richieste rifiutate prima di scaricare corse o chiamare il modello.
Ollama, il modello di ricerca, Strava e l'indice dei paper sono simulati."""

import asyncio
import dataclasses
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main, ollama, papers, search, workout
from app.errors import CoachError
from app.jscompat import js_str
from app.papers import PaperIndexError
from fakes import INDEX, FakeRides, FakeSearch, fixture_index
from fixture_data import NOW_MS, RIDES, activities, load, scenario

CASES = load("coach_cases.json")
EXPECTED = load("coach_expected.json")
CASE = {c["name"]: c for c in CASES["cases"]}
WORKOUT_CASES = [c for c in CASES["cases"] if "built" in EXPECTED["cases"][c["name"]]]
SAME_ORIGIN = {"Sec-Fetch-Site": "same-origin"}
BODY = {"duration": 60, "model": CASES["model"], "timeZone": "Europe/Rome", "profile": RIDES["profiles"]["base"]}


class FakeOllama:
    """Risponde come Ollama: la risposta del modello a pezzi di 7 caratteri, poi l'ultimo
    pezzo con done e il numero di token."""

    def __init__(self, answer: str):
        self.answer = answer
        self.done_reason = "stop"
        self.requests = []
        self.chat_status = 200
        self.down = False
        self.installed = [CASES["model"]]

    def handle(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("ollama spento")
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": m} for m in self.installed]})
        body = json.loads(request.content)
        self.requests.append((request.url.path, body))
        if self.chat_status != 200:
            return httpx.Response(self.chat_status, json={"error": "qualcosa non va"})
        pieces = [self.answer[i:i + 7] for i in range(0, len(self.answer), 7)]
        lines = [{"message": {"role": "assistant", "content": p}, "done": False} for p in pieces]
        lines.append({"message": {"role": "assistant", "content": ""}, "done": True,
                      "done_reason": self.done_reason, "eval_count": 42})
        return httpx.Response(200, content="".join(json.dumps(x) + "\n" for x in lines).encode())

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url="http://ollama:11434", transport=httpx.MockTransport(self.handle))


def fake_ollama(case: dict) -> FakeOllama:
    return FakeOllama(case["answer"])


def fake_search(case: dict) -> FakeSearch:
    """Il modello di ricerca restituisce il vettore di query scelto per il caso."""
    return FakeSearch(CASES["queries"][case["query"]])


def request_of(case: dict) -> workout.WorkoutRequest:
    profile = RIDES["profiles"][scenario(case["scenario"])["profile"]]
    return workout.parse_request({"duration": case["duration"], "model": CASES["model"],
                                  "timeZone": case["timeZone"], "profile": profile})


async def run_case(case: dict, fake: FakeOllama, req: workout.WorkoutRequest | None = None,
                   finder: FakeSearch | None = None) -> list:
    events = []
    async with fake.client() as client:
        await workout.run(req or request_of(case), events.append,
                          rides=FakeRides(activities(scenario(case["scenario"]))),
                          ollama_client=client, embed=(finder or fake_search(case)).encode,
                          load_index=fixture_index, now_ms=NOW_MS)
    return events


@pytest.mark.parametrize("case", WORKOUT_CASES, ids=lambda c: c["name"])
def test_model_answer_gives_the_browser_workout(case):
    exp, fake, finder = EXPECTED["cases"][case["name"]], fake_ollama(case), fake_search(case)
    result = asyncio.run(run_case(case, fake, finder=finder))[-1]
    assert result["type"] == "result"
    assert {k: result[k] for k in ("title", "targetWatt", "struttura")} == exp["built"]
    assert result["razionale"] == js_str(exp["razionale"])
    assert [p["pmid"] for p in result["paperRefs"]] == exp["paperRefs"]
    assert [{"pmid": p["pmid"], "score": p["score"]} for p in result["retrievedPapers"]] == exp["retrieved"]
    assert result["fellBack"] == exp["fellBack"]
    assert finder.texts == [exp["query"]]
    # A Ollama arriva solo la chat: la query è codificata dal modello di ricerca del servizio.
    [(chat_path, chat)] = fake.requests
    assert (chat_path, chat["model"], chat["messages"]) == ("/api/chat", exp["model"], exp["messages"])
    assert (chat["stream"], chat["options"]) == (True, {"temperature": 0.2, "num_predict": 1000})


def test_answer_stopped_at_1000_tokens_uses_the_fallback_rules():
    case = CASE["valid-answer"]
    fake = fake_ollama(case)
    fake.done_reason = "length"   # Ollama si è fermato a num_predict
    result = asyncio.run(run_case(case, fake))[-1]
    assert result["fellBack"] is True and result["razionale"].startswith("Decisione fallback: TSB ")
    assert result["modelRaw"] == case["answer"]


def test_result_carries_everything_the_card_shows():
    case = CASE["valid-answer"]
    result = asyncio.run(run_case(case, fake_ollama(case)))[-1]
    paper = next(p for p in INDEX["papers"] if p["pmid"] == "20861519")
    assert result["paperRefs"][0] == {k: paper[k] for k in ("pmid", "title", "authors", "year", "journal")}
    assert set(result["retrievedPapers"][0]) == {"pmid", "title", "authors", "year", "score"}
    assert (result["model"], result["evalCount"], result["modelRaw"]) == (CASES["model"], 42, case["answer"])
    assert isinstance(result["seconds"], float)
    assert result["rides"] == {"fromSaved": False, "downloadedAt": NOW_MS, "missingDetails": 0}


def test_events_name_each_step_and_stream_the_model_text():
    case = CASE["valid-answer"]
    events = asyncio.run(run_case(case, fake_ollama(case)))
    names = [e.get("step", e["type"]) for e in events]
    assert names[:6] == ["rides", "details", "details", "context", "papers", "model"]
    assert set(names[6:-1]) == {"token"} and names[-1] == "result"
    assert events[2] == {"type": "step", "step": "details", "message": "Scarico dettagli corse 2/2",
                         "done": 2, "total": 2}
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert len(tokens) > 1 and "".join(tokens) == case["answer"]
    assert events[3]["context"]["oggi"] == "sabato"


def test_two_tabs_at_the_same_time_are_both_served():
    case = CASE["valid-answer"]
    fake = fake_ollama(case)

    async def both():
        return await asyncio.gather(run_case(case, fake), run_case(case, fake))
    first, second = asyncio.run(both())
    assert first[-1]["type"] == second[-1]["type"] == "result"
    assert first[-1]["title"] == second[-1]["title"]


def test_half_a_surrogate_pair_reaches_the_model_escaped_as_from_the_browser():
    # Un abstract tagliato a 1200 unità UTF-16 in mezzo a un carattere oltre U+FFFF lascia
    # mezza coppia surrogata nel prompt; JSON.stringify la mandava come \ud835.
    case = CASE["valid-answer"]
    fake = fake_ollama(case)
    req = dataclasses.replace(request_of(case), model="qwen\ud835")
    assert asyncio.run(run_case(case, fake, req))[-1]["type"] == "result"
    assert fake.requests[-1][1]["model"] == "qwen\ud835"


# --- Attraverso la rotta HTTP -------------------------------------------------------------

@pytest.fixture
def service(monkeypatch):
    case = CASE["valid-answer"]
    fake, finder, rides = fake_ollama(case), fake_search(case), FakeRides(RIDES["activities"])
    monkeypatch.setattr(main, "rides", rides)
    monkeypatch.setattr(main, "load_index", fixture_index)
    monkeypatch.setattr(ollama, "client", fake.client)
    monkeypatch.setattr(search, "encode", finder.encode)
    return SimpleNamespace(client=TestClient(main.app), ollama=fake, search=finder, rides=rides)


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


def with_profile(**values) -> dict:
    return {**BODY, "profile": {**BODY["profile"], **values}}


@pytest.mark.parametrize("body,headers,status,code,message", [
    ({**BODY, "duration": 241}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere tra 20 e 240 minuti"),
    ({**BODY, "duration": 19}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere tra 20 e 240 minuti"),
    ({**BODY, "duration": 45.5}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere un numero intero di minuti"),
    ({**BODY, "duration": "60"}, SAME_ORIGIN, 400, "invalid_duration", "La durata deve essere un numero intero di minuti"),
    (with_profile(weight=-70), SAME_ORIGIN, 400, "invalid_profile", "Valore non valido per peso: serve un numero maggiore di zero"),
    (with_profile(lthr="165"), SAME_ORIGIN, 400, "invalid_profile", "Valore non valido per FC soglia: serve un numero maggiore di zero"),
    (with_profile(weeklyDays=True), SAME_ORIGIN, 400, "invalid_profile", "Valore non valido per giorni settimanali: serve un numero maggiore di zero"),
    ({**BODY, "profile": RIDES["profiles"]["noFtp"]}, SAME_ORIGIN, 400, "no_ftp", "FTP non disponibile"),
    ({**BODY, "timeZone": "Marte/Olympus"}, SAME_ORIGIN, 400, "invalid_time_zone", "Fuso orario del browser non valido"),
    ({**BODY, "model": "x" * 101}, SAME_ORIGIN, 400, "invalid_model", "Il nome del modello deve avere al massimo 100 caratteri"),
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


def test_browser_reference_also_stopped_before_any_call_without_ftp():
    assert EXPECTED["cases"]["no-ftp"] == {"noFtp": True, "fetches": 0}


async def missing_index() -> dict:
    raise PaperIndexError("papers_index.json non trovato (HTTP 404). Ripristinalo da git: git restore papers_index.json")


def not_connected(service):
    service.rides.error = CoachError(401, "not_connected", "Strava non collegato")


def bug(service):
    service.rides.error = RuntimeError("bug")


BREAKAGES = {
    "chat model missing": (lambda s: setattr(s.ollama, "chat_status", 404), "model",
                           f"Modello {CASES['model']} non installato in Ollama. Scaricalo con: "
                           + ollama.pull_command(CASES["model"])),
    "chat error": (lambda s: setattr(s.ollama, "chat_status", 500), "model",
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


# --- Ping Ollama --------------------------------------------------------------------------

def test_ping_with_every_model_installed(service):
    res = service.client.get("/coach/ping", params={"model": CASES["model"]})
    assert (res.status_code, res.json()) == (200, {"models": service.ollama.installed, "missing": []})


@pytest.mark.parametrize("url,pull", [("http://ollama:11434", "docker compose exec ollama ollama pull"),
                                      ("http://host.docker.internal:11434", "ollama pull")])
def test_ping_names_the_missing_chat_model_and_the_command_to_download_it(service, monkeypatch, url, pull):
    monkeypatch.setattr(ollama, "OLLAMA_URL", url)
    service.ollama.installed = ["llama3:8b"]
    res = service.client.get("/coach/ping", params={"model": "qwen2.5:7b"})
    assert (res.status_code, res.json()) == (200, {"models": ["llama3:8b"], "missing": [
        {"model": "qwen2.5:7b", "command": f"{pull} qwen2.5:7b"}]})


def test_ping_without_ollama(service, monkeypatch):
    monkeypatch.setattr(ollama, "OLLAMA_URL", "http://ollama:11434")
    service.ollama.down = True
    res = service.client.get("/coach/ping")
    assert (res.status_code, res.json()) == (503, {
        "error": "ollama_unreachable", "message": "Coach ok, Ollama non raggiungibile su http://ollama:11434"})
