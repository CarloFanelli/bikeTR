"""La corsa del set di valutazione: il Coach sceglie il workout di oggi con il modello chat di .env
in ogni situazione di evaluation/situations.json, tante volte quante chiede --repeat, e scrive i
risultati in un file nuovo di eval-runs/, da portare in git e valutare su un altro computer. Dalla
cartella del progetto:

  docker compose run --rm coach-tools python -m app.evaluation [--repeat N] [--library]
  docker compose run --rm coach-tools python -m app.evaluation --search-only [--library]

Il Coach cerca nei paper di base (papers_index.json), così i punteggi restano confrontabili; con
--library cerca nella libreria dell'atleta: i paper di base meno quelli tolti, più quelli aggiunti.
Il file dei risultati dice quali paper sono stati cercati.

Ogni situazione parte dai numeri dell'atleta, già pronti, e passa dagli stessi passi di una
richiesta del Coach (paper, modello, scelta del protocollo), senza Strava né browser, e lascia
la sua traccia nel progetto evaluation di Phoenix. Il file si riscrive dopo ogni risposta: una
corsa fermata a metà tiene le risposte finite e resta segnata incompleta. Con un modello cloud la
spesa va nello stesso totale dell'app, e la corsa non parte se il costo massimo supera quanto resta
sotto il tetto.

Con --search-only ogni situazione fa solo la ricerca dei paper del Coach, e il comando stampa il
punteggio della ricerca: nessun modello chat, nessuna spesa, nessun file, nessuna traccia. Basta il
modello di ricerca, quindi funziona su qualsiasi computer, anche senza internet né Ollama."""

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app import library, papers, prompts, provider, search, tracing, workout
from app.errors import CoachError
from app.grading import SITUATIONS_FILE, grade, report, search_score, search_score_line
from app.live_check import INDEX_FILE, coach_answer, file_stem, index_from, money, summary, write_results
from app.project_files import replace_file
from app.spending import SPENDING_FILE, Prices, Spending, charge

RESULTS_DIR = Path("/project/eval-runs")


def affordable(prices: Prices, answers: int, spending: Spending) -> bool:
    """Stampa il costo massimo della corsa, ogni risposta alla stima alta, e dice se sta in quanto
    resta sotto il tetto. Un totale della spesa illeggibile ferma la corsa (CoachError)."""
    worst = answers * charge(prices, None, None)
    left = prices.limit - spending.total()
    print(f"Costo massimo: {money(worst)} per {answers} risposte; restano {money(max(left, 0))} sotto il tetto.")
    # Al miliardesimo di dollaro: un costo uguale a quanto resta deve bastare, anche quando la
    # virgola mobile lo sbaglia di poco.
    if round(worst - left, 9) > 0:
        print("✗ Il costo massimo supera quanto resta sotto il tetto di spesa: la corsa non parte. "
              "Alza CLOUD_SPENDING_LIMIT in .env o chiedi meno ripetizioni.", file=sys.stderr)
        return False
    return True


async def run_answers(situations: list[dict], repeat: int, chat: provider.ChatSettings, spending: Spending,
                      load_index, save) -> list[dict]:
    """Tutto il set, poi di nuovo per ogni ripetizione: una corsa fermata a metà ha già ogni
    situazione almeno una volta. Ogni risposta si salva e si stampa appena finisce."""
    answers, count = [], len(situations) * repeat
    for n in range(1, repeat + 1):
        for s in situations:
            async def ask(chat_client: httpx.AsyncClient, counted: Spending) -> dict:
                return await workout.from_context(s["context"], s["minutes"], lambda event: None, chat=chat,
                                                  chat_client=chat_client, embed=search.encode,
                                                  load_index=load_index, spending=counted)
            base = {"situation": s["name"], "repeat": n, "duration": s["minutes"]}
            answers.append(await coach_answer(base, chat, spending, ask, "della valutazione"))
            save(answers)
            print(f"[{len(answers)}/{count}] {summary(answers[-1])}", flush=True)
    return answers


def papers_searched(index_file: Path, with_library: bool):
    """L'indice da cercare in tutta la corsa, letto una volta all'inizio, e quali paper sono: "base" o
    "library" e i loro PMID. Un indice o una libreria rifiutati: PaperIndexError, prima di ogni file."""
    load = index_from(index_file)
    if with_library:
        load = library.saved_loader(load)
    index = asyncio.run(load())

    async def load_index() -> dict:
        return index
    return load_index, {"source": "library" if with_library else "base", "pmids": [p["pmid"] for p in index["papers"]]}


