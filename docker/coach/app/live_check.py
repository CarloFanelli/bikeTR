"""Il controllo dal vivo: il Coach sceglie il workout di oggi con il modello chat di .env in 3
situazioni inventate, senza Strava né browser, e scrive i risultati in un file nuovo di
live-checks/, da portare in git e valutare su un altro computer. Dalla cartella del progetto:

  docker compose run --rm coach-tools python -m app.live_check

Ogni situazione passa dagli stessi passi di una richiesta del Coach (contesto, paper,
modello, scelta del protocollo). Con un modello cloud la spesa va nello stesso totale
dell'app e si ferma allo stesso tetto. Le corse salvate dal servizio Coach restano intatte:
questo modulo non importa app.main, che all'avvio prepara l'accesso a Strava e a /data."""

import argparse
import asyncio
import itertools
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from app import papers, provider, search, workout
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
        return self.data


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


def record(base: dict, result: dict) -> dict:
    """Quello che serve per valutare il modello. Campi scritti uno per uno: le impostazioni,
    che contengono la chiave, non finiscono mai nel file."""
    parsed = workout.parse_model_json(result["modelRaw"])
    cited = parsed.get("paperUsati") if isinstance(parsed, dict) else None
    return {**base, "protocolId": result["protocolId"], "fellBack": result["fellBack"],
            "truncated": result["truncated"], "jsonReadable": isinstance(parsed, dict),
            "papersFound": [{"pmid": p["pmid"], "title": p["title"], "score": p["score"]}
                            for p in result["retrievedPapers"]],
            # I paper che il modello ha scritto di aver usato, come li ha scritti.
            "papersCited": [js_str(p) for p in cited] if isinstance(cited, list) else [],
            "inputTokens": result["inputTokens"], "outputTokens": result["outputTokens"],
            "cost": result["cost"], "seconds": result["seconds"], "modelRaw": result["modelRaw"]}


async def situation(name: str, duration: int, made_up: dict, chat: provider.ChatSettings, spending: Spending,
                    load_index) -> dict:
    base = {"situation": name, "duration": duration, "provider": chat.provider, "model": chat.model}
    rides = MadeUpRides(made_up)
    events = []
    try:
        if chat.prices:
            spending.check(chat.prices.limit)
        req = workout.parse_request({"duration": duration, "timeZone": TIME_ZONE,
                                     "profile": made_up["profiles"][name]})
        async with provider.client(chat) as chat_client:
            await workout.run(req, events.append, rides=rides, chat=chat, chat_client=chat_client,
                              embed=search.encode, load_index=load_index, now_ms=rides.now_ms, spending=spending)
    except CoachError as e:
        return {**base, "error": e.code, "message": e.message}
    return record(base, events[-1])


def money(dollars: float | None) -> str:
    return "—" if dollars is None else f"${dollars:.4f}"


def tokens(n: int | None) -> str:
    return "—" if n is None else str(n)


def summary(r: dict) -> str:
    head = f"{r['situation']} ({r['duration']} min): "
    if "error" in r:
        return head + f"errore: {r['message']}"
    return (head + f"{r['protocolId']} · ripiego: {'sì' if r['fellBack'] else 'no'} · {r['seconds']:.1f}s · "
            f"token: {tokens(r['inputTokens'])} in, {tokens(r['outputTokens'])} out · costo: {money(r['cost'])}")


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
    records = asyncio.run(run_situations(chat, spending or Spending(SPENDING_FILE), index_from(index_file)))
    costs = [r["cost"] for r in records if r.get("cost") is not None]
    run = {"startedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"), "provider": chat.provider, "model": chat.model,
           "searchModel": search.SEARCH_MODEL, "totalCost": sum(costs) if costs else None, "situations": records}
    path = write_results(results_dir, file_stem(started, chat.model), run)
    print(f"Costo totale: {money(run['totalCost'])}")
    print(f"Risultati in {results_dir.name}/{path.name}")
    return 0 if any("error" not in r for r in records) else 1


if __name__ == "__main__":
    sys.exit(main())
