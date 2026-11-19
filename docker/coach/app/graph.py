"""Il Coach come grafo: corse, numeri, etichette delle corse, paper, bozza, controllo, consegna. Il controllo rimanda al
modello una bozza che non va bene, con i motivi, fino a MAX_DRAFTS bozze; poi consegna l'ultima,
o il ripiego. La schermata Coach e il controllo dal vivo entrano dalle corse, il set di valutazione
dalle etichette, con i numeri dell'atleta già pronti.

Lo stato del grafo tiene solo dati; quello che serve a una richiesta sola (gli eventi per il
browser, il client del modello, il totale della spesa) arriva nel contesto della corsa del grafo."""

import json
import time
from dataclasses import dataclass
from datetime import date, datetime
from typing import Awaitable, Callable, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from app import labels, prompts, provider, tracing
from app.chat import Accepted, ChatEnd, ModelError, ToolCall
from app.check import MAX_DRAFTS, SPENDING_CAP, check_draft, read_draft, retry_message, retry_step
from app.errors import CoachError
from app.metrics import coach_context
from app.spending import Spending, charge, cost
from app.strava import RideData, StravaRides
from app.workout import WorkoutRequest, decide, find_papers, read_index, search_papers, step


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
    # La data di oggi dell'atleta (AAAA-MM-GG): con le etichette accese dà i giorni passati da ogni uscita.
    today: str
    started: float
    rides: RideData
    ctx: dict
    index: dict
    retrieved: list
    # Una voce per bozza: risposta grezza, token, costo, addebito, se si è interrotta e il verdetto.
    drafts: list[dict]
    # Con il modello che etichetta: il suo nome, i secondi del passo labels, il costo e l'addebito.
    labelCall: dict
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


async def labels_node(state: State, runtime: Runtime[Request]) -> State:
    """Con COACH_RIDE_LABELS acceso, ogni corsa recente prende il suo tipo di uscita, con da dove
    viene: dal modello che etichetta, con COACH_RIDE_LABELS=model, o dalla regola, per ogni corsa che il
    modello non etichetta. Le cifre che servono e il prompt non mostra arrivano dalle corse di Strava; il
    set di valutazione le ha già nelle sue corse."""
    r, ctx = runtime.context, state["ctx"]
    if r.chat.ride_labels == "off" or not ctx["recentDays"]:
        return {}
    rides = ctx["recentDays"]
    if "rides" in state:
        facts = labels.ride_facts(state["rides"].activities, state["rides"].details, r.now_ms)
        rides = [{**ride, **fact} for ride, fact in zip(rides, facts)]
    started, turn = time.monotonic(), None
    with tracing.step("labels"):
        given, turn = await labels_of_model(r, rides, ctx) if r.chat.label else ({}, None)
        rides = [{**ride, "label": given[i][0], "labelSource": given[i][1]} if i in given else
                 {**ride, "label": labels.rule_label(ride, ctx["ftp"], ctx["lthr"]), "labelSource": "rule"}
                 for i, ride in enumerate(rides)]
        tracing.note_labels(rides)
    if state.get("today"):
        today = date.fromisoformat(state["today"])
        rides = [{**ride, "giorniFa": (today - date.fromisoformat(ride["data"])).days} for ride in rides]
    update = {"ctx": {**ctx, "recentDays": rides}}
    if r.chat.label:
        # Senza chiamata (etichette salvate, tetto raggiunto, modello spento) nulla da pagare.
        nothing = 0.0 if r.chat.label.prices else None
        update["labelCall"] = {"model": r.chat.label.model, "seconds": round(time.monotonic() - started, 1),
                               "cost": turn.cost if turn else nothing, "charged": turn.charged if turn else nothing}
    return update


async def labels_of_model(r: Request, rides: list[dict], ctx: dict) -> tuple[dict[int, tuple[str, str]], "Turn | None"]:
    """Etichetta e provenienza per posizione della corsa, con la risposta del modello se l'ha chiamato.
    Sulla schermata Coach le corse di Strava già etichettate dal modello di oggi usano l'etichetta
    salvata, le altre vanno al modello, e quelle che etichetta si salvano; le corse inventate
    (controllo dal vivo, set di valutazione) non si salvano."""
    label = r.chat.label
    store = r.rides.store if isinstance(r.rides, StravaRides) else None
    saved, generation = {}, None
    if store:
        # Letta prima della chiamata: un "Disconnetti da Strava" durante la chiamata ne blocca il salvataggio.
        generation = store.generation
        saved = await store.ride_labels([ride["id"] for ride in rides], label.model)
    given = {i: (saved[ride["id"]], "saved") for i, ride in enumerate(rides) if store and ride["id"] in saved}
    asked, turn = [i for i in range(len(rides)) if i not in given], None
    if asked:
        found, turn = await model_labels(label, r.spending, [rides[i] for i in asked], ctx)
        given |= {asked[k]: (found[k], "model") for k in found}
        if store and found:
            await store.save_ride_labels(generation, label.model, {rides[asked[k]]["id"]: found[k] for k in found})
    return given, turn


