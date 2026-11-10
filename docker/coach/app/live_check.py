"""Il controllo dal vivo: il Coach sceglie il workout di oggi con il modello chat di .env in 3
situazioni inventate, senza Strava né browser, e scrive i risultati in un file nuovo di
live-checks/, da portare in git e valutare su un altro computer. Dalla cartella del progetto:

  docker compose run --rm coach-tools python -m app.live_check

Ogni situazione passa dagli stessi passi di una richiesta del Coach (contesto, paper,
modello, scelta del protocollo) e lascia la sua traccia nel progetto live-check di Phoenix.
Con un modello cloud la spesa va nello stesso totale dell'app e si ferma allo stesso tetto.
Le corse salvate dal servizio Coach restano intatte: questo modulo non importa app.main, che
all'avvio prepara l'accesso a Strava e a /data."""

import argparse
import asyncio
import itertools
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

import httpx

from app import check, graph, papers, provider, search, tracing, workout
from app.errors import CoachError
from app.jscompat import instant_ms, js_str
from app.metrics import ride_details
from app.project_files import give_to_folder_owner
from app.spending import SPENDING_FILE, Spending
from app.strava import RideData, ride_data

RESULTS_DIR = Path("/project/live-checks")
INDEX_FILE = Path("/project/papers_index.json")
# Le stesse corse inventate dei test: attività, dettagli secondo per secondo e profili.
MADE_UP_RIDES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "rides.json"
TIME_ZONE = "Europe/Rome"
# Le 3 situazioni: il profilo atleta delle corse inventate e i minuti a disposizione.
SITUATIONS = (("base", 60), ("ftp280", 90), ("noLthr", 45))


def strava_streams(blocks: dict) -> dict:
    """Stream in formato Strava dai blocchi [valore, secondi] delle corse inventate."""
    return {k: {"data": [v for v, n in b for _ in range(n)]} for k, b in blocks.items()}


class MadeUpRides:
    """Al posto di Strava: sempre le stesse corse, nessuna rete, niente scritto in /data."""

    def __init__(self, made_up: dict):
        self.now_ms = instant_ms(made_up["now"])
        details = {int(i): ride_details(strava_streams(s)) for i, s in made_up["streams"].items()}
        self.data = ride_data({"activities": made_up["activities"], "details": details,
                               "downloaded_at": self.now_ms}, from_saved=False)

    async def refresh(self, now_ms: float, progress=None) -> RideData:
        tracing.note_made_up_rides()
        return self.data


class SituationSpending(Spending):
    """Lo stesso totale dell'app, più quanto vi aggiunge una sola risposta: anche la stima
    alta di una risposta senza token o interrotta, che il costo della risposta non mostra."""

    def __init__(self, path: Path):
        super().__init__(path)
        self.charged = 0.0

    def add(self, dollars: float) -> float:
        total = super().add(dollars)
        self.charged += dollars
        return total


def index_from(path: Path):
    """L'indice dei paper letto dal file del progetto: nginx, da cui lo legge il servizio,
    qui non c'è. Gli stessi controlli del servizio (papers.check_index)."""
    async def load_index() -> dict:
        try:
            index = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as e:
            raise papers.PaperIndexError(f"{path.name} non trovato. {papers.RESTORE}") from e
        except (OSError, ValueError) as e:
            raise papers.PaperIndexError(f"{path.name} illeggibile. {papers.RESTORE}") from e
        return papers.check_index(index)
    return load_index


def record(base: dict, result: dict, charged: float | None) -> dict:
    """Quello che serve per valutare il modello. Campi scritti uno per uno: le impostazioni,
    che contengono la chiave, non finiscono mai nel file."""
    parsed = check.parse_model_json(result["modelRaw"])
    cited = parsed.get("passaggiUsati") if isinstance(parsed, dict) else None
    return {**base, "protocolId": result["protocolId"], "fellBack": result["fellBack"],
            "truncated": result["truncated"], "jsonReadable": isinstance(parsed, dict),
            "papersFound": [{"pmid": p["pmid"], "title": p["title"], "score": p["score"]}
                            for p in result["retrievedPapers"]],
            # I passaggi dati al modello: etichetta e punteggio, non il testo, che l'etichetta ritrova
            # nell'indice. Il voto ci riconosce un'etichetta inventata.
            "passagesFound": [s for p in result["retrievedPapers"] for s in p["passages"]],
            # Le etichette dei passaggi che il modello ha scritto di aver usato, come le ha scritte.
            "papersCited": [js_str(p) for p in cited] if isinstance(cited, list) else [],
            "inputTokens": result["inputTokens"], "outputTokens": result["outputTokens"],
            "cost": result["cost"], "charged": charged, "seconds": result["seconds"], "modelRaw": result["modelRaw"]}


