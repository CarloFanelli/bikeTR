"""Il voto delle corse del set di valutazione: per ogni file di eval-runs/ i punteggi contro il set di
oggi, senza chiamare nessun modello né la rete, e una riga per la tabella del README. Dalla
cartella del progetto:

  docker compose run --rm coach-tools python -m app.grading eval-runs/FILE.json [altri file…]

Ogni risposta si giudica da quello che il modello ha scritto, non da quello che il Coach ne ha
fatto: il Coach sostituisce una scelta che non entra nei minuti e aggiunge da sé il paper del
protocollo ai citati. Le risposte con un errore si contano a parte, fuori dai punteggi. Lo stesso
file dà sempre lo stesso voto; se il set cambia, i file vecchi si rivalutano senza rifare la corsa."""

import argparse
import json
import re
import statistics
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from app.jscompat import js_round, js_str
from app.live_check import money
from app.protocols import PROTOCOLS
from app.workout import parse_model_json

PROJECT_DIR = Path("/project")
SITUATIONS_FILE = Path(__file__).resolve().parents[1] / "evaluation" / "situations.json"
# Un PMID nel testo della risposta: il prompt chiede [PMID:n], i modelli scrivono anche "PMID n".
PMID_IN_TEXT = re.compile(r"PMID\W{0,3}(\d+)", re.IGNORECASE)
TABLE_HEADER = ("| Model | Prompt | Rules followed | Readable JSON | Invented citations | Support cited "
                "| Support found | Fallback | Median seconds | Cost per answer | Results file |",
                "|---|---|---|---|---|---|---|---|---|---|---|")


class Refused(Exception):
    """Un file che non si può valutare: il messaggio dice perché."""


@dataclass
class Scores:
    answered: int
    failed: int
    # Ogni punteggio è (risposte che lo soddisfano, risposte su cui si misura).
    rules_followed: tuple[int, int]
    readable: tuple[int, int]
    invented: tuple[int, int]
    support_cited: tuple[int, int]
    support_found: tuple[int, int]
    fallback: tuple[int, int]
    median_seconds: float | None
    cost_per_answer: float | None
    skipped: list[str]
    not_run: list[str]


def model_choice(answer: dict) -> tuple[dict | None, str | None]:
    """Il JSON della risposta e il protocollo scritto dal modello, letti come li legge il Coach:
    nessuno dei due da una risposta troncata o illeggibile."""
    parsed = None if answer["truncated"] else parse_model_json(answer["modelRaw"])
    if not isinstance(parsed, dict):
        return None, None
    return parsed, js_str(parsed.get("protocolId"))


def cited_pmids(parsed: dict | None, model_raw: str) -> set[str]:
    """I PMID che il modello ha citato: le cifre di ogni voce di paperUsati (un numero e il suo
    testo contano uguale, una volta sola) e ogni PMID scritto nel testo, razionale compreso."""
    listed = parsed.get("paperUsati") if parsed else None
    from_list = {d for p in listed for d in re.findall(r"\d+", js_str(p))} if isinstance(listed, list) else set()
    return from_list | set(PMID_IN_TEXT.findall(model_raw))


def grade(run: dict, situations: list[dict]) -> Scores:
    allowed = {s["name"]: s["allowed"] for s in situations}
    in_set = [a for a in run["answers"] if a["situation"] in allowed]
    answered = [a for a in in_set if "error" not in a]
    n = len(answered)
    count = Counter()
    for a in answered:
        parsed, choice = model_choice(a)
        given = {p["pmid"] for p in a["papersFound"]}
        cited = cited_pmids(parsed, a["modelRaw"])
        count["followed"] += choice in allowed[a["situation"]]
        count["readable"] += parsed is not None
        count["invented"] += bool(cited - given)
        count["fallback"] += a["fellBack"]
        # Il paper di supporto del protocollo scelto dal modello; i protocolli di pratica non ne hanno.
        source = PROTOCOLS[choice].source_pmid if choice in PROTOCOLS else None
        if source:
            count["supported"] += 1
            if source in given:
                count["given"] += 1
                count["cited"] += source in cited
    charges = [a["charged"] for a in in_set]
    ran = {a["situation"] for a in run["answers"]}
    return Scores(answered=n, failed=len(in_set) - n,
                  rules_followed=(count["followed"], n), readable=(count["readable"], n),
                  invented=(count["invented"], n), support_cited=(count["cited"], count["given"]),
                  support_found=(count["given"], count["supported"]), fallback=(count["fallback"], n),
                  median_seconds=statistics.median(a["seconds"] for a in answered) if answered else None,
                  # Quanto ha aggiunto al totale della spesa ogni risposta, anche quelle fallite; con Ollama niente.
                  cost_per_answer=sum(charges) / len(charges) if charges and None not in charges else None,
                  skipped=sorted(ran - allowed.keys()), not_run=[name for name in allowed if name not in ran])


