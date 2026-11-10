"""Il voto delle corse del set di valutazione: per ogni file di eval-runs/ i punteggi contro il set di
oggi, senza chiamare nessun modello né la rete, e una riga per la tabella del README. Dalla
cartella del progetto:

  docker compose run --rm coach-tools python -m app.grading eval-runs/FILE.json [altri file…]

Ogni risposta si giudica da quello che il modello ha scritto, non da quello che il Coach ne ha
fatto: il Coach sostituisce una scelta che non entra nei minuti, toglie le citazioni inventate e
aggiunge da sé il paper del protocollo ai citati. Le risposte con un errore si contano a parte, fuori dai punteggi; solo il
punteggio della ricerca, che conta situazioni, segna come non trovata una situazione con sole
risposte fallite. Lo stesso file dà sempre lo stesso voto; se il set cambia, i file vecchi si
rivalutano senza rifare la corsa."""

import argparse
import json
import statistics
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from app import papers
from app.jscompat import js_round, js_str
from app.live_check import money
from app.protocols import PROTOCOLS
from app.selection_rules import RULES
from app.check import read_draft

PROJECT_DIR = Path("/project")
SITUATIONS_FILE = Path(__file__).resolve().parents[1] / "evaluation" / "situations.json"
# Le fonti delle regole di selezione: il prompt ne mostra il PMID accanto alle regole, quindi citarle
# non è inventare; un loro passaggio non dato sì. Il paper trovato dalla ricerca resta contato solo
# tra i paper dati.
RULE_SOURCES = {rule.source_pmid for rule in RULES if rule.source_pmid}
TABLE_HEADER = ("| Model | Prompt | Rules followed | Readable JSON | Invented citations | Support cited "
                "| Support found | Expected paper found | Fallback | Median seconds | Cost per answer | Results file |",
                "|---|---|---|---|---|---|---|---|---|---|---|---|")


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
    # Per situazione, non per risposta: (situazioni con il paper atteso tra i trovati,
    # situazioni con un paper atteso).
    expected_found: tuple[int, int]
    fallback: tuple[int, int]
    median_seconds: float | None
    cost_per_answer: float | None
    skipped: list[str]
    not_run: list[str]


def cited_in(parsed: dict | None, model_raw: str) -> set[tuple[str, int | None]]:
    """Le citazioni della risposta, ognuna una volta: le voci della lista dei passaggi usati
    (paperUsati nei file di prima dei passaggi) e ogni etichetta o PMID scritti nel testo, razionale
    compreso. (PMID, numero del passaggio), o (PMID, None) per un paper senza passaggio. Il razionale
    si legge anche decodificato: nel testo grezzo il JSON può scrivere "§" come \\u00a7."""
    lists = [parsed.get(key) for key in ("passaggiUsati", "paperUsati")] if parsed else []
    text = f"{model_raw}\n{js_str(parsed.get('razionale'))}" if parsed else model_raw
    return set(papers.citations([e for listed in lists if isinstance(listed, list) for e in listed], text))


def invented(cited: set[tuple[str, int | None]], answer: dict) -> bool:
    """Una citazione che il modello non ha ricevuto: un'etichetta fuori dai passaggi dati, o il PMID
    di un paper non dato e non fonte di una regola. Un file di prima dei passaggi non registra i
    passaggi dati: si contano solo i PMID, come allora."""
    pmids_given = {p["pmid"] for p in answer["papersFound"]} | RULE_SOURCES
    if "passagesFound" not in answer:
        return any(pmid not in pmids_given for pmid, _ in cited)
    labels_given = {s["label"] for s in answer["passagesFound"]}
    return any(papers.label(pmid, number) not in labels_given if number is not None else pmid not in pmids_given
               for pmid, number in cited)


def search_score(situations: list[dict], found: dict[str, set[str]]) -> tuple[int, int]:
    """Il punteggio della ricerca: tra le situazioni con un paper atteso (il paper di supporto di un
    protocollo che le regole ammettono), quelle che lo hanno tra i paper trovati. `found` dà i PMID
    trovati per nome di situazione; quelle che non vi compaiono, e quelle che ammettono solo
    protocolli di pratica, non contano."""
    hits = counted = 0
    for s in situations:
        expected = {PROTOCOLS[p].source_pmid for p in s["allowed"]} - {None}
        if expected and s["name"] in found:
            counted += 1
            hits += bool(expected & found[s["name"]])
    return hits, counted


def search_score_line(score: tuple[int, int]) -> str:
    return f"  Punteggio della ricerca, paper atteso trovato: {ratio(score)}"


def grade(run: dict, situations: list[dict]) -> Scores:
    allowed = {s["name"]: s["allowed"] for s in situations}
    in_set = [a for a in run["answers"] if a["situation"] in allowed]
    answered = [a for a in in_set if "error" not in a]
    n = len(answered)
    count = Counter()
    for a in answered:
        parsed, choice = read_draft(a["modelRaw"], a["truncated"])
        given = {p["pmid"] for p in a["papersFound"]}
        cited = cited_in(parsed, a["modelRaw"])
        count["followed"] += choice in allowed[a["situation"]]
        count["readable"] += parsed is not None
        count["invented"] += invented(cited, a)
        count["fallback"] += a["fellBack"]
        # Il paper di supporto del protocollo scelto dal modello; i protocolli di pratica non ne hanno.
        source = PROTOCOLS[choice].source_pmid if choice in PROTOCOLS else None
        if source:
            count["supported"] += 1
            if source in given:
                count["given"] += 1
                count["cited"] += source in {pmid for pmid, _ in cited}
    # La ricerca è la stessa a ogni ripetizione: ogni situazione conta una volta, con i paper della
    # sua prima risposta riuscita. Una risposta fallita non registra paper trovati.
    found = {}
    for a in answered:
        found.setdefault(a["situation"], {p["pmid"] for p in a["papersFound"]})
    for a in in_set:
        found.setdefault(a["situation"], set())
    charges = [a["charged"] for a in in_set]
    ran = {a["situation"] for a in run["answers"]}
    return Scores(answered=n, failed=len(in_set) - n,
                  rules_followed=(count["followed"], n), readable=(count["readable"], n),
                  invented=(count["invented"], n), support_cited=(count["cited"], count["given"]),
                  support_found=(count["given"], count["supported"]),
                  expected_found=search_score(situations, found), fallback=(count["fallback"], n),
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
             search_score_line(scores.expected_found),
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
             ratio(scores.expected_found), ratio(scores.fallback), seconds(scores.median_seconds),
             money(scores.cost_per_answer), file]
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
