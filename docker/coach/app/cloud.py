"""Chiamate a un modello in cloud attraverso il formato compatibile con OpenAI
(POST {CLOUD_URL}/chat/completions), per esempio Claude. Indirizzo, chiave e modello
vengono solo da .env; la chiave non compare mai nei messaggi."""

import json
from urllib.parse import quote

import httpx

from app.chat import READ_TIMEOUT, TIMEOUT, ChatEnd, ModelError, token_count

# Comprende il ragionamento nascosto dei modelli che pensano prima di rispondere: una
# risposta che arriva qui è tagliata, e il Coach usa la scelta di ripiego.
MAX_ANSWER_TOKENS = 4000
# Codici HTTP con cui il provider rifiuta la chiave, o la richiesta per limite o credito.
KEY_REJECTED = {401, 403}
LIMITED = {402, 429}
# La ricerca del modello nel controllo della connessione: risponde subito, nessun token.
CHECK_TIMEOUT = 10


class CloudError(ModelError):
    """Il provider cloud non risponde o rifiuta la richiesta; il messaggio è per l'utente."""


def client(url: str, key: str) -> httpx.AsyncClient:
    # Chiudere il client (o abbandonare una risposta) chiude la connessione, e il provider
    # smette di generare.
    return httpx.AsyncClient(base_url=url, headers={"Authorization": f"Bearer {key}"}, timeout=TIMEOUT)


def provider_message(text: str, key: str) -> str:
    """Il messaggio d'errore del provider ({"error": {"message": …}} o testo), senza la chiave."""
    try:
        body = json.loads(text)
        message = body["error"]["message"] if isinstance(body["error"], dict) else body["error"]
    except (ValueError, KeyError, TypeError):
        message = text
    message = str(message)
    return (message.replace(key, "***") if key else message)[:500]


def refused(status: int, text: str, key: str) -> CloudError:
    message = provider_message(text, key)
    if status in KEY_REJECTED:
        return CloudError(f"Il provider cloud ha rifiutato la chiave (HTTP {status}): controlla CLOUD_API_KEY "
                          f"in .env. {message}", billed=False)
    if status in LIMITED:
        return CloudError(f"Il provider cloud rifiuta la richiesta per limite di richieste o credito esaurito "
                          f"(HTTP {status}): {message}", billed=False)
    return CloudError(f"Il provider cloud ha risposto HTTP {status}: {message}", billed=False)


def connection_error(e: httpx.HTTPError, client: httpx.AsyncClient) -> CloudError:
    if isinstance(e, (httpx.ConnectError, httpx.ConnectTimeout)):
        return CloudError(f"Provider cloud non raggiungibile su {client.base_url}", billed=False)
    return CloudError(f"Connessione con il provider cloud interrotta ({e.__class__.__name__})")


async def find_model(client: httpx.AsyncClient, model: str, key: str) -> bool:
    """Il controllo della connessione, senza spendere token: GET {CLOUD_URL}models/{model}.
    True se il provider ha il modello, False se non lo conosce (404); un rifiuto o un provider
    irraggiungibile alzano CloudError con il motivo."""
    # Claude non ha l'elenco dei modelli nel formato OpenAI: la sua ricerca, allo stesso
    # indirizzo, vuole la chiave in x-api-key e la versione dell'API. Gli altri provider
    # ignorano le due intestazioni, e la chiave va comunque allo stesso indirizzo.
    headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
    try:
        # Un nome come "org/modello" resta un solo pezzo dell'indirizzo.
        res = await client.get(f"models/{quote(model, safe='')}", headers=headers, timeout=CHECK_TIMEOUT)
    except httpx.HTTPError as e:
        raise connection_error(e, client) from e
    if res.status_code == 404:
        return False
    if res.status_code != 200:
        raise refused(res.status_code, res.text, key)
    return True


async def chat_stream(client: httpx.AsyncClient, model: str, messages: list, key: str):
    """Il testo della risposta man mano che arriva, poi ChatEnd. Il provider manda eventi
    "data: {json}"; il pezzo con finish_reason dice se la risposta è stata tagliata, l'ultimo
    (con choices vuoto) porta i token usati, e "data: [DONE]" chiude."""
    # Nessuna temperatura: i modelli che ragionano (Claude 5) rifiutano quella bassa.
    body = {"model": model, "messages": messages, "stream": True, "stream_options": {"include_usage": True},
            "max_tokens": MAX_ANSWER_TOKENS}
    usage, truncated = {}, False
    try:
        # json.dumps, non json= di httpx: mezza coppia surrogata nel prompt (ollama.py).
        async with client.stream("POST", "chat/completions", content=json.dumps(body),
                                 headers={"Content-Type": "application/json"}) as res:
            if res.status_code != 200:
                raise refused(res.status_code, (await res.aread()).decode("utf-8", "replace"), key)
            async for line in res.aiter_lines():
                # Righe vuote, commenti (": …") ed "event: …" non portano dati.
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except ValueError as e:
                    raise CloudError("Risposta del provider cloud illeggibile") from e
                if not isinstance(chunk, dict):
                    raise CloudError("Risposta del provider cloud illeggibile")
                if "error" in chunk:
                    raise CloudError(f"Errore del provider cloud: {provider_message(data, key)}")
                choices = chunk.get("choices")
                choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
                delta = choice.get("delta")
                text = delta.get("content") if isinstance(delta, dict) else None
                if isinstance(text, str) and text:
                    yield text
                if choice.get("finish_reason") == "length":
                    truncated = True
                if isinstance(chunk.get("usage"), dict):
                    usage = chunk["usage"]
    except httpx.ReadTimeout as e:
        raise CloudError(f"Il modello non ha scritto nulla per {READ_TIMEOUT // 60} minuti.") from e
    except httpx.HTTPError as e:
        raise connection_error(e, client) from e
    yield ChatEnd(token_count(usage.get("prompt_tokens")), token_count(usage.get("completion_tokens")), truncated)
