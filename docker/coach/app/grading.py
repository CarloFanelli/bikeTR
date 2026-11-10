"""Il voto delle corse del set di valutazione: per ogni file di eval-runs/ i punteggi contro il set di
oggi, senza chiamare nessun modello né la rete, e una riga per la tabella del README. Dalla
cartella del progetto:

  docker compose run --rm coach-tools python -m app.grading eval-runs/FILE.json [altri file…]

Ogni risposta si giudica da quello che il modello ha scritto nell'ultima bozza, non da quello che il
Coach ne ha fatto: il Coach sostituisce una scelta che non entra nei minuti o che la regola di oggi non
ammette, toglie le citazioni inventate e aggiunge da sé il paper del protocollo ai citati. Le regole si
giudicano anche sulla prima bozza, prima dei rimandi del controllo; un file di prima delle bozze ha una
bozza sola, la risposta. Le risposte con un errore si contano a parte, fuori dai punteggi; solo il
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

from app.jscompat import js_round
from app.live_check import money
from app.protocols import PROTOCOLS
from app.selection_rules import RULES
from app.check import cited, not_given, read_draft, usable

PROJECT_DIR = Path("/project")
SITUATIONS_FILE = Path(__file__).resolve().parents[1] / "evaluation" / "situations.json"
# Le fonti delle regole di selezione: il prompt ne mostra il PMID accanto alle regole, quindi citarle
# non è inventare; un loro passaggio non dato sì. Il paper trovato dalla ricerca resta contato solo
# tra i paper dati.
RULE_SOURCES = {rule.source_pmid for rule in RULES if rule.source_pmid}
TABLE_HEADER = ("| Model | Prompt | Rules followed | Rules at first draft | Readable JSON | Invented citations "
                "| Citations dropped | Support cited | Support found | Expected paper found | Fallback "
                "| Fallback causes | Average drafts | Median seconds | Cost per answer | Results file |",
                "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
# Le cause del ripiego nelle righe del voto, nell'ordine in cui il controllo le guarda.
CAUSE_NAMES = {"truncated": "interrotta", "unreadable": "illeggibile", "not_in_catalog": "fuori catalogo",
               "too_long": "troppo lungo", "not_allowed": "non ammesso oggi"}


class Refused(Exception):
    """Un file che non si può valutare: il messaggio dice perché."""


@dataclass
class Scores:
    answered: int
    failed: int
    # Ogni punteggio è (risposte che lo soddisfano, risposte su cui si misura).
    rules_followed: tuple[int, int]
    rules_first: tuple[int, int]
    readable: tuple[int, int]
    invented: tuple[int, int]
    support_cited: tuple[int, int]
    support_found: tuple[int, int]
    # Per situazione, non per risposta: (situazioni con il paper atteso tra i trovati,
    # situazioni con un paper atteso).
    expected_found: tuple[int, int]
    fallback: tuple[int, int]
    # Risposte per causa del ripiego, solo le cause presenti, nell'ordine di CAUSE_NAMES.
    fallback_causes: dict[str, int]
    citations_dropped: tuple[int, int]
    average_drafts: float | None
    median_seconds: float | None
    cost_per_answer: float | None
    skipped: list[str]
    not_run: list[str]


def invented(citations: list[tuple[str, int | None]], answer: dict) -> bool:
    """Una citazione che il modello non ha ricevuto: un'etichetta fuori dai passaggi dati, o il PMID
    di un paper non dato e non fonte di una regola. Un file di prima dei passaggi non registra i
    passaggi dati: si contano solo i PMID, come allora."""
    pmids_given = {p["pmid"] for p in answer["papersFound"]} | RULE_SOURCES
    if "passagesFound" not in answer:
        return any(pmid not in pmids_given for pmid, _ in citations)
    return bool(not_given(citations, {s["label"] for s in answer["passagesFound"]}, pmids_given))


def drafts_of(answer: dict) -> list[dict]:
    """Le bozze della risposta; un file di prima delle bozze ne ha una sola, la risposta."""
    return answer.get("drafts") or [{"modelRaw": answer["modelRaw"], "truncated": answer["truncated"]}]


def fallback_cause(answer: dict) -> str | None:
    """Perché le regole di ripiego hanno scelto. Un file di prima delle bozze non lo registra: la causa
    viene dalla risposta, che allora andava al ripiego solo se inutilizzabile."""
    if not answer["fellBack"]:
        return None
    if "fallbackCause" in answer:
        return answer["fallbackCause"]
    parsed, choice = read_draft(answer["modelRaw"], answer["truncated"])
    return usable(parsed, choice, answer["truncated"], answer["duration"]).causes[0]


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
    count, causes = Counter(), Counter()
    for a in answered:
        parsed, choice = read_draft(a["modelRaw"], a["truncated"])
        given = {p["pmid"] for p in a["papersFound"]}
        citations = cited(parsed, a["modelRaw"])
        count["followed"] += choice in allowed[a["situation"]]
        first = drafts_of(a)[0]
        count["first"] += read_draft(first["modelRaw"], first["truncated"])[1] in allowed[a["situation"]]
        count["dropped"] += bool(a.get("citationsDropped"))
        causes[fallback_cause(a)] += 1
        count["readable"] += parsed is not None
        count["invented"] += invented(citations, a)
        count["fallback"] += a["fellBack"]
        # Il paper di supporto del protocollo scelto dal modello; i protocolli di pratica non ne hanno.
        source = PROTOCOLS[choice].source_pmid if choice in PROTOCOLS else None
        if source:
            count["supported"] += 1
            if source in given:
                count["given"] += 1
                count["cited"] += source in {pmid for pmid, _ in citations}
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
                  rules_followed=(count["followed"], n), rules_first=(count["first"], n),
                  readable=(count["readable"], n),
                  invented=(count["invented"], n), support_cited=(count["cited"], count["given"]),
                  support_found=(count["given"], count["supported"]),
                  expected_found=search_score(situations, found), fallback=(count["fallback"], n),
                  fallback_causes={c: causes[c] for c in CAUSE_NAMES if causes[c]},
                  citations_dropped=(count["dropped"], n),
                  average_drafts=statistics.mean(len(drafts_of(a)) for a in answered) if answered else None,
                  median_seconds=statistics.median(a["seconds"] for a in answered) if answered else None,
                  # Quanto ha aggiunto al totale della spesa ogni risposta, anche quelle fallite; con Ollama niente.
                  cost_per_answer=sum(charges) / len(charges) if charges and None not in charges else None,
                  skipped=sorted(ran - allowed.keys()), not_run=[name for name in allowed if name not in ran])


def ratio(score: tuple[int, int]) -> str:
    hits, total = score
    return "—" if total == 0 else f"{js_round(100 * hits / total)}% ({hits}/{total})"


def one_decimal(value: float | None) -> str:
    return "—" if value is None else f"{value:.1f}"


def causes_line(causes: dict[str, int], names: dict[str, str]) -> str:
    return " · ".join(f"{names[c]} {n}" for c, n in causes.items()) or "—"


def report(run: dict, scores: Scores, shown: str) -> list[str]:
    """I punteggi di una corsa, una riga ciascuno, sotto il nome del file."""
    lines = [f"{shown} — {run['model']} · prompt {run['promptVersion']} · "
             f"corsa {'completa' if run['complete'] else 'incompleta'}",
             f"  Risposte valutate: {scores.answered} · errori: {scores.failed}",
             f"  Regole seguite: {ratio(scores.rules_followed)}",
             f"  Regole seguite alla prima bozza: {ratio(scores.rules_first)}",
             f"  JSON leggibile: {ratio(scores.readable)}",
             f"  Citazioni inventate: {ratio(scores.invented)}",
             f"  Citazioni tolte dalla scheda: {ratio(scores.citations_dropped)}",
             f"  Paper di supporto citato: {ratio(scores.support_cited)}",
             f"  Paper di supporto trovato dalla ricerca: {ratio(scores.support_found)}",
             search_score_line(scores.expected_found),
             f"  Ripiego usato: {ratio(scores.fallback)}",
             f"  Cause del ripiego: {causes_line(scores.fallback_causes, CAUSE_NAMES)}",
             f"  Bozze per risposta (media): {one_decimal(scores.average_drafts)}",
             f"  Secondi (mediana): {one_decimal(scores.median_seconds)}",
             f"  Costo per risposta: {money(scores.cost_per_answer)}"]
    if scores.skipped:
        lines.append("  Saltate, non più nel set: " + ", ".join(scores.skipped))
    if scores.not_run:
        lines.append("  Non eseguite: " + ", ".join(scores.not_run))
    return lines


def table_row(run: dict, scores: Scores, link: str) -> str:
    """La riga della tabella del README, con il link al file; una corsa incompleta lo dice."""
    file = f"[{Path(link).name}]({link})" + ("" if run["complete"] else " (incompleta)")
    cells = [run["model"], run["promptVersion"], ratio(scores.rules_followed), ratio(scores.rules_first),
             ratio(scores.readable), ratio(scores.invented), ratio(scores.citations_dropped),
             ratio(scores.support_cited), ratio(scores.support_found), ratio(scores.expected_found),
             ratio(scores.fallback), causes_line(scores.fallback_causes, {c: c for c in CAUSE_NAMES}),
             one_decimal(scores.average_drafts), one_decimal(scores.median_seconds), money(scores.cost_per_answer),
             file]
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
