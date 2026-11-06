"""Limite di silenzio e richieste abbandonate, con connessioni vere: un finto Ollama in
ascolto su una porta registra quando il servizio chiude la connessione (è così che il
vero Ollama smette di generare), e il servizio gira in un vero uvicorn."""

import asyncio
import itertools
import json
import re
import socket
import time

import httpx
import pytest
import uvicorn

from app import main, ollama, workout
from app.errors import CoachError
from fakes import FakeRides, fixture_index
from fixture_data import NOW_MS, RIDES

ANSWER = '{"protocolId":"z2_endurance","razionale":"Giornata facile.","paperUsati":[]}'
PIECES = [ANSWER[i:i + 4] for i in range(0, len(ANSWER), 4)]
SAME_ORIGIN = {"Sec-Fetch-Site": "same-origin"}
# Come risponde il finto Ollama per ogni nome di modello: (attesa in secondi, pezzo di testo).
PLANS = {
    "steady": lambda: [(0.1, p) for p in PIECES],                   # un pezzo ogni 0,1 s
    "late": lambda: [(5.5, PIECES[0])] + [(0, p) for p in PIECES[1:]],  # prima parola dopo 5,5 s
    "silent": lambda: [(3600, None)],                               # non scrive mai
    "forever": lambda: itertools.repeat((0.05, "bla ")),            # scrive senza fine
}


class FakeOllamaServer:
    """Risponde come Ollama su una vera porta; per ogni modello registra se la risposta
    è finita o se il client ha chiuso la connessione prima, e quando."""

    def __init__(self):
        self.finished, self.closed = set(), {}

    async def __aenter__(self):
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        self.url = f"http://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"
        return self

    async def __aexit__(self, *exc):
        self.server.close()

    async def handle(self, reader, writer):
        head = await reader.readuntil(b"\r\n\r\n")
        length = int(re.search(rb"content-length: *(\d+)", head, re.I).group(1))
        body = json.loads(await reader.readexactly(length))
        if head.startswith(b"POST /api/embeddings"):
            data = json.dumps({"embedding": [1] * 10}).encode()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n"
                         b"Content-Length: %d\r\n\r\n%s" % (len(data), data))
            await writer.drain()
            writer.close()
            return
        model = body["model"]
        writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nTransfer-Encoding: chunked\r\n\r\n")
        client_gone = asyncio.ensure_future(reader.read())  # b"" quando il client chiude
        try:
            for delay, piece in PLANS[model]():
                await asyncio.wait({client_gone}, timeout=delay)
                if client_gone.done():
                    self.closed[model] = time.monotonic()
                    return
                self.send(writer, {"message": {"role": "assistant", "content": piece}, "done": False})
            self.send(writer, {"message": {"role": "assistant", "content": ""}, "done": True,
                               "done_reason": "stop", "eval_count": len(PIECES)})
            writer.write(b"0\r\n\r\n")
            await writer.drain()
            self.finished.add(model)
        finally:
            client_gone.cancel()
            writer.close()

    @staticmethod
    def send(writer, chunk: dict):
        data = json.dumps(chunk).encode() + b"\n"
        writer.write(b"%x\r\n%s\r\n" % (len(data), data))

    async def wait_closed(self, model: str, limit: float = 5) -> float:
        deadline = time.monotonic() + limit
        while model not in self.closed and time.monotonic() < deadline:
            await asyncio.sleep(0.01)
        return self.closed[model]


def body(model: str) -> dict:
    return {"duration": 60, "model": model, "timeZone": "Europe/Rome", "profile": RIDES["profiles"]["base"]}


def request(model: str) -> workout.WorkoutRequest:
    return workout.parse_request(body(model))


async def run_workout(model: str, client: httpx.AsyncClient) -> list:
    events = []
    await workout.run(request(model), events.append, rides=FakeRides(RIDES["activities"]),
                      ollama_client=client, load_index=fixture_index, now_ms=NOW_MS)
    return events


def short_silence_client(url: str) -> httpx.AsyncClient:
    """Il client di Ollama, ma con 0,5 secondi di silenzio concessi invece di 180."""
    return httpx.AsyncClient(base_url=url, timeout=httpx.Timeout(10, read=0.5))


