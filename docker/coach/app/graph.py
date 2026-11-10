"""Il Coach come grafo: corse, numeri, paper, bozza, controllo, consegna. Il controllo rimanda al
modello una bozza che non va bene, con i motivi, fino a MAX_DRAFTS bozze; poi consegna l'ultima,
o il ripiego. La schermata Coach e il controllo dal vivo entrano dalle corse, il set di valutazione
dai paper, con i numeri dell'atleta già pronti.

Lo stato del grafo tiene solo dati; quello che serve a una richiesta sola (gli eventi per il
browser, il client del modello, il totale della spesa) arriva nel contesto della corsa del grafo."""

import time
from dataclasses import dataclass
from typing import Awaitable, Callable, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from app import prompts, provider, tracing
from app.chat import Accepted, ChatEnd, ModelError
from app.check import MAX_DRAFTS, read_draft, retry_message, usable
from app.errors import CoachError
from app.metrics import coach_context
from app.spending import Spending, charge, cost
from app.strava import RideData, StravaRides
from app.workout import WorkoutRequest, decide, find_papers, step


@dataclass(frozen=True)
class Request:
    """Quello che serve a una richiesta e non sta nello stato: chi riceve gli eventi, il modello, la
    ricerca, la spesa. `req` e `rides` solo per chi entra dalle corse."""
    emit: Callable[[dict], None]
    chat: provider.ChatSettings
    chat_client: httpx.AsyncClient
    embed: Callable[[str], Awaitable[list]]
    load_index: Callable[[], Awaitable[dict]]
    spending: Spending
    req: WorkoutRequest | None = None
    rides: StravaRides | None = None
    now_ms: float = 0


class State(TypedDict, total=False):
    duration: int
    started: float
    rides: RideData
    ctx: dict
    index: dict
    retrieved: list
    # Una voce per bozza: risposta grezza, token, costo, addebito, se si è interrotta e il verdetto.
    drafts: list[dict]
    result: dict


async def rides_node(state: State, runtime: Runtime[Request]) -> State:
    r = runtime.context
    r.emit(step("rides", "Scarico le corse da Strava…"))
    with tracing.step("rides"):
        data = await r.rides.refresh(r.now_ms, progress=lambda done, total: r.emit(
            step("details", f"Scarico dettagli corse {done}/{total}", done=done, total=total)))
        tracing.note_rides(data.from_saved)
    return {"rides": data}


async def metrics_node(state: State, runtime: Runtime[Request]) -> State:
    r, data = runtime.context, state["rides"]
    with tracing.step("metrics"):
        ctx = coach_context(data.activities, data.details, r.req.profile, r.now_ms, r.req.tz)
        tracing.note_metrics(ctx)
    r.emit({"type": "context", "context": ctx})
    return {"ctx": ctx}


async def papers_node(state: State, runtime: Runtime[Request]) -> State:
    r = runtime.context
    r.emit(step("papers", "Recupero paper rilevanti…"))
    started = time.monotonic()
    with tracing.step("papers"):
        index, query, retrieved = await find_papers(state["ctx"], state["duration"], embed=r.embed,
                                                    load_index=r.load_index)
        tracing.note_papers(query, retrieved)
    return {"started": started, "index": index, "retrieved": retrieved, "drafts": []}


def messages_for(state: State) -> list[dict]:
    """Il prompt di sistema e i numeri dell'atleta; da una bozza rimandata in poi anche l'ultima
    risposta del modello e i motivi del controllo."""
    messages = [{"role": "system", "content": prompts.system_prompt(state["retrieved"])},
                {"role": "user", "content": prompts.user_prompt(state["ctx"], state["duration"])}]
    if state["drafts"]:
        last = state["drafts"][-1]
        messages += [{"role": "assistant", "content": last["modelRaw"]},
                     {"role": "user", "content": retry_message(last["verdict"])}]
    return messages


async def draft_node(state: State, runtime: Runtime[Request]) -> State:
    r, chat = runtime.context, runtime.context.chat
    if not state["drafts"]:
        r.emit(step("model", "Il modello sta scegliendo il protocollo…"))
    messages = messages_for(state)
    answer, end, accepted = [], ChatEnd(None, None, False), False
    with tracing.step("draft"):
        try:
            async for piece in provider.stream(chat, r.chat_client, messages):
                if isinstance(piece, Accepted):
                    accepted = True
                elif isinstance(piece, ChatEnd):
                    end = piece
                else:
                    answer.append(piece)
                    r.emit({"type": "token", "text": piece})
        except ModelError as e:
            raise CoachError(502, "model", str(e)) from e
        finally:
            model_raw, answer_cost = "".join(answer), cost(chat.prices, end.input_tokens, end.output_tokens)
            # Anche quando Stop annulla la richiesta: accettata la richiesta, il provider fa pagare
            # ciò che ha già scritto. Una richiesta rifiutata o mai arrivata non costa nulla.
            charged = None   # Ollama non costa nulla
            if chat.prices:
                charged = charge(chat.prices, end.input_tokens, end.output_tokens) if accepted else 0.0
                if accepted:
                    r.spending.add(charged)
            tracing.note_model(chat, messages, model_raw, end, answer_cost, charged)
    draft = {"modelRaw": model_raw, "truncated": end.truncated, "inputTokens": end.input_tokens,
             "outputTokens": end.output_tokens, "cost": answer_cost, "charged": charged}
    return {"drafts": [*state["drafts"], draft]}


