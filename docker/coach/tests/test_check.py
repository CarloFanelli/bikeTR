"""Impostazioni: quale modello chat usa il Coach (con spesa e tetto per il cloud) e il
controllo della connessione che sostituisce "Ping Ollama": il provider risponde, accetta la
chiave e ha il modello? Nessuna domanda al modello, nessun token speso. Ollama e il provider
cloud sono simulati."""

import httpx
import pytest

from app import ollama
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, CLOUD_URL
from test_workout import make_service

NOT_REACHABLE = f"Provider cloud non raggiungibile su {CLOUD_URL}"


@pytest.fixture
def service(monkeypatch):
    return make_service(monkeypatch, {})


@pytest.fixture
def cloud_service(monkeypatch):
    return make_service(monkeypatch, CLOUD_ENV)


def status(service):
    return service.client.get("/coach/status")


def check(service):
    return service.client.get("/coach/ping")


# --- Il modello in uso --------------------------------------------------------------------

def test_status_names_the_ollama_model_without_spending(service):
    res = status(service)
    assert (res.status_code, res.json()) == (200, {"provider": "ollama", "model": "qwen2.5:7b"})


def test_status_of_a_cloud_model_adds_total_spent_and_limit(cloud_service, cloud_spending):
    assert status(cloud_service).json() == {"provider": "cloud", "model": CLOUD_MODEL, "spent": 0, "limit": 1}
    cloud_spending.add(0.25)
    assert status(cloud_service).json()["spent"] == 0.25


def test_status_never_calls_the_provider(cloud_service):
    # Impostazioni e il Coach lo chiedono a ogni apertura: niente tempo né quota del provider.
    cloud_service.cloud.down = True
    assert status(cloud_service).status_code == 200
    assert cloud_service.cloud.requests == [] and cloud_service.ollama.requests == []


def test_status_with_a_wrong_env_says_which_value(monkeypatch):
    res = status(make_service(monkeypatch, {**CLOUD_ENV, "CLOUD_PRICE_IN": ""}))
    assert (res.status_code, res.json()) == (500, {
        "error": "invalid_settings", "message": "Con COACH_PROVIDER=cloud manca in .env: CLOUD_PRICE_IN"})


def test_status_with_an_unreadable_total_says_so(cloud_service, cloud_spending):
    cloud_spending.path.write_text("{rotto")
    res = status(cloud_service)
    assert (res.status_code, res.json()["error"]) == (500, "spending_unreadable")


# --- Controllo della connessione: Ollama --------------------------------------------------

def test_check_with_the_ollama_model_installed(service):
    res = check(service)
    assert (res.status_code, res.json()) == (200, {"provider": "ollama", "model": "qwen2.5:7b", "found": True,
                                                   "command": None})
    assert service.ollama.requests == []   # solo l'elenco dei modelli, nessuna chat


@pytest.mark.parametrize("url,pull", [("http://ollama:11434", "docker compose exec ollama ollama pull"),
                                      ("http://host.docker.internal:11434", "ollama pull")])
def test_check_gives_the_command_that_downloads_the_missing_model(service, monkeypatch, url, pull):
    monkeypatch.setattr(ollama, "OLLAMA_URL", url)
    service.ollama.installed = ["llama3:8b"]
    assert check(service).json() == {"provider": "ollama", "model": "qwen2.5:7b", "found": False,
                                     "command": f"{pull} qwen2.5:7b"}


def test_check_uses_the_model_named_in_env(service, monkeypatch):
    monkeypatch.setenv("OLLAMA_CHAT_MODEL", "llama3")
    service.ollama.installed = ["llama3:latest"]
    assert check(service).json()["found"] is True


def test_check_without_ollama(service, monkeypatch):
    monkeypatch.setattr(ollama, "OLLAMA_URL", "http://ollama:11434")
    service.ollama.down = True
    res = check(service)
    assert (res.status_code, res.json()) == (503, {
        "error": "ollama_unreachable", "message": "Coach ok, Ollama non raggiungibile su http://ollama:11434"})