async def coach_answer(base: dict, chat: provider.ChatSettings, spending: Spending,
                       ask: Callable[[httpx.AsyncClient, Spending], Awaitable[dict]], command: str) -> dict:
    """Una risposta del Coach per il file dei risultati: `ask` la chiede con il client del modello
    e il totale della spesa, dopo il controllo del tetto. Un errore diventa la riga del file;
    `command` lo nomina nel messaggio di un errore inatteso ("del controllo dal vivo"). Ogni
    risposta lascia la sua traccia, con la situazione e la ripetizione di `base`."""
    counted = SituationSpending(spending.path)
    result, failure = None, None
    try:
        with tracing.request(base["duration"], situation=base["situation"], repeat=base.get("repeat")):
            if chat.prices:
                counted.check(chat.prices.limit)
            async with provider.client(chat) as chat_client:
                result = await ask(chat_client, counted)
    except CoachError as e:
        failure = {"error": e.code, "message": e.message}
    except Exception as e:
        # Come il servizio a ogni richiesta: fallisce questa risposta, non il comando. Il
        # messaggio finisce nel file che va in git, quindi senza la chiave.
        text = str(e).replace(chat.key, "***") if chat.key else str(e)
        failure = {"error": "internal", "message": f"Errore interno {command} ({type(e).__name__}): {text}"}
    charged = counted.charged if chat.prices else None
    if failure:
        return {**base, **failure, "charged": charged}
    return record(base, result, charged)


async def situation(name: str, duration: int, made_up: dict, chat: provider.ChatSettings, spending: Spending,
                    load_index) -> dict:
    rides = MadeUpRides(made_up)

    async def ask(chat_client: httpx.AsyncClient, counted: Spending) -> dict:
        req = workout.parse_request({"duration": duration, "timeZone": TIME_ZONE,
                                     "profile": made_up["profiles"][name]})
        events = []
        await graph.run(req, events.append, rides=rides, chat=chat, chat_client=chat_client,
                          embed=search.encode, load_index=load_index, now_ms=rides.now_ms, spending=counted)
        return events[-1]
    return await coach_answer({"situation": name, "duration": duration, "provider": chat.provider,
                               "model": chat.model}, chat, spending, ask, "del controllo dal vivo")


def money(dollars: float | None) -> str:
    return "—" if dollars is None else f"${dollars:.4f}"


def tokens(n: int | None) -> str:
    return "—" if n is None else str(n)


def summary(r: dict) -> str:
    head = f"{r['situation']} ({r['duration']} min): "
    # Senza un costo suo (token mancanti, errore) la risposta può aver aggiunto la stima alta.
    charged = f" · addebitati: {money(r['charged'])}" if r["charged"] and r.get("cost") is None else ""
    if "error" in r:
        return head + f"errore: {r['message']}" + charged
    return (head + f"{r['protocolId']} · ripiego: {'sì' if r['fellBack'] else 'no'} · {r['seconds']:.1f}s · "
            f"token: {tokens(r['inputTokens'])} in, {tokens(r['outputTokens'])} out · costo: {money(r['cost'])}"
            + charged)


async def run_situations(chat: provider.ChatSettings, spending: Spending, load_index) -> list[dict]:
    """Una situazione dopo l'altra, controllando il tetto prima di ognuna; ogni riga si
    stampa appena la sua situazione finisce."""
    made_up = json.loads(MADE_UP_RIDES.read_text(encoding="utf-8"))
    records = []
    for name, duration in SITUATIONS:
        records.append(await situation(name, duration, made_up, chat, spending, load_index))
        print(summary(records[-1]), flush=True)
    return records


def file_stem(started: datetime, model: str) -> str:
    # ":" e "/" non vanno bene in un nome di file: il nome intero resta dentro il file.
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", model).strip("-.") or "modello"
    return f"{started:%Y-%m-%d_%H-%M-%S}_{safe}"


def write_results(results_dir: Path, stem: str, run: dict) -> Path:
    """Un file nuovo per ogni esecuzione: due nello stesso secondo prendono -2, -3…, e un
    file già scritto non si sovrascrive mai."""
    if not results_dir.exists():
        results_dir.mkdir()
        give_to_folder_owner(results_dir)
    text = json.dumps(run, ensure_ascii=False, indent=2) + "\n"
    for n in itertools.count(1):
        path = results_dir / (f"{stem}.json" if n == 1 else f"{stem}-{n}.json")
        try:
            with open(path, "x", encoding="utf-8") as f:
                f.write(text)
        except FileExistsError:
            continue
        give_to_folder_owner(path)
        return path


def main(argv: list[str] | None = None, *, results_dir: Path = RESULTS_DIR, index_file: Path = INDEX_FILE,
         spending: Spending | None = None, clock=lambda: datetime.now(timezone.utc)) -> int:
    """0 se almeno una situazione ha dato un workout, 1 se tutte sono fallite, 2 con un .env
    sbagliato (nessuna chiamata, nessun file)."""
    argparse.ArgumentParser(prog="python -m app.live_check", description=__doc__.splitlines()[0]).parse_args(argv)
    try:
        chat = provider.settings()
    except CoachError as e:
        print(f"✗ {e.message}", file=sys.stderr)
        return 2
    started = clock()
    traces = tracing.setup("live-check")
    try:
        records = asyncio.run(run_situations(chat, spending or Spending(SPENDING_FILE), index_from(index_file)))
    finally:
        # Le ultime tracce partono prima dell'uscita: con Phoenix spento, al massimo un secondo in più.
        traces.shutdown()
    # Quanto il controllo ha aggiunto al totale della spesa, stime alte comprese.
    total = sum(r["charged"] for r in records) if chat.prices else None
    run = {"startedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"), "provider": chat.provider, "model": chat.model,
           "searchModel": search.SEARCH_MODEL, "totalCost": total, "situations": records}
    path = write_results(results_dir, file_stem(started, chat.model), run)
    print(f"Costo totale: {money(run['totalCost'])}")
    print(f"Risultati in {results_dir.name}/{path.name}")
    return 0 if any("error" not in r for r in records) else 1


if __name__ == "__main__":
    sys.exit(main())
