"""Limite di silenzio e richieste abbandonate, con connessioni vere, per Ollama e per un
provider cloud: un finto provider in ascolto su una porta registra quando il servizio chiude
la connessione (è così che il modello smette di generare), e il servizio gira in un vero
uvicorn."""

import asyncio
import itertools
import json
import re
import socket
import time

import httpx
import pytest
import uvicorn

from app import graph, main, ollama, provider, search, workout
from app.errors import CoachError
from fakes import CLOUD_PRICES, FakeRides, FakeSearch, fixture_clock, fixture_index
from fixture_data import NOW_MS, RIDES

ANSWER = '{"protocolId":"z1_recovery","razionale":"Giornata facile.","passaggiUsati":[]}'
PIECES = [ANSWER[i:i + 4] for i in range(0, len(ANSWER), 4)]
SAME_ORIGIN = {"Sec-Fetch-Site": "same-origin"}
PROVIDERS = ("ollama", "cloud")
KEY = "sk-test-chiave"
# Come risponde il finto provider per ogni nome di modello: (attesa in secondi, pezzo di testo).
PLANS = {
    "steady": lambda: [(0.1, p) for p in PIECES],                   # un pezzo ogni 0,1 s
    "late": lambda: [(5.5, PIECES[0])] + [(0, p) for p in PIECES[1:]],  # prima parola dopo 5,5 s
    "silent": lambda: [(3600, None)],                               # non scrive mai
    "forever": lambda: itertools.repeat((0.05, "bla ")),            # scrive senza fine
    "mute": lambda: [(3600, None)],                                 # non risponde nemmeno
}
# Piani in cui il provider non manda neppure l'inizio della risposta (HTTP 200).
NO_ANSWER = {"mute"}
SILENCE = {
    "ollama": 'Il modello non ha scritto nulla per 3 minuti. Su un computer lento vedi il README, sezione 5, '
              '"Slow computers".',
    "cloud": "Il modello non ha scritto nulla per 3 minuti.",
}
# Una risposta cloud interrotta prima dei token costa quanto la più lunga possibile (8.000
# token letti, 4.000 scritti, ai prezzi di prova); Ollama non costa nulla.
CEILING = {"ollama": 0, "cloud": (8000 * 3 + 4000 * 15) / 1_000_000}


class FakeModelServer:
    """Risponde su una vera porta come Ollama (POST /api/chat, una riga JSON per pezzo) o come
    un provider cloud (POST …/chat/completions, eventi "data:"); il nome del modello sceglie il
    piano. Ricorda le risposte finite e quando il client ha chiuso prima della fine."""

    def __init__(self):
        self.asked, self.finished, self.closed = [], [], []

    async def __aenter__(self):
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        self.url = f"http://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"
        return self

    async def __aexit__(self, *exc):
        self.server.close()

    async def handle(self, reader, writer):
        head = await reader.readuntil(b"\r\n\r\n")
        length = int(re.search(rb"content-length: *(\d+)", head, re.I).group(1))
        model = json.loads(await reader.readexactly(length))["model"]
        self.asked.append(model)
        cloud = b"/chat/completions" in head.split(b"\r\n", 1)[0]
        kind = b"text/event-stream" if cloud else b"application/x-ndjson"
        if model not in NO_ANSWER:
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: %s\r\nTransfer-Encoding: chunked\r\n\r\n" % kind)
        client_gone = asyncio.ensure_future(reader.read())  # b"" quando il client chiude
        try:
            for delay, piece in PLANS[model]():
                await asyncio.wait({client_gone}, timeout=delay)
                if client_gone.done():
                    self.closed.append(time.monotonic())
                    return
                self.send(writer, self.text(cloud, piece))
            for data in self.end(cloud):
                self.send(writer, data)
            writer.write(b"0\r\n\r\n")
            await writer.drain()
            self.finished.append(model)
        finally:
            client_gone.cancel()
            writer.close()

    @staticmethod
    def text(cloud: bool, piece: str) -> bytes:
        if cloud:
            chunk = {"choices": [{"index": 0, "delta": {"content": piece}, "finish_reason": None}]}
            return b"data: %s\n\n" % json.dumps(chunk).encode()
        return json.dumps({"message": {"role": "assistant", "content": piece}, "done": False}).encode() + b"\n"

    @staticmethod
    def end(cloud: bool) -> list[bytes]:
        if cloud:
            return [b'data: {"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}\n\n',
                    b"data: [DONE]\n\n"]
        return [json.dumps({"message": {"role": "assistant", "content": ""}, "done": True,
                            "done_reason": "stop", "eval_count": len(PIECES)}).encode() + b"\n"]

    @staticmethod
    def send(writer, data: bytes):
        writer.write(b"%x\r\n%s\r\n" % (len(data), data))

    async def wait_closed(self, limit: float = 5) -> float:
        deadline = time.monotonic() + limit
        while not self.closed and time.monotonic() < deadline:
            await asyncio.sleep(0.01)
        return self.closed[0]