# --- Controllo della connessione: cloud ---------------------------------------------------

def test_cloud_check_looks_the_model_up_without_asking_it_anything(cloud_service, cloud_spending):
    res = check(cloud_service)
    assert (res.status_code, res.json()) == (200, {"provider": "cloud", "model": CLOUD_MODEL, "found": True,
                                                   "command": None})
    [(path, headers, body)] = cloud_service.cloud.requests
    assert (path, body) == (f"/v1/models/{CLOUD_MODEL}", None)
    assert headers["authorization"] == f"Bearer {CLOUD_KEY}"
    # Claude non ha l'elenco dei modelli nel formato OpenAI: la sua ricerca vuole anche questi.
    assert (headers["x-api-key"], headers["anthropic-version"]) == (CLOUD_KEY, "2023-06-01")
    assert cloud_service.ollama.requests == [] and not cloud_spending.path.exists()


def test_cloud_check_warns_when_the_provider_does_not_list_the_model(cloud_service):
    cloud_service.cloud.listed = False
    assert check(cloud_service).json() == {"provider": "cloud", "model": CLOUD_MODEL, "found": False,
                                           "command": None}


def test_model_names_with_a_slash_stay_one_piece_of_the_address(monkeypatch):
    service = make_service(monkeypatch, {**CLOUD_ENV, "CLOUD_MODEL": "org/modello:1"})
    check(service)
    assert service.cloud.requests[0][0] == "/v1/models/org%2Fmodello%3A1"


@pytest.mark.parametrize("status_code,error,message", [
    (401, {"error": {"message": f"invalid x-api-key {CLOUD_KEY}"}},
     "Il provider cloud ha rifiutato la chiave (HTTP 401): controlla CLOUD_API_KEY in .env. invalid x-api-key ***"),
    (429, {"error": {"message": "Too many requests"}},
     "Il provider cloud rifiuta la richiesta per limite di richieste o credito esaurito (HTTP 429): Too many requests"),
    (400, {"error": {"message": "anthropic-version: header is required"}},
     "Il provider cloud ha risposto HTTP 400: anthropic-version: header is required"),
], ids=["key-rejected", "rate-limit", "unexpected"])
def test_cloud_check_says_why_the_provider_refused(cloud_service, status_code, error, message):
    cloud_service.cloud.status, cloud_service.cloud.error = status_code, error
    res = check(cloud_service)
    assert (res.status_code, res.json()) == (502, {"error": "provider", "message": message})
    assert CLOUD_KEY not in res.text


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ConnectTimeout])
def test_cloud_check_names_the_address_it_cannot_reach(cloud_service, error):
    def unreachable(request):
        raise error("provider spento")
    cloud_service.cloud.handle = unreachable
    res = check(cloud_service)
    assert (res.status_code, res.json()) == (502, {"error": "provider", "message": NOT_REACHABLE})


@pytest.mark.parametrize("env,message", [
    ({**CLOUD_ENV, "CLOUD_API_KEY": ""}, "Con COACH_PROVIDER=cloud manca in .env: CLOUD_API_KEY"),
    ({**CLOUD_ENV, "CLOUD_SPENDING_LIMIT": "-2"},
     'CLOUD_SPENDING_LIMIT in .env vale "-2": serve un numero di dollari, 0 o più, con il punto per i decimali'),
    ({"COACH_PROVIDER": "clod"}, 'COACH_PROVIDER in .env vale "clod": i valori ammessi sono ollama e cloud'),
], ids=["no-key", "negative-limit", "misspelled"])
def test_check_with_a_wrong_env_makes_no_call(monkeypatch, env, message):
    service = make_service(monkeypatch, env)
    res = check(service)
    assert (res.status_code, res.json()) == (500, {"error": "invalid_settings", "message": message})
    assert service.cloud.requests == [] and service.ollama.requests == []


def test_an_old_tab_asking_about_its_own_model_gets_the_env_one(service):
    res = service.client.get("/coach/ping", params={"model": "x" * 101})
    assert (res.status_code, res.json()["model"]) == (200, "qwen2.5:7b")
