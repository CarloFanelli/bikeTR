"""Il Coach con un modello cloud (formato compatibile con OpenAI): il testo arriva a pezzi
come con Ollama; chiave rifiutata, limite di richieste, credito esaurito e connessione caduta
danno un messaggio chiaro, senza mai mostrare la chiave e senza passare a Ollama. Il
provider è simulato: nessuna chiamata vera, nessuna spesa."""

import asyncio
import json

import httpx
import pytest

from app import cloud
from app.chat import Accepted, ChatEnd, ModelError
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, CLOUD_URL, FakeCloud
from test_workout import BODY, CASE, events_of, make_service, post


@pytest.fixture
def cloud_service(monkeypatch):
    return make_service(monkeypatch, CLOUD_ENV)


def test_cloud_text_reaches_the_screen_as_it_arrives(cloud_service):
    events = events_of(post(cloud_service, BODY))
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert len(tokens) > 1 and "".join(tokens) == CASE["valid-answer"]["answer"]
    result = events[-1]
    assert {k: result[k] for k in ("type", "provider", "model", "inputTokens", "outputTokens")} == {
        "type": "result", "provider": "cloud", "model": CLOUD_MODEL, "inputTokens": 900, "outputTokens": 42}
    assert cloud_service.ollama.requests == []


@pytest.mark.parametrize("status,error,message", [
    (401, {"type": "error", "error": {"type": "authentication_error", "message": f"invalid x-api-key {CLOUD_KEY}"}},
     "Il provider cloud ha rifiutato la chiave (HTTP 401): controlla CLOUD_API_KEY in .env. invalid x-api-key ***"),
    (403, {"error": {"message": "permission denied"}},
     "Il provider cloud ha rifiutato la chiave (HTTP 403): controlla CLOUD_API_KEY in .env. permission denied"),
    (429, {"error": {"type": "rate_limit_error", "message": "Too many requests"}},
     "Il provider cloud rifiuta la richiesta per limite di richieste o credito esaurito (HTTP 429): Too many requests"),
    (400, {"error": {"type": "invalid_request_error",
                     "message": "Your credit balance is too low to access the Anthropic API."}},
     "Il provider cloud ha risposto HTTP 400: Your credit balance is too low to access the Anthropic API."),
], ids=["key-rejected", "forbidden", "rate-limit", "no-credit"])
def test_provider_refusal_says_why_without_the_key_and_without_ollama(cloud_service, status, error, message):
    cloud_service.cloud.status, cloud_service.cloud.error = status, error
    res = post(cloud_service, BODY)
    assert events_of(res)[-1] == {"type": "error", "error": "model", "message": message}
    assert CLOUD_KEY not in res.text and cloud_service.ollama.requests == []


def test_unreachable_provider_names_its_address(cloud_service):
    cloud_service.cloud.down = True
    assert events_of(post(cloud_service, BODY))[-1] == {
        "type": "error", "error": "model", "message": f"Provider cloud non raggiungibile su {CLOUD_URL}"}


def test_stream_dropping_mid_answer_keeps_the_text_then_shows_the_error(cloud_service):
    cloud_service.cloud.drop_after = 3
    events = events_of(post(cloud_service, BODY))
    assert [e["text"] for e in events if e["type"] == "token"] == [CASE["valid-answer"]["answer"][:21][i:i + 7]
                                                                   for i in range(0, 21, 7)]
    assert events[-1] == {"type": "error", "error": "model",
                          "message": "Connessione con il provider cloud interrotta (ReadError)"}


def test_answer_with_no_text_uses_the_fallback_rules(cloud_service):
    cloud_service.cloud.answer = ""
    result = events_of(post(cloud_service, BODY))[-1]
    assert (result["type"], result["fellBack"], result["modelRaw"]) == ("result", True, "")


def test_provider_without_token_counts_gives_none(cloud_service):
    cloud_service.cloud.usage = None
    result = events_of(post(cloud_service, BODY))[-1]
    assert (result["inputTokens"], result["outputTokens"]) == (None, None)


def read(lines: list[str]) -> list:
    """I pezzi che il Coach ricava da un flusso di eventi "data:" dato riga per riga."""
    def handler(request):
        return httpx.Response(200, content="".join(line + "\n" for line in lines).encode())

    async def go():
        async with httpx.AsyncClient(base_url=CLOUD_URL, transport=httpx.MockTransport(handler)) as client:
            return [p async for p in cloud.chat_stream(client, CLOUD_MODEL, [], CLOUD_KEY)]
    return asyncio.run(go())


def test_stream_ends_at_done_and_reads_usage_from_a_chunk_without_choices():
    chunk = {"choices": [{"index": 0, "delta": {"content": "ciao"}, "finish_reason": None}]}
    assert read([f"data: {json.dumps(chunk)}", "",
                 'data: {"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}', "",
                 'data: {"choices": [], "usage": {"prompt_tokens": 10, "completion_tokens": 3}}', "",
                 "data: [DONE]", "", f"data: {json.dumps(chunk)}"]) == [Accepted(), "ciao", ChatEnd(10, 3, False)]


def test_error_sent_inside_the_stream_becomes_the_model_error():
    with pytest.raises(ModelError) as e:
        read(['data: {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}'])
    assert str(e.value) == "Errore del provider cloud: Overloaded"


def test_settings_never_show_the_key():
    assert CLOUD_KEY not in repr(FakeCloud("").chat)