async def check_node(state: State, runtime: Runtime[Request]) -> State:
    *earlier, last = state["drafts"]
    with tracing.step("check"):
        parsed, chosen = read_draft(last["modelRaw"], last["truncated"])
        verdict = usable(parsed, chosen, last["truncated"], state["duration"])
        tracing.note_check(len(state["drafts"]), verdict.causes)
    return {"drafts": [*earlier, {**last, "protocolId": chosen, "verdict": verdict}]}


def after_check(state: State, runtime: Runtime[Request]) -> str:
    """Un'altra bozza solo se l'ultima è stata rifiutata, ne restano e, con un modello cloud, il
    totale della spesa è sotto il tetto."""
    drafts, prices = state["drafts"], runtime.context.chat.prices
    if drafts[-1]["verdict"].ok or len(drafts) >= MAX_DRAFTS:
        return "deliver"
    if prices and runtime.context.spending.total() >= prices.limit:
        return "deliver"
    return "draft"


def total(drafts: list[dict], key: str):
    """La somma di un valore su tutte le bozze; sconosciuta se una bozza non lo conosce."""
    values = [d[key] for d in drafts]
    return None if None in values else sum(values)


async def deliver_node(state: State, runtime: Runtime[Request]) -> State:
    chat, drafts, last = runtime.context.chat, state["drafts"], state["drafts"][-1]
    with tracing.step("deliver"):
        decision = decide(last["modelRaw"], state["ctx"], state["duration"], state["index"], state["retrieved"],
                          last["truncated"])
    retrieved = state["retrieved"]
    return {"result": {
        **decision,
        # I passaggi dati al modello, con etichetta e punteggio: i file dei risultati li registrano.
        "retrievedPapers": [{"pmid": p["pmid"], "title": p["title"], "authors": p["authors"],
                             "year": p["year"], "score": p["score"],
                             "passages": [{"label": s["label"], "score": s["score"]} for s in p["passages"]]}
                            for p in retrieved],
        "provider": chat.provider, "model": chat.model, "seconds": round(time.monotonic() - state["started"], 1),
        "inputTokens": total(drafts, "inputTokens"), "outputTokens": total(drafts, "outputTokens"),
        "truncated": last["truncated"], "cost": total(drafts, "cost"), "modelRaw": last["modelRaw"],
        "drafts": [{"protocolId": d["protocolId"], "modelRaw": d["modelRaw"], "truncated": d["truncated"],
                    "inputTokens": d["inputTokens"], "outputTokens": d["outputTokens"], "cost": d["cost"],
                    "check": {"ok": d["verdict"].ok, "causes": list(d["verdict"].causes),
                              "reasons": list(d["verdict"].reasons)}}
                   for d in drafts]}}


def entry(state: State) -> str:
    """Chi ha già i numeri dell'atleta entra dai paper, gli altri dalle corse."""
    return "papers" if "ctx" in state else "rides"


def build() -> StateGraph:
    graph = StateGraph(State, context_schema=Request)
    for name, node in (("rides", rides_node), ("metrics", metrics_node), ("papers", papers_node),
                       ("draft", draft_node), ("check", check_node), ("deliver", deliver_node)):
        graph.add_node(name, node)
    graph.add_conditional_edges(START, entry, ["rides", "papers"])
    graph.add_edge("rides", "metrics")
    graph.add_edge("metrics", "papers")
    graph.add_edge("papers", "draft")
    graph.add_edge("draft", "check")
    graph.add_conditional_edges("check", after_check, ["draft", "deliver"])
    graph.add_edge("deliver", END)
    return graph


COACH = build().compile()


async def run(req: WorkoutRequest, emit: Callable[[dict], None], *, rides: StravaRides,
              chat: provider.ChatSettings, chat_client: httpx.AsyncClient,
              embed: Callable[[str], Awaitable[list]], load_index: Callable[[], Awaitable[dict]],
              now_ms: float, spending: Spending) -> None:
    """La richiesta della schermata Coach: dalle corse di Strava al risultato, evento per evento."""
    state = await COACH.ainvoke({"duration": req.duration}, context=Request(
        emit, chat, chat_client, embed, load_index, spending, req=req, rides=rides, now_ms=now_ms))
    data = state["rides"]
    emit({"type": "result", **state["result"],
          "rides": {"fromSaved": data.from_saved, "downloadedAt": data.downloaded_at,
                    "missingDetails": data.missing_details}})


async def from_context(ctx: dict, duration: int, emit: Callable[[dict], None], *, chat: provider.ChatSettings,
                       chat_client: httpx.AsyncClient, embed: Callable[[str], Awaitable[list]],
                       load_index: Callable[[], Awaitable[dict]], spending: Spending) -> dict:
    """Dai numeri dell'atleta già pronti al workout: il set di valutazione entra qui."""
    state = await COACH.ainvoke({"ctx": ctx, "duration": duration},
                                context=Request(emit, chat, chat_client, embed, load_index, spending))
    return state["result"]
