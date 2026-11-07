"""Chiamate a Ollama. L'indirizzo viene solo da OLLAMA_URL (file .env)."""

import json
import os
from urllib.parse import urlsplit

import httpx

from app.errors import CoachError

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434").rstrip("/")
DEFAULT_CHAT_MODEL = "qwen2.5:7b"
MAX_MODEL_NAME = 100
# Secondi di silenzio concessi a Ollama tra un pezzo di risposta e il successivo,
# compresa l'attesa della prima parola; il tempo totale non ha limite.
READ_TIMEOUT = 180
# Una risposta più lunga si ferma da sola in Ollama, e il Coach usa la scelta di ripiego.
MAX_ANSWER_TOKENS = 1000
SLOW_HINT = "Su un computer lento vedi il README, sezione 5, \"Slow computers\"."


class OllamaError(Exception):
    """Ollama non risponde, non ha il modello o risponde con un errore; il messaggio è per l'utente."""


def client() -> httpx.AsyncClient:
    # Il default di httpx è 5 secondi per ogni attesa: su CPU il modello tace anche minuti
    # prima della prima parola. Chiudere il client (o abbandonare una risposta) chiude la
    # connessione, e Ollama smette di generare.
    return httpx.AsyncClient(base_url=OLLAMA_URL, timeout=httpx.Timeout(10, read=READ_TIMEOUT))


def chat_model(name) -> str:
    """Il modello chiesto dal browser, o quello predefinito se il campo è vuoto."""
    if name is not None and not isinstance(name, str):
        raise CoachError(400, "invalid_model", "Il nome del modello deve essere un testo")
    model = (name or "").strip() or DEFAULT_CHAT_MODEL
    if len(model) > MAX_MODEL_NAME:
        raise CoachError(400, "invalid_model", f"Il nome del modello deve avere al massimo {MAX_MODEL_NAME} caratteri")
    return model


async def installed_models() -> list[str]:
    """Nomi dei modelli scaricati in Ollama; lancia un errore se Ollama non risponde."""
    async with client() as ollama_client:
        res = await ollama_client.get("/api/tags", timeout=10)
        res.raise_for_status()
        return [m["name"] for m in res.json().get("models", [])]


def is_installed(model: str, installed: list[str]) -> bool:
    # Ollama elenca come "llama3:latest" un modello chiesto senza tag ("llama3").
    return model in installed or (":" not in model and f"{model}:latest" in installed)


def pull_command(model: str) -> str:
    """Comando che scarica il modello nell'Ollama in uso (container Docker o computer)."""
    in_docker = urlsplit(OLLAMA_URL).hostname == "ollama"
    return f"{'docker compose exec ollama ' if in_docker else ''}ollama pull {model}"


def unreachable() -> str:
    return f"Ollama non raggiungibile su {OLLAMA_URL}"


def silent(who: str) -> str:
    return f"{who} per {READ_TIMEOUT // 60} minuti. {SLOW_HINT}"


def missing_model(model: str) -> str:
    return f"Modello {model} non installato in Ollama. Scaricalo con: {pull_command(model)}"


async def chat_stream(client: httpx.AsyncClient, model: str, messages: list):
    """I pezzi della risposta del modello man mano che arrivano (una riga JSON l'uno);
    l'ultimo ha done: true, il numero di token (eval_count) e il motivo della fine
    (done_reason: "length" se la risposta ha raggiunto MAX_ANSWER_TOKENS)."""
    body = {"model": model, "messages": messages, "stream": True,
            "options": {"temperature": 0.2, "num_predict": MAX_ANSWER_TOKENS}}
    # json.dumps scrive come \uXXXX anche mezza coppia surrogata (un abstract tagliato a metà
    # di un carattere oltre U+FFFF), come JSON.stringify; json= di httpx fallirebbe in UTF-8.
    content = json.dumps(body)
    try:
        async with client.stream("POST", "/api/chat", content=content,
                                 headers={"Content-Type": "application/json"}) as res:
            if res.status_code == 404:
                raise OllamaError(missing_model(model))
            if res.status_code != 200:
                text = (await res.aread()).decode("utf-8", "replace")
                raise OllamaError(f"Chat HTTP {res.status_code}: {text}")
            async for line in res.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                except ValueError as e:
                    raise OllamaError("Risposta di Ollama illeggibile (chat)") from e
                if not isinstance(chunk, dict):
                    raise OllamaError("Risposta di Ollama illeggibile (chat)")
                if "error" in chunk:
                    raise OllamaError(f"Errore di Ollama: {chunk['error']}")
                yield chunk
    except httpx.ReadTimeout as e:
        raise OllamaError(silent("Il modello non ha scritto nulla")) from e
    except httpx.HTTPError as e:
        raise OllamaError(unreachable()) from e