def search_only(situations_file: Path, load_index, searched: dict) -> int:
    """In ogni situazione la stessa ricerca dei paper del Coach, poi il punteggio della ricerca."""
    situations = json.loads(situations_file.read_text(encoding="utf-8"))

    async def search_all() -> dict[str, set[str]]:
        found = {}
        for s in situations:
            _, _, retrieved = await workout.find_papers(s["context"], s["minutes"], embed=search.encode,
                                                        load_index=load_index)
            found[s["name"]] = {p["pmid"] for p in retrieved}
        return found

    found = asyncio.run(search_all())
    print(f"Sola ricerca dei paper: {len(situations)} situazioni, modello di ricerca {search.SEARCH_MODEL}")
    source = "libreria" if searched["source"] == "library" else "paper di base"
    print(f"Paper cercati: {source}, {len(searched['pmids'])} paper ({', '.join(searched['pmids'])})")
    print(search_score_line(search_score(situations, found)))
    return 0


def main(argv: list[str] | None = None, *, results_dir: Path = RESULTS_DIR, index_file: Path = INDEX_FILE,
         situations_file: Path = SITUATIONS_FILE, spending: Spending | None = None,
         clock=lambda: datetime.now(timezone.utc)) -> int:
    """0 se almeno una risposta ha dato un workout, 1 se tutte sono fallite, 2 se la corsa non
    parte (ripetizioni non valide, .env sbagliato, costo massimo oltre il tetto: nessuna chiamata,
    nessun file; anche con l'indice dei paper o la libreria rifiutati), 130 se la si ferma con Ctrl+C."""
    parser = argparse.ArgumentParser(prog="python -m app.evaluation", description=__doc__.splitlines()[0])
    parser.add_argument("--repeat", default="1", help="quante volte rispondere a ogni situazione (1 se manca)")
    parser.add_argument("--search-only", action="store_true",
                        help="solo la ricerca dei paper, senza modello chat: stampa il punteggio della ricerca")
    parser.add_argument("--library", action="store_true",
                        help="cerca nella libreria (paper di base meno i tolti, più gli aggiunti) invece che nei paper di base")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[0-9]+", args.repeat) or int(args.repeat) < 1:
        print(f"✗ --repeat vuole un numero intero da 1 in su, non «{args.repeat}»", file=sys.stderr)
        return 2
    repeat = int(args.repeat)
    try:
        load_index, searched = papers_searched(index_file, args.library)
    except papers.PaperIndexError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 2
    # Prima di leggere .env: la sola ricerca non usa il modello chat, né la sua chiave.
    if args.search_only:
        return search_only(situations_file, load_index, searched)
    try:
        chat = provider.settings()
        spending = spending or Spending(SPENDING_FILE)
        situations = json.loads(situations_file.read_text(encoding="utf-8"))
        if chat.prices and not affordable(chat.prices, len(situations) * repeat, spending):
            return 2
    except CoachError as e:
        print(f"✗ {e.message}", file=sys.stderr)
        return 2

    started = clock()
    run = {"kind": "evaluation", "startedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"), "provider": chat.provider,
           "model": chat.model, "searchModel": search.SEARCH_MODEL, "promptVersion": prompts.prompt_version(),
           "papers": searched, "repeat": repeat, "complete": False, "totalCost": 0.0 if chat.prices else None, "answers": []}
    path = write_results(results_dir, file_stem(started, chat.model), run)

    def save(answers: list[dict], complete: bool = False) -> None:
        # Quanto la corsa ha aggiunto al totale della spesa, stime alte comprese.
        total = sum(a["charged"] for a in answers) if chat.prices else None
        run.update(answers=answers, totalCost=total, complete=complete)
        replace_file(path, json.dumps(run, ensure_ascii=False, indent=2) + "\n")

    traces = tracing.setup("evaluation")
    try:
        answers = asyncio.run(run_answers(situations, repeat, chat, spending, load_index, save))
    except KeyboardInterrupt:
        print(f"\nCorsa interrotta: le risposte finite sono in {results_dir.name}/{path.name}, "
              "segnata incompleta.", file=sys.stderr)
        return 130
    finally:
        # Le ultime tracce partono prima dell'uscita: con Phoenix spento, al massimo un secondo in più.
        traces.shutdown()
    # Completa solo se ogni risposta è arrivata senza errori.
    save(answers, complete=all("error" not in a for a in answers))
    print("\n".join(report(run, grade(run, situations), f"{results_dir.name}/{path.name}")))
    print(f"Costo totale: {money(run['totalCost'])}")
    print(f"Risultati in {results_dir.name}/{path.name}")
    return 0 if any("error" not in a for a in answers) else 1


if __name__ == "__main__":
    sys.exit(main())
