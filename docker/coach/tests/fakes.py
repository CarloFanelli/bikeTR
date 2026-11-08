"""Sostituti di Strava, del modello di ricerca, dell'indice dei paper, dei due provider del
modello chat (Ollama e un provider cloud compatibile con OpenAI) e di Phoenix per i test del workout."""

import json

import httpx
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import cloud, tracing
from app.provider import ChatSettings
from app.spending import Prices
from app.strava import RideData
from fixture_data import DETAILS, NOW_MS, load

INDEX = load("papers_index.json")
CLOUD_URL = "https://cloud.example/v1/"
CLOUD_KEY = "sk-test-chiave-segreta"
CLOUD_MODEL = "claude-di-prova"
# Dollari per milione di token letti e scritti, e tetto di spesa in dollari.
CLOUD_PRICES = Prices(input=3.0, output=15.0, limit=1.0)
CLOUD_ENV = {"COACH_PROVIDER": "cloud", "CLOUD_URL": CLOUD_URL, "CLOUD_API_KEY": CLOUD_KEY, "CLOUD_MODEL": CLOUD_MODEL,
             "CLOUD_PRICE_IN": "3", "CLOUD_PRICE_OUT": "15", "CLOUD_SPENDING_LIMIT": "1"}
# Il client vero, preso prima che un test lo sostituisca con FakeCloud.client.
REAL_CLOUD_CLIENT = cloud.client
# Chi manda le tracce al Phoenix vero, preso prima che conftest.py lo sostituisca con FakePhoenix.
REAL_PHOENIX = tracing.phoenix


class FakeRides:
    """Al posto del download da Strava: due dettagli scaricati, poi le corse date."""

    def __init__(self, acts: list):
        self.data = RideData(activities=acts, details=DETAILS, downloaded_at=NOW_MS,
                             from_saved=False, missing_details=0)
        self.calls = 0
        self.error = None

    async def refresh(self, now_ms, progress=None):
        self.calls += 1
        if self.error:
            raise self.error
        for done in (1, 2):
            progress(done, 2)
        return self.data


async def fixture_index() -> dict:
    return INDEX


class FakeSearch:
    """Al posto del modello di ricerca: un vettore fisso per ogni testo; ricorda i testi."""

    def __init__(self, vector: list):
        self.vector = vector
        self.texts = []

    async def encode(self, text: str) -> list:
        self.texts.append(text)
        return self.vector


def pieces(answer: str) -> list[str]:
    return [answer[i:i + 7] for i in range(0, len(answer), 7)]


class FakeOllama:
    """Risponde come Ollama: la risposta del modello a pezzi di 7 caratteri, poi l'ultimo
    pezzo con done, i token letti e scritti e il motivo della fine."""

    def __init__(self, answer: str, model: str = "qwen2.5:7b"):
        self.answer = answer
        self.chat = ChatSettings("ollama", model, "http://ollama:11434")
        self.done_reason = "stop"
        self.requests = []
        self.status = 200
        self.down = False
        self.installed = [model]

    def handle(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("ollama spento")
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": m} for m in self.installed]})
        body = json.loads(request.content)
        self.requests.append((request.url.path, body))
        if self.status != 200:
            return httpx.Response(self.status, json={"error": "qualcosa non va"})
        lines = [{"message": {"role": "assistant", "content": p}, "done": False} for p in pieces(self.answer)]
        lines.append({"message": {"role": "assistant", "content": ""}, "done": True,
                      "done_reason": self.done_reason, "prompt_eval_count": 900, "eval_count": 42})
        return httpx.Response(200, content="".join(json.dumps(x) + "\n" for x in lines).encode())

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.chat.url, transport=httpx.MockTransport(self.handle))


class Dropping(httpx.AsyncByteStream):
    """Un corpo di risposta che si interrompe dopo i pezzi dati, come una connessione caduta."""

    def __init__(self, chunks: list[bytes]):
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk
        raise httpx.ReadError("connessione caduta")


