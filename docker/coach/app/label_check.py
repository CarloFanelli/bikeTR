"""La misura delle etichette: la regola e il modello che etichetta di .env danno il tipo di uscita a
ogni corsa del Tuning set (evaluation/labeled_rides.json) o del Check set
(evaluation/labeled_rides_check.json), e il comando stampa quante ne azzeccano, in tutto e per
etichetta, con i secondi e il costo del modello. Sul Check set dice anche se le etichette sono
affidabili. Scrive i risultati in un file nuovo di label-runs/, da portare in git. Dalla cartella del
progetto:

  docker compose run --rm coach-tools python -m app.label_check
  docker compose run --rm coach-tools python -m app.label_check --set check

Il modello riceve le corse a gruppi, come le uscite recenti di una richiesta del Coach. Con un
modello in cloud la spesa va nello stesso totale dell'app, e la misura non parte se il costo
massimo supera quanto resta sotto il tetto."""

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from app import labels, provider
from app.grading import ratio
from app.chat import ModelError
from app.errors import CoachError
from app.graph import ask
from app.live_check import file_stem, money, write_results
from app.ride_shape import ride_shape
from app.spending import SPENDING_FILE, Spending, charge

LABELED_FILES = {"tuning": Path(__file__).resolve().parents[1] / "evaluation" / "labeled_rides.json",
                 "check": Path(__file__).resolve().parents[1] / "evaluation" / "labeled_rides_check.json"}
# Affidabili: almeno l'80% giuste in tutto, e almeno metà giuste di ogni etichetta presente nel set.
RELIABLE_FROM = 0.80
RELIABLE_PER_LABEL_FROM = 0.5
RESULTS_DIR = Path("/project/label-runs")
# Corse per chiamata: quante ne ha di solito una richiesta del Coach (le uscite degli ultimi 14 giorni).
BATCH = 10