def chat(kind: str, model: str, url: str) -> provider.ChatSettings:
    if kind == "ollama":
        return provider.ChatSettings("ollama", model, url)
    return provider.ChatSettings("cloud", model, f"{url}/v1/", KEY, CLOUD_PRICES)


BODY = {"duration": 60, "timeZone": "Europe/Rome", "profile": RIDES["profiles"]["base"]}


async def run_workout(settings: provider.ChatSettings, client: httpx.AsyncClient) -> list:
    events = []
    await graph.run(workout.parse_request(BODY), events.append, rides=FakeRides(RIDES["activities"]),
                      chat=settings, chat_client=client, embed=FakeSearch([1] * 10).encode,
                      load_index=fixture_index, now_ms=NOW_MS, spending=main.cloud_spending)
    return events


def short_silence_client(settings: provider.ChatSettings) -> httpx.AsyncClient:
    """Il client del provider, ma con 0,5 secondi di silenzio concessi invece di 180."""
    return httpx.AsyncClient(base_url=settings.url, timeout=httpx.Timeout(10, read=0.5))


@pytest.mark.parametrize("kind", PROVIDERS)
def test_text_arriving_steadily_is_never_cut_whatever_the_total_time(kind):
    async def go():
        async with FakeModelServer() as fake:
            settings = chat(kind, "steady", fake.url)
            async with short_silence_client(settings) as client:
                started = time.monotonic()
                events = await run_workout(settings, client)
                return events, time.monotonic() - started
    events, seconds = asyncio.run(go())
    assert events[-1]["type"] == "result" and not events[-1]["fellBack"]
    assert seconds > 3 * 0.5   # ben oltre il silenzio concesso


@pytest.mark.parametrize("kind", PROVIDERS)
def test_silence_stops_the_request_and_closes_the_provider(kind):
    async def go():
        async with FakeModelServer() as fake:
            settings = chat(kind, "silent", fake.url)
            async with short_silence_client(settings) as client:
                with pytest.raises(CoachError) as e:
                    await run_workout(settings, client)
                stopped = time.monotonic()
                return e.value, await fake.wait_closed() - stopped
    error, delay = asyncio.run(go())
    assert (error.code, error.message) == ("model", SILENCE[kind])
    assert delay < 5
    assert main.cloud_spending.total() == pytest.approx(CEILING[kind])


@pytest.mark.parametrize("kind", PROVIDERS)
def test_first_word_after_more_than_httpx_default_5_seconds_is_waited_for(monkeypatch, kind):
    async def go():
        async with FakeModelServer() as fake:
            monkeypatch.setattr(ollama, "OLLAMA_URL", fake.url)
            settings = chat(kind, "late", fake.url)
            async with provider.client(settings) as client:
                return await run_workout(settings, client)
    assert asyncio.run(go())[-1]["type"] == "result"


# --- Attraverso un vero server HTTP -----------------------------------------------------