async def model_labels(label: provider.ChatSettings, spending: Spending, rides: list[dict],
                       ctx: dict) -> tuple[dict[int, str], "Turn | None"]:
    """Le etichette del modello che etichetta, per posizione della corsa, in una chiamata sola, e la sua
    risposta (None se non è arrivata). Nessuna con il tetto di spesa raggiunto, con il modello che non
    risponde o con la risposta tagliata: per quelle corse decide la regola, e la richiesta continua."""
    if label.prices and spending.total() >= label.prices.limit:
        tracing.note_label_skipped("tetto di spesa raggiunto")
        return {}, None
    with tracing.step("turn"):
        try:
            async with provider.client(label) as label_client:
                turn = await ask(label, label_client, spending,
                                 labels.model_messages(rides, ctx["ftp"], ctx["lthr"]), None)
        except ModelError as e:
            tracing.note_label_skipped(str(e))
            return {}, None
    return {} if turn.end.truncated else labels.read_answer(turn.text, len(rides)), turn


async def papers_node(state: State, runtime: Runtime[Request]) -> State:
    r = runtime.context
    if r.chat.search_mode == "model":
        # I paper li cerca il modello durante la bozza: qui solo l'indice, e nessun paper trovato.
        return {"started": time.monotonic(), "index": await read_index(r.load_index), "retrieved": [], "drafts": []}
    r.emit(step("papers", "Recupero paper rilevanti…"))
    started = time.monotonic()
    with tracing.step("papers"):
        index, query, retrieved = await find_papers(state["ctx"], state["duration"], embed=r.embed,
                                                    load_index=r.load_index)
        tracing.note_papers(query, retrieved)
    return {"started": started, "index": index, "retrieved": retrieved, "drafts": []}


def messages_for(state: State, search_mode: str) -> list[dict]:
    """Il prompt di sistema e i numeri dell'atleta; da una bozza rimandata in poi anche l'ultima
    risposta del modello e i motivi del controllo. Con il modo model ogni bozza precedente, con le
    sue ricerche: i passaggi trovati restano davanti al modello, che può citarli."""
    system = prompts.system_prompt(state["retrieved"], state["ctx"], state["duration"], search_mode)
    messages = [{"role": "system", "content": system},
                {"role": "user", "content": prompts.user_prompt(state["ctx"], state["duration"])}]
    earlier = state["drafts"] if search_mode == "model" else state["drafts"][-1:]
    for draft in earlier:
        messages += [*draft["turns"], {"role": "assistant", "content": draft["modelRaw"]},
                     {"role": "user", "content": retry_message(draft["verdict"])}]
    return messages


def merged(before: list, found: list) -> list:
    """I paper trovati finora e quelli di una nuova ricerca: un paper trovato di nuovo resta uno,
    con i suoi passaggi nuovi in fondo."""
    papers = [{**p, "passages": list(p["passages"])} for p in before]
    for paper in found:
        known = next((p for p in papers if p["pmid"] == paper["pmid"]), None)
        if known is None:
            papers.append({**paper, "passages": list(paper["passages"])})
        else:
            labels = {s["label"] for s in known["passages"]}
            known["passages"] += [s for s in paper["passages"] if s["label"] not in labels]
    return papers


async def model_search(r: Request, call: ToolCall, index: dict, draft: int,
                       number: int) -> tuple[str, list, str | None]:
    """Una ricerca chiesta dal modello, la `number`-esima della bozza `draft`: la risposta dello
    strumento, i paper trovati e il testo cercato (None se non ha cercato). Una ricerca vera è un passo
    sulla schermata Coach e nella traccia."""
    if call.name != prompts.SEARCH_TOOL["function"]["name"]:
        return prompts.SEARCH_UNKNOWN_TOOL, [], None
    arguments = call.arguments
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except (ValueError, RecursionError):
            arguments = None
    if not isinstance(arguments, dict) or not isinstance(arguments.get("text"), str):
        return prompts.SEARCH_BAD, [], None
    text = arguments["text"].strip()[:prompts.MAX_SEARCH_TEXT]
    if not text:
        return prompts.SEARCH_EMPTY, [], None
    r.emit(step("search", f"Il modello cerca: «{text}» (ricerca {number} di {prompts.MAX_SEARCHES})",
                search=number, of=prompts.MAX_SEARCHES))
    with tracing.step("search"):
        found = await search_papers(index, text, r.embed)
        tracing.note_search(draft, text, found)
    return "\n\n".join(prompts.paper_entry(p) for p in found) or prompts.SEARCH_NOTHING, found, text


