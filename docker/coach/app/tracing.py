"""Le tracce del Coach in Phoenix: ogni richiesta diventa una traccia, con un passo per corse e
numeri, ricerca dei paper, modello chat e decisione, ognuno con la sua durata e con ciò che il
Coach ha visto, mandato e deciso. Phoenix gira nel suo container (compose.yaml) e le tracce non
lasciano il computer.

Le tracce partono a gruppi da un thread in background: una richiesta non aspetta mai Phoenix. Ogni
processo scrive in un suo progetto di Phoenix, scelto con setup. I nomi dei valori sono quelli di
OpenInference, che Phoenix sa mostrare: messaggi del modello, paper trovati, token e costo."""

import json
import os
from contextlib import contextmanager

from openinference.semconv.resource import ResourceAttributes
from openinference.semconv.trace import (DocumentAttributes, MessageAttributes, OpenInferenceMimeTypeValues,
                                         OpenInferenceSpanKindValues, SpanAttributes)
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter

from app import prompts
from app.chat import ChatEnd
from app.provider import ChatSettings

PHOENIX_URL = os.environ.get("PHOENIX_URL", "http://phoenix:6006").rstrip("/")
# Il progetto di Phoenix delle richieste della schermata Coach.
COACH_SCREEN = "coach-screen"
KIND = SpanAttributes.OPENINFERENCE_SPAN_KIND
# Il tipo di passo per Phoenix: la ricerca dei paper e la chiamata al modello hanno una vista loro.
KINDS = {"papers": OpenInferenceSpanKindValues.RETRIEVER, "model": OpenInferenceSpanKindValues.LLM}
JSON = OpenInferenceMimeTypeValues.JSON.value

# Prima di setup nessuna traccia: le richieste funzionano lo stesso.
_tracer: trace.Tracer = trace.NoOpTracer()
_project = ""


def setup(project: str, exporter: SpanExporter | None = None) -> TracerProvider:
    """Manda a Phoenix, nel progetto `project`, le tracce di questo processo; nei test `exporter`
    prende il posto di Phoenix. Il fornitore di tracce è di questo modulo, non quello globale di
    OpenTelemetry, che si imposta una volta sola: ogni test ne vuole uno nuovo."""
    global _tracer, _project
    provider = TracerProvider(resource=Resource.create({ResourceAttributes.PROJECT_NAME: project}))
    provider.add_span_processor(BatchSpanProcessor(exporter or OTLPSpanExporter(endpoint=f"{PHOENIX_URL}/v1/traces")))
    _tracer, _project = provider.get_tracer(__name__), project
    return provider


@contextmanager
def request(minutes: int):
    """La traccia di una richiesta del Coach: da dove viene (il progetto), i minuti chiesti e la
    versione del prompt. I passi aperti dentro il blocco le appartengono."""
    with _tracer.start_as_current_span(_project, attributes={
            KIND: OpenInferenceSpanKindValues.CHAIN.value, "coach.source": _project, "coach.minutes": minutes,
            "coach.prompt_version": prompts.prompt_version()}):
        yield


@contextmanager
def step(name: str):
    """Un passo della richiesta, con la sua durata: rides, papers, model o decision."""
    kind = KINDS.get(name, OpenInferenceSpanKindValues.CHAIN)
    with _tracer.start_as_current_span(name, attributes={KIND: kind.value}):
        yield


def _note(attributes: dict) -> None:
    """Valori sul passo in corso. Un valore None resta senza valore, cioè sconosciuto."""
    trace.get_current_span().set_attributes({k: v for k, v in attributes.items() if v is not None})


def note_rides(from_saved: bool, ctx: dict) -> None:
    """Se le corse sono quelle salvate (Strava non raggiungibile) e i numeri dell'atleta che ne vengono."""
    _note({"coach.rides.from_saved": from_saved, SpanAttributes.OUTPUT_VALUE: json.dumps(ctx, ensure_ascii=False),
          SpanAttributes.OUTPUT_MIME_TYPE: JSON})


def note_papers(query: str, found: list) -> None:
    """Il testo cercato e i paper trovati, con PMID, titolo e punteggio: niente abstract né vettori."""
    attributes = {SpanAttributes.INPUT_VALUE: query}
    for i, p in enumerate(found):
        document = f"{SpanAttributes.RETRIEVAL_DOCUMENTS}.{i}."
        attributes |= {document + DocumentAttributes.DOCUMENT_ID: p["pmid"],
                       document + DocumentAttributes.DOCUMENT_CONTENT: p["title"],
                       document + DocumentAttributes.DOCUMENT_SCORE: p["score"]}
    _note(attributes)


def _messages(prefix: str, messages: list) -> dict:
    return {f"{prefix}.{i}.{field}": m[key] for i, m in enumerate(messages)
            for field, key in ((MessageAttributes.MESSAGE_ROLE, "role"), (MessageAttributes.MESSAGE_CONTENT, "content"))}


def note_model(chat: ChatSettings, messages: list, answer: str, end: ChatEnd, cost: float | None) -> None:
    """Il modello chat, i messaggi mandati, la risposta grezza, i token, il costo e se la risposta si
    è interrotta. Dalle impostazioni solo provider e modello: la chiave non entra mai in una traccia."""
    _note({SpanAttributes.LLM_PROVIDER: chat.provider, SpanAttributes.LLM_MODEL_NAME: chat.model,
          **_messages(SpanAttributes.LLM_INPUT_MESSAGES, messages),
          **_messages(SpanAttributes.LLM_OUTPUT_MESSAGES, [{"role": "assistant", "content": answer}]),
          SpanAttributes.OUTPUT_VALUE: answer,
          SpanAttributes.LLM_TOKEN_COUNT_PROMPT: end.input_tokens,
          SpanAttributes.LLM_TOKEN_COUNT_COMPLETION: end.output_tokens,
          SpanAttributes.LLM_COST_TOTAL: cost, "coach.truncated": end.truncated})


def note_decision(chosen: str | None, given: str, warning: str | None) -> None:
    """Il protocollo scelto dal modello (nessuno se la risposta non si legge), quello dato e
    l'avviso del ripiego."""
    _note({"coach.decision.chosen": chosen, "coach.decision.given": given,
          "coach.decision.fallback_warning": warning, SpanAttributes.OUTPUT_VALUE: given})