class CoachServer:
    """Il servizio Coach in un vero uvicorn, su una porta libera, con Strava, modello di ricerca
    e indice finti, e il modello chat di .env sul finto provider."""

    def __init__(self, monkeypatch, kind: str, model: str, url: str):
        monkeypatch.setattr(main, "rides", FakeRides(RIDES["activities"]))
        fixture_clock(monkeypatch)
        monkeypatch.setattr(search, "encode", FakeSearch([1] * 10).encode)
        monkeypatch.setattr(main, "load_index", fixture_index)
        monkeypatch.setattr(ollama, "OLLAMA_URL", url)
        env = ({"OLLAMA_CHAT_MODEL": model} if kind == "ollama" else
               {"COACH_PROVIDER": "cloud", "CLOUD_URL": f"{url}/v1/", "CLOUD_API_KEY": KEY, "CLOUD_MODEL": model,
                "CLOUD_PRICE_IN": "3", "CLOUD_PRICE_OUT": "15", "CLOUD_SPENDING_LIMIT": "1"})
        for name, value in env.items():
            monkeypatch.setenv(name, value)

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


async def until_first_token(client: httpx.AsyncClient) -> float:
    """Chiede un workout, legge fino al primo pezzo di testo del modello e chiude la
    connessione, come una scheda chiusa o ricaricata; ritorna l'istante della chiusura."""
    async with client.stream("POST", "/coach/workout", json=BODY, headers=SAME_ORIGIN) as res:
        async for line in res.aiter_lines():
            if json.loads(line)["type"] == "token":
                break
    return time.monotonic()


async def whole_answer(client: httpx.AsyncClient) -> list:
    res = await client.post("/coach/workout", json=BODY, headers=SAME_ORIGIN)
    return [json.loads(line) for line in res.text.splitlines()]


async def spent(expected: float, limit: float = 5) -> float:
    """Il totale della spesa, appena arriva al valore atteso (o dopo `limit` secondi)."""
    deadline = time.monotonic() + limit
    while main.cloud_spending.total() != pytest.approx(expected) and time.monotonic() < deadline:
        await asyncio.sleep(0.01)
    return main.cloud_spending.total()


@pytest.mark.parametrize("kind", PROVIDERS)
def test_closed_connection_stops_the_provider_within_5_seconds(monkeypatch, kind):
    async def go():
        async with FakeModelServer() as fake, CoachServer(monkeypatch, kind, "forever", fake.url) as client:
            left = await until_first_token(client)
            return await fake.wait_closed() - left, await spent(CEILING[kind])
    closed, total = asyncio.run(go())
    assert closed < 5
    # Il provider fa pagare quello che ha già scritto: senza i token, il costo massimo.
    assert total == pytest.approx(CEILING[kind])


def test_stop_before_the_cloud_provider_answers_costs_nothing(monkeypatch):
    async def go():
        async with FakeModelServer() as fake, CoachServer(monkeypatch, "cloud", "mute", fake.url) as client:
            async with client.stream("POST", "/coach/workout", json=BODY, headers=SAME_ORIGIN) as res:
                async for line in res.aiter_lines():
                    if json.loads(line).get("step") == "model":
                        break
                deadline = time.monotonic() + 5
                while not fake.asked and time.monotonic() < deadline:
                    await asyncio.sleep(0.01)
            await fake.wait_closed()
            return await spent(CEILING["cloud"], limit=1)
    # Il provider non ha accettato la richiesta, quindi non ha scritto nulla da far pagare.
    assert asyncio.run(go()) == 0


@pytest.mark.parametrize("kind", PROVIDERS)
def test_closing_one_of_two_requests_stops_only_that_one(monkeypatch, kind):
    async def go():
        async with FakeModelServer() as fake, CoachServer(monkeypatch, kind, "steady", fake.url) as client:
            other = asyncio.create_task(whole_answer(client))
            left = await until_first_token(client)
            closed = await fake.wait_closed() - left
            return closed, await other, fake
    closed, other_events, fake = asyncio.run(go())
    assert closed < 5
    assert other_events[-1]["type"] == "result"
    assert fake.finished == ["steady"] and len(fake.closed) == 1