@dataclass
class Turn:
    """Un giro di un modello, in una bozza o per le etichette: il testo, gli strumenti chiesti, la fine,
    il costo e quanto è andato nel totale della spesa."""
    text: str
    calls: list
    end: ChatEnd
    cost: float | None
    charged: float | None


async def model_turn(r: Request, messages: list, tools: list | None) -> Turn:
    """Un giro del modello chat, con un passo suo nella traccia: i giri di una bozza restano tutti, ognuno
    con i suoi messaggi, token e costo. Il testo arriva al browser man mano."""
    with tracing.step("turn"):
        try:
            return await ask(r.chat, r.chat_client, r.spending, messages, tools,
                             lambda text: r.emit({"type": "token", "text": text}))
        except ModelError as e:
            raise CoachError(502, "model", str(e)) from e


async def ask(chat: provider.ChatSettings, chat_client: httpx.AsyncClient, spending: Spending, messages: list,
              tools: list | None, on_text: Callable[[str], None] = lambda text: None) -> Turn:
    """Una risposta di un modello, il chat o quello che etichetta: il costo va nel totale della spesa
    e i messaggi, la risposta e i token nel passo aperto della traccia."""
    answer, calls, end, accepted = [], [], ChatEnd(None, None, False), False
    try:
        async for piece in provider.stream(chat, chat_client, messages, tools):
            if isinstance(piece, Accepted):
                accepted = True
            elif isinstance(piece, ChatEnd):
                end = piece
            elif isinstance(piece, ToolCall):
                calls.append(piece)
            else:
                answer.append(piece)
                on_text(piece)
    finally:
        model_raw, answer_cost = "".join(answer), cost(chat.prices, end.input_tokens, end.output_tokens)
        # Anche quando Stop annulla la richiesta: accettata la richiesta, il provider fa pagare
        # ciò che ha già scritto. Una richiesta rifiutata o mai arrivata non costa nulla.
        charged = None   # Ollama non costa nulla
        if chat.prices:
            charged = charge(chat.prices, end.input_tokens, end.output_tokens) if accepted else 0.0
            if accepted:
                spending.add(charged)
        tracing.note_model(chat, messages, model_raw, end, answer_cost, charged)
    return Turn(model_raw, calls, end, answer_cost, charged)


async def draft_node(state: State, runtime: Runtime[Request]) -> State:
    """Una bozza: un giro del modello; con il modo model, finché il modello chiede ricerche, il Coach
    risponde e il modello fa un altro giro. Dopo MAX_SEARCHES ricerche le richieste si rifiutano, e
    dopo altrettanti rifiuti la bozza finisce senza risposta."""
    r, chat = runtime.context, runtime.context.chat
    if not state["drafts"]:
        r.emit(step("model", "Il modello sta scegliendo il protocollo…"))
    else:
        attempt = len(state["drafts"]) + 1
        r.emit(step("draft", retry_step(state["drafts"][-1]["verdict"], attempt), attempt=attempt, of=MAX_DRAFTS))
    messages = messages_for(state, chat.search_mode)
    tools = [prompts.SEARCH_TOOL] if chat.search_mode == "model" else None
    turns, done, retrieved, searches, refused, capped = [], [], state["retrieved"], 0, 0, False
    searched = []   # le ricerche vere della bozza: testo e PMID trovati
    # La bozza che finisce senza risposta: dopo troppi rifiuti, o con il tetto di spesa raggiunto.
    unanswered = Turn("", [], ChatEnd(None, None, False), None, None)
    with tracing.step("draft"):
        while True:
            turn = await model_turn(r, messages + turns, tools)
            done.append(turn)
            if not turn.calls or turn.end.truncated:
                break
            answers = []
            for call in turn.calls:
                if searches >= prompts.MAX_SEARCHES:
                    refused += 1
                    answers.append(prompts.SEARCH_LIMIT)
                    continue
                searches += 1
                answer, found, text = await model_search(r, call, state["index"], len(state["drafts"]) + 1, searches)
                retrieved = merged(retrieved, found)
                if text is not None:
                    searched.append({"text": text, "papersFound": [p["pmid"] for p in found]})
                answers.append(answer)
            turns += provider.tool_turn(chat, turn.text, turn.calls, answers)
            if refused >= prompts.MAX_SEARCHES:
                turn = unanswered
                break
            # Con un modello cloud, nessun altro giro a tetto di spesa raggiunto: decide il ripiego.
            if chat.prices and r.spending.total() >= chat.prices.limit:
                turn, capped = unanswered, True
                break
    draft = {"modelRaw": turn.text, "truncated": turn.end.truncated, "turns": turns, "capped": capped,
             "searches": searched,
             "inputTokens": summed(t.end.input_tokens for t in done),
             "outputTokens": summed(t.end.output_tokens for t in done),
             "cost": summed(t.cost for t in done), "charged": summed(t.charged for t in done)}
    return {"drafts": [*state["drafts"], draft], "retrieved": retrieved}