def ratio(score: tuple[int, int]) -> str:
    hits, total = score
    return "—" if total == 0 else f"{js_round(100 * hits / total)}% ({hits}/{total})"


def seconds(value: float | None) -> str:
    return "—" if value is None else f"{value:.1f}"


def report(run: dict, scores: Scores, shown: str) -> list[str]:
    """I punteggi di una corsa, una riga ciascuno, sotto il nome del file."""
    lines = [f"{shown} — {run['model']} · prompt {run['promptVersion']} · "
             f"corsa {'completa' if run['complete'] else 'incompleta'}",
             f"  Risposte valutate: {scores.answered} · errori: {scores.failed}",
             f"  Regole seguite: {ratio(scores.rules_followed)}",
             f"  JSON leggibile: {ratio(scores.readable)}",
             f"  Citazioni inventate: {ratio(scores.invented)}",
             f"  Paper di supporto citato: {ratio(scores.support_cited)}",
             f"  Paper di supporto trovato dalla ricerca: {ratio(scores.support_found)}",
             f"  Ripiego usato: {ratio(scores.fallback)}",
             f"  Secondi (mediana): {seconds(scores.median_seconds)}",
             f"  Costo per risposta: {money(scores.cost_per_answer)}"]
    if scores.skipped:
        lines.append("  Saltate, non più nel set: " + ", ".join(scores.skipped))
    if scores.not_run:
        lines.append("  Non eseguite: " + ", ".join(scores.not_run))
    return lines


def table_row(run: dict, scores: Scores, link: str) -> str:
    """La riga della tabella del README, con il link al file; una corsa incompleta lo dice."""
    file = f"[{Path(link).name}]({link})" + ("" if run["complete"] else " (incompleta)")
    cells = [run["model"], run["promptVersion"], ratio(scores.rules_followed), ratio(scores.readable),
             ratio(scores.invented), ratio(scores.support_cited), ratio(scores.support_found),
             ratio(scores.fallback), seconds(scores.median_seconds), money(scores.cost_per_answer), file]
    return "| " + " | ".join(cells) + " |"


def read_run(path: Path) -> dict:
    try:
        run = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise Refused("non trovato") from e
    except (OSError, ValueError) as e:
        raise Refused("illeggibile, non è un file JSON") from e
    if not isinstance(run, dict) or run.get("kind") != "evaluation":
        raise Refused("non è una corsa del set di valutazione (un file del controllo dal vivo?)")
    return run


def main(argv: list[str] | None = None, *, situations_file: Path = SITUATIONS_FILE,
         project_dir: Path = PROJECT_DIR) -> int:
    """0 se ogni file è stato valutato, 1 se qualcuno è stato rifiutato, 2 senza file."""
    parser = argparse.ArgumentParser(prog="python -m app.grading", description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="*", help="file dei risultati, dalla cartella del progetto (eval-runs/…)")
    files = parser.parse_args(argv).files
    if not files:
        print("✗ Indica almeno un file dei risultati, per esempio eval-runs/2026-11-08_09-15-00_qwen2.5-7b.json",
              file=sys.stderr)
        return 2
    situations = json.loads(situations_file.read_text(encoding="utf-8"))
    rows, refused, incomplete = [], 0, False
    for name in files:
        path = project_dir / name
        try:
            run = read_run(path)
        except Refused as e:
            print(f"✗ {name}: {e}", file=sys.stderr)
            refused += 1
            continue
        link = str(path.relative_to(project_dir)) if path.is_relative_to(project_dir) else name
        scores = grade(run, situations)
        print("\n".join(report(run, scores, link)) + "\n")
        rows.append(table_row(run, scores, link))
        incomplete = incomplete or not run["complete"]
    if rows:
        print("\n".join([*TABLE_HEADER, *rows]))
    if incomplete:
        print("\nLe corse incomplete non vanno nel README: ripeti la corsa finché è completa.")
    return 1 if refused else 0


if __name__ == "__main__":
    sys.exit(main())