def test_text_arriving_steadily_is_never_cut_whatever_the_total_time():
    async def go():
        async with FakeOllamaServer() as fake, short_silence_client(fake.url) as client:
            started = time.monotonic()
            events = await run_workout("steady", client)
            return events, time.monotonic() - started
    events, seconds = asyncio.run(go())
    assert events[-1]["type"] == "result" and not events[-1]["fellBack"]
    assert seconds > 3 * 0.5   # ben oltre il silenzio concesso


def test_silence_stops_with_the_slow_computer_hint_and_closes_ollama():
    async def go():
        async with FakeOllamaServer() as fake, short_silence_client(fake.url) as client:
            with pytest.raises(CoachError) as e:
                await run_workout("silent", client)
            stopped = time.monotonic()
            return e.value, await fake.wait_closed("silent") - stopped
    error, delay = asyncio.run(go())
    assert (error.code, error.message) == ("model", 'Il modello non ha scritto nulla per 3 minuti. Su un '
                                                    'computer lento vedi il README, sezione 5, "Slow computers".')
    assert delay < 5


def test_first_word_after_more_than_httpx_default_5_seconds_is_waited_for(monkeypatch):
    async def go():
        async with FakeOllamaServer() as fake:
            monkeypatch.setattr(ollama, "OLLAMA_URL", fake.url)
            async with ollama.client() as client:
                return await run_workout("late", client)
    assert asyncio.run(go())[-1]["type"] == "result"


# --- Attraverso un vero server HTTP -----------------------------------------------------

class CoachServer:
    """Il servizio Coach in un vero uvicorn, su una porta libera, con Strava e indice finti."""

    def __init__(self, monkeypatch, ollama_url: str):
        monkeypatch.setattr(main, "rides", FakeRides(RIDES["activities"]))
        monkeypatch.setattr(main, "load_index", fixture_index)
        monkeypatch.setattr(ollama, "OLLAMA_URL", ollama_url)

    async def __aenter__(self):
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.server = uvicorn.Server(uvicorn.Config(main.app, lifespan="off", log_level="warning"))
        self.task = asyncio.create_task(self.server.serve(sockets=[self.sock]))
        deadline = time.monotonic() + 5
        while not self.server.started:
            if self.task.done():
                await self.task   # rilancia l'errore di avvio di uvicorn
            assert time.monotonic() < deadline, "uvicorn non è partito entro 5 secondi"
            await asyncio.sleep(0.01)
        return httpx.AsyncClient(base_url=f"http://127.0.0.1:{self.sock.getsockname()[1]}", timeout=10)

    async def __aexit__(self, *exc):
        self.server.should_exit = True
        await self.task


async def until_first_token(client: httpx.AsyncClient, model: str) -> float:
    """Chiede un workout, legge fino al primo pezzo di testo del modello e chiude la
    connessione, come una scheda chiusa o ricaricata; ritorna l'istante della chiusura."""
    async with client.stream("POST", "/coach/workout", json=body(model), headers=SAME_ORIGIN) as res:
        async for line in res.aiter_lines():
            if json.loads(line)["type"] == "token":
                break
    return time.monotonic()


async def whole_answer(client: httpx.AsyncClient, model: str) -> list:
    res = await client.post("/coach/workout", json=body(model), headers=SAME_ORIGIN)
    return [json.loads(line) for line in res.text.splitlines()]


def test_closed_connection_stops_ollama_within_5_seconds(monkeypatch):
    async def go():
        async with FakeOllamaServer() as fake, CoachServer(monkeypatch, fake.url) as client:
            left = await until_first_token(client, "forever")
            return await fake.wait_closed("forever") - left
    assert asyncio.run(go()) < 5


def test_closing_one_of_two_requests_stops_only_that_one(monkeypatch):
    async def go():
        async with FakeOllamaServer() as fake, CoachServer(monkeypatch, fake.url) as client:
            other = asyncio.create_task(whole_answer(client, "steady"))
            left = await until_first_token(client, "forever")
            closed = await fake.wait_closed("forever") - left
            return closed, await other, fake
    closed, other_events, fake = asyncio.run(go())
    assert closed < 5
    assert other_events[-1]["type"] == "result"
    assert "steady" in fake.finished and "steady" not in fake.closed