async def check_node(state: State, runtime: Runtime[Request]) -> State:
    *earlier, last = state["drafts"]
    with tracing.step("check"):
        _, chosen = read_draft(last["modelRaw"], last["truncated"])
        verdict = (SPENDING_CAP if last["capped"] else
                   check_draft(last["modelRaw"], last["truncated"], state["ctx"], state["duration"], state["retrieved"]))
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


def summed(values):
    """La somma; sconosciuta se uno dei valori non è noto."""
    values = list(values)
    return None if None in values else sum(values)


def total(drafts: list[dict], key: str):
    """La somma di un valore su tutte le bozze; sconosciuta se una bozza non lo conosce."""
    return summed(d[key] for d in drafts)


async def deliver_node(state: State, runtime: Runtime[Request]) -> State:
    chat, drafts, last = runtime.context.chat, state["drafts"], state["drafts"][-1]
    with tracing.step("deliver"):
        decision = decide(last["modelRaw"], state["ctx"], state["duration"], state["index"], state["retrieved"],
                          last["truncated"], last["verdict"])
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
        # Le ricerche chieste dal modello, con la bozza in cui le ha chieste: nessuna con la ricerca fissa.
        "modelSearches": [{"draft": n, **s} for n, d in enumerate(drafts, 1) for s in d["searches"]],
        # Il tipo di ogni corsa recente e da dove viene: nessuno con le etichette spente.
        "rideLabels": [{"data": d["data"], "label": d["label"], "source": d["labelSource"]}
                       for d in state["ctx"]["recentDays"] if "label" in d],
        # Il modello che etichetta, a parte dal modello chat: i secondi e il costo della risposta non lo
        # contano, l'addebito della risposta nei file dei risultati sì.
        "labelModel": state.get("labelCall"),
        "drafts": [{"protocolId": d["protocolId"], "modelRaw": d["modelRaw"], "truncated": d["truncated"],
                    "inputTokens": d["inputTokens"], "outputTokens": d["outputTokens"], "cost": d["cost"],
                    "check": {"ok": d["verdict"].ok, "causes": list(d["verdict"].causes),
                              "reasons": list(d["verdict"].reasons)}}
                   for d in drafts]}}


def entry(state: State) -> str:
    """Chi ha già i numeri dell'atleta entra dalle etichette, gli altri dalle corse."""
    return "labels" if "ctx" in state else "rides"


def build() -> StateGraph:
    graph = StateGraph(State, context_schema=Request)
    for name, node in (("rides", rides_node), ("metrics", metrics_node), ("labels", labels_node), ("papers", papers_node),
                       ("draft", draft_node), ("check", check_node), ("deliver", deliver_node)):
        graph.add_node(name, node)
    graph.add_conditional_edges(START, entry, ["rides", "labels"])
    graph.add_edge("rides", "metrics")
    graph.add_edge("metrics", "labels")
    graph.add_edge("labels", "papers")
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
    today = datetime.fromtimestamp(now_ms / 1000, req.tz).date().isoformat()
    state = await COACH.ainvoke({"duration": req.duration, "today": today}, context=Request(
        emit, chat, chat_client, embed, load_index, spending, req=req, rides=rides, now_ms=now_ms))
    data = state["rides"]
    emit({"type": "result", **state["result"],
          "rides": {"fromSaved": data.from_saved, "downloadedAt": data.downloaded_at,
                    "missingDetails": data.missing_details}})


async def from_context(ctx: dict, duration: int, emit: Callable[[dict], None], *, chat: provider.ChatSettings,
                       chat_client: httpx.AsyncClient, embed: Callable[[str], Awaitable[list]],
                       load_index: Callable[[], Awaitable[dict]], spending: Spending,
                       today: str | None = None) -> dict:
    """Dai numeri dell'atleta già pronti al workout: il set di valutazione entra qui, con la data di
    oggi della situazione quando una sua regola legge i giorni passati dalle uscite."""
    state = await COACH.ainvoke({"ctx": ctx, "duration": duration, **({"today": today} if today else {})},
                                context=Request(emit, chat, chat_client, embed, load_index, spending))
    return state["result"]