def labeled_rides(path: Path) -> dict:
    """Le corse etichettate a mano; ferma (CoachError) con il nome del file e della corsa sbagliata."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        draft = " --set check" if path.name == LABELED_FILES["check"].name else ""
        raise CoachError(400, "labeled_rides",
                         f"Manca {path.name}: preparalo con python -m app.labeled_rides{draft}") from None
    except ValueError as e:
        raise CoachError(400, "labeled_rides", f"{path.name} non è JSON valido: {e}") from e
    for ride in data["rides"]:
        # Le corse etichettate prima del segno del misuratore: solo con un misuratore c'è la normalizzata.
        ride.setdefault("potenzaMisurata", ride.get("np") is not None)
        # La forma dalla serie compatta, con FTP e soglia del set; senza serie si giudica dalle medie.
        ride["forma"] = ride_shape(ride.get("serie"), ride["potenzaMisurata"], data.get("ftp"), data.get("lthr"))
        if ride.get("label") not in labels.LABELS:
            raise CoachError(400, "labeled_rides", f'{path.name}: la corsa {ride.get("id")} ha etichetta '
                                                   f'"{ride.get("label")}"; quelle ammesse sono {", ".join(labels.LABELS)}')
    return data


def batches(rides: list) -> list[list]:
    return [rides[i:i + BATCH] for i in range(0, len(rides), BATCH)]


def score(rides: list, key: str) -> dict:
    """Corrette su totale, in tutto e per etichetta giusta."""
    def counted(group):
        return {"right": sum(r[key] == r["label"] for r in group), "of": len(group)}
    return {"all": counted(rides), **{label: counted([r for r in rides if r["label"] == label]) for label in labels.LABELS}}


def reliable(s: dict) -> bool:
    """La soglia di affidabilità, inclusa: un'etichetta che nel set non c'è non conta."""
    present = [s[label] for label in labels.LABELS if s[label]["of"]]
    return (s["all"]["right"] >= RELIABLE_FROM * s["all"]["of"]
            and all(c["right"] >= RELIABLE_PER_LABEL_FROM * c["of"] for c in present))


def verdict_line(name: str, s: dict) -> str:
    return f"{name}: {'affidabili' if reliable(s) else 'non affidabili'}"


def score_line(name: str, s: dict) -> str:
    return (f"{name}: {ratio((s['all']['right'], s['all']['of']))} · "
            + " · ".join(f"{label} {s[label]['right']}/{s[label]['of']}" for label in labels.LABELS))


async def model_labels(label: provider.ChatSettings, spending: Spending,
                       data: dict) -> tuple[list, float, float | None]:
    """L'etichetta del modello per ogni corsa ("" se non la dà), i secondi e quanto le sue chiamate hanno
    aggiunto al totale della spesa (None con Ollama): solo le sue, anche se intanto spende il Coach. Il
    modello che non risponde ferma la misura (ModelError): un risultato senza il modello non misura nulla."""
    found, started, charged = [], time.monotonic(), 0.0 if label.prices else None
    async with provider.client(label) as client:
        for group in batches(data["rides"]):
            if label.prices:
                spending.check(label.prices.limit)
            turn = await ask(label, client, spending, labels.model_messages(group, data["ftp"], data["lthr"]), None)
            answer = {} if turn.end.truncated else labels.read_answer(turn.text, len(group))
            found += [answer.get(i, "") for i in range(len(group))]
            if label.prices:
                charged += turn.charged
    return found, time.monotonic() - started, charged


def readme_row(run: dict, name: str) -> str:
    def share(s):
        return ratio((s["all"]["right"], s["all"]["of"]))
    return (f"| {name} | {run['set']} | {run['model']} | {share(run['ruleScore'])} | {share(run['modelScore'])} | "
            f"{run['seconds']:.1f} | {money(run['totalCost'])} |")


def main(argv: list[str] | None = None, *, results_dir: Path = RESULTS_DIR, labeled_file: Path | None = None,
         spending: Spending | None = None, clock=lambda: datetime.now(timezone.utc)) -> int:
    """0 con la misura fatta, 1 con il modello che non risponde, 2 se non parte (file delle corse
    sbagliato, .env sbagliato, costo massimo oltre il tetto): in questi casi nessun file."""
    parser = argparse.ArgumentParser(prog="python -m app.label_check", description=__doc__.splitlines()[0])
    parser.add_argument("--set", choices=("tuning", "check"), default="tuning", dest="chosen",
                        help="tuning (le corse su cui si regolano regola e modello) o check (corse nuove: dice se "
                             "le etichette sono affidabili)")
    chosen = parser.parse_args(argv).chosen
    try:
        data = labeled_rides(labeled_file or LABELED_FILES[chosen])
        label = provider.label_settings()
        spending = spending or Spending(SPENDING_FILE)
        if label.prices:
            calls = len(batches(data["rides"]))
            worst = calls * charge(label.prices, None, None)
            left = label.prices.limit - spending.total()
            print(f"Costo massimo: {money(worst)} per {calls} chiamate del modello che etichetta; "
                  f"restano {money(max(left, 0))} sotto il tetto.")
            if worst > left:
                print("✗ Il costo massimo supera quanto resta sotto il tetto (CLOUD_SPENDING_LIMIT in .env).",
                      file=sys.stderr)
                return 2
        started = clock()
        found, seconds, charged = asyncio.run(model_labels(label, spending, data))
    except CoachError as e:
        print(f"✗ {e.message}", file=sys.stderr)
        return 2
    except ModelError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1

    rides = [{"id": r["id"], "label": r["label"], "rule": labels.rule_label(r, data["ftp"], data["lthr"]),
              "model": found[i]} for i, r in enumerate(data["rides"])]
    run = {"kind": "label-check", "set": chosen, "startedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"),
           "provider": label.provider,
           "model": label.model, "batch": BATCH, "seconds": round(seconds, 1),
           "totalCost": charged,
           "ruleScore": score(rides, "rule"), "modelScore": score(rides, "model"), "rides": rides}
    path = write_results(results_dir, f"{file_stem(started, label.model)}_{chosen}", run)
    print(f"Set: {chosen}")
    print(score_line("Regola", run["ruleScore"]))
    print(f"{score_line(f'Modello {label.model}', run['modelScore'])} · "
          f"senza etichetta {sum(not r['model'] for r in rides)}")
    if chosen == "check":
        print(verdict_line("Etichette della regola", run["ruleScore"]))
        print(verdict_line(f"Etichette di {label.model}", run["modelScore"]))
    print(f"Secondi del modello: {run['seconds']:.1f} · costo: {money(run['totalCost'])}")
    print(f"Riga per il README: {readme_row(run, path.name)}")
    print(f"Risultati in {results_dir.name}/{path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