class FakeCloud:
    """Risponde come un provider compatibile con OpenAI: eventi "data:" con il testo a pezzi
    di 7 caratteri, poi finish_reason, i token usati (con choices vuoto) e [DONE]; in mezzo un
    commento e una riga "event:", come fanno i provider veri."""

    def __init__(self, answer: str):
        self.answer = answer
        self.chat = ChatSettings("cloud", CLOUD_MODEL, CLOUD_URL, CLOUD_KEY, CLOUD_PRICES)
        self.finish_reason = "stop"
        self.usage = {"prompt_tokens": 900, "completion_tokens": 42}
        self.requests = []
        self.status, self.error = 200, None
        self.down = False
        self.drop_after = None   # pezzi di testo dopo cui la connessione cade
        self.listed = True       # il modello compare nell'elenco del provider

    def handle(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("provider spento")
        # Il percorso come è stato scritto, con %2F e simili ancora codificati.
        path = request.url.raw_path.decode()
        self.requests.append((path, request.headers, json.loads(request.content) if request.content else None))
        if self.status != 200:
            return httpx.Response(self.status, json=self.error)
        if request.method == "GET":
            if not self.listed:
                return httpx.Response(404, json={"error": {"message": "model not found"}})
            return httpx.Response(200, json={"id": CLOUD_MODEL, "object": "model"})
        events = [{"choices": [{"index": 0, "delta": {"content": p}, "finish_reason": None}]}
                  for p in pieces(self.answer)]
        events.append({"choices": [{"index": 0, "delta": {}, "finish_reason": self.finish_reason}]})
        if self.usage is not None:
            events.append({"choices": [], "usage": self.usage})
        lines = [": commento del provider", "event: message", *(f"data: {json.dumps(e)}" for e in events),
                 "data: [DONE]"]
        chunks = [(line + "\n\n").encode() for line in lines]
        if self.drop_after is not None:
            return httpx.Response(200, stream=Dropping(chunks[:2 + self.drop_after]))
        return httpx.Response(200, content=b"".join(chunks))

    def client(self, url: str = CLOUD_URL, key: str = CLOUD_KEY) -> httpx.AsyncClient:
        """Il client del Coach (indirizzo, chiave, attese), con il finto provider al posto della rete."""
        real = REAL_CLOUD_CLIENT(url, key)
        return httpx.AsyncClient(base_url=real.base_url, headers=real.headers, timeout=real.timeout,
                                 transport=httpx.MockTransport(self.handle))


class Received(InMemorySpanExporter):
    """I passi arrivati al finto Phoenix. Restano leggibili anche dopo che un comando ha chiuso le
    sue tracce all'uscita, e un comando eseguito di nuovo nello stesso test ne aggiunge altri."""

    def shutdown(self) -> None:
        pass


class FakePhoenix:
    """Al posto di Phoenix: le tracce del servizio e dei comandi restano in memoria, nessuna va in rete."""

    def __init__(self, project: str = tracing.COACH_SCREEN):
        self.received = Received()
        self.provider = tracing.setup(project, self.received)

    def spans(self) -> list:
        """I passi arrivati finora, ciascuno appena finito: prima manda quelli ancora in coda."""
        self.provider.force_flush()
        return list(self.received.get_finished_spans())

    def traces(self) -> list[tuple]:
        """Le tracce già arrivate, senza mandare quelle ancora in coda: per ognuna la richiesta e i
        suoi passi, in ordine di partenza."""
        spans = sorted(self.received.get_finished_spans(), key=lambda s: s.start_time)
        return [(root, [s for s in spans if s.parent and s.parent.span_id == root.context.span_id])
                for root in spans if root.parent is None]


class DownPhoenix(SpanExporter):
    """Phoenix spento, o acceso solo quando `up` è vero."""

    def __init__(self):
        self.up = False

    def export(self, spans):
        return SpanExportResult.SUCCESS if self.up else SpanExportResult.FAILURE
