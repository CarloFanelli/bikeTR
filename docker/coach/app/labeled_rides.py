"""La bozza delle corse etichettate: circa 40 uscite in bici salvate dal Coach, copiate senza nulla
che le ricolleghi all'atleta, in una bozza nella cartella del progetto (fuori da git). Dalla cartella
del progetto, per il Tuning set e poi per il Check set:

  docker compose run --rm coach-tools python -m app.labeled_rides
  docker compose run --rm coach-tools python -m app.labeled_rides --set check

Il Check set non ha nessuna corsa del Tuning set: su corse già viste la misura direbbe poco di quelle
nuove. Quali corse salvate sono finite in ogni set lo dice labeled-rides-sources.json, anche lui fuori
da git perché ha gli id di Strava.

Ogni corsa ha una data inventata, le cifre spostate a caso di qualche punto percentuale, il nome
ridotto alle sole parole di allenamento (6x3', Z2, soglia…), nessun id di Strava né percorso, e
un'etichetta vuota. L'etichetta giusta la scrive una persona: una proposta della regola o di un
modello darebbe un vantaggio proprio a chi poi si misura. Corretta e riletta, la bozza diventa
docker/coach/evaluation/labeled_rides.json, che il repository pubblica.

Le corse salvate restano intatte: il comando legge soltanto."""

import argparse
import asyncio
import json
import random
import re
import sys
from datetime import date, timedelta
from pathlib import Path

from app import db
from app.activities import ActivityStore
from app.athlete_data import AthleteData
from app.label_check import LABELED_FILES, labeled_rides
from app.labels import RACE_WORKOUT_TYPE
from app.metrics import is_bike
from app.project_files import replace_file

DRAFT_FILES = {"tuning": Path("/project/labeled-rides-draft.json"),
               "check": Path("/project/labeled-rides-check-draft.json")}
SOURCES_FILE = Path("/project/labeled-rides-sources.json")
# Dove va la bozza corretta, dalla cartella del progetto: il file che la misura delle etichette legge.
FINAL_FILES = {name: f"docker/coach/{path.relative_to(path.parents[1])}" for name, path in LABELED_FILES.items()}
WANTED = 40
# Le attività più recenti fra cui scegliere, distribuite su tutto il periodo: corse di ogni tipo.
LOOKED_AT = 600
# Di quanto si spostano le cifre, in più o in meno.
JITTER = 0.03
# Le date inventate: una corsa ogni tre giorni da qui.
FIRST_DAY = date(2025, 1, 1)
# Le parole di un nome che restano: quelle di allenamento, mai luoghi o persone.
TRAINING_WORDS = re.compile(
    r"\d+\s*[x×]\s*\d+\s*(?:['’\"]|min|s|sec|km)?|\d+\s*(?:['’]|min|km)|z[1-7]|vo2(?:max)?|ftp|soglia|threshold|"
    r"sweet\s*spot|sweetspot|tempo|medio|recupero|recovery|scarico|fondo|endurance|lungo|long|facile|easy|"
    r"ripetute|intervalli|intervals|sprint|salite|salita|gara|race|criterium|crit|granfondo|gran\s*fondo|"
    r"test|zwift|giro|uscita|workout|allenamento",
    re.IGNORECASE)


def training_name(name: str) -> str:
    """Il nome con le sole parole di allenamento, nell'ordine; "Uscita" se non ne resta nessuna."""
    words = [m.group(0) for m in TRAINING_WORDS.finditer(name or "")]
    kept = " ".join(words)
    return kept[:1].upper() + kept[1:] if kept else "Uscita"


def picked(activities: list) -> list:
    """Fino a WANTED uscite in bici con potenza o frequenza cardiaca, prese a distanza regolare
    dalla più recente alla più vecchia: non solo l'ultimo mese."""
    rides = [a for a in activities if is_bike(a) and (a.get("average_watts") or a.get("average_heartrate"))]
    if len(rides) <= WANTED:
        return rides
    step = len(rides) / WANTED
    return [rides[int(i * step)] for i in range(WANTED)]


def matches(ride: dict, a: dict) -> bool:
    """La corsa etichettata è la copia di questa uscita: durata e distanza entro lo spostamento."""
    def near(copy, original):
        return copy is not None and abs(copy - original) <= original * JITTER + 1
    return near(ride.get("durataMin"), a["moving_time"] / 60) and near(ride.get("distanzaKm"), a["distance"] / 1000)


def tuning_ids(rides: list, tuning: list) -> list[int] | None:
    """Gli id di Strava del Tuning set, ricostruiti quando labeled-rides-sources.json non li dice:
    le uscite che la bozza sceglie oggi, una per una nello stesso ordine. None se anche una sola non
    combacia (sono arrivate uscite nuove, o il file è un altro): allora non si può evitare di ripeterle."""
    again = picked(rides)
    if len(again) != len(tuning) or not all(matches(t, a) for t, a in zip(tuning, again)):
        return None
    return [a["id"] for a in again]


def anonymized(index: int, a: dict, details: dict, rng: random.Random) -> dict:
    def moved(value, digits: int = 0):
        if not value:
            return None
        result = round(value * rng.uniform(1 - JITTER, 1 + JITTER), digits)
        return int(result) if digits == 0 else result

    np_ = (details.get(a["id"]) or {}).get("np")
    return {"id": f"r{index}", "data": (FIRST_DAY + timedelta(days=3 * (index - 1))).isoformat(), "tipo": a["type"],
            "durataMin": moved(a["moving_time"] / 60), "distanzaKm": moved(a["distance"] / 1000, 1),
            "avgWatts": moved(a.get("weighted_average_watts") or a.get("average_watts")),
            "avgHr": moved(a.get("average_heartrate")), "nome": training_name(a.get("name")),
            "gara": a.get("workout_type") == RACE_WORKOUT_TYPE, "np": moved(np_),
            "maxWatts": moved(a.get("max_watts")), "maxHr": moved(a.get("max_heartrate")),
            "potenzaMisurata": bool(a.get("device_watts")), "label": ""}


def athlete_numbers(saved: dict, rng: random.Random) -> tuple[int | None, int | None]:
    """FTP (quella dichiarata, o l'ultima dello storico) e soglia cardiaca, spostate come le cifre."""
    settings = saved.get("settings") or {}
    history = saved.get("ftpHistory") or []
    ftp = settings.get("ftpDeclared") or (history[-1].get("ftp") if history else None)
    lthr = settings.get("hrLthr")
    return tuple(round(v * rng.uniform(1 - JITTER, 1 + JITTER)) if v else None for v in (ftp, lthr))


class Overlap(Exception):
    """Non si sa quali uscite sono nel Tuning set: il Check set potrebbe ripeterle."""


async def draft(store: ActivityStore, athlete: AthleteData, rng: random.Random, chosen: str,
                sources: dict, tuning_file: Path) -> tuple[dict, list[int]]:
    """La bozza del set scelto e gli id di Strava delle sue uscite. Per il Check set, le uscite che il
    Tuning set non ha, distribuite allo stesso modo."""
    latest = await store.latest(LOOKED_AT)
    if chosen == "check":
        if not tuning_file.exists():
            raise Overlap(f"manca {tuning_file.name}")
        tuning_rides = labeled_rides(tuning_file)["rides"]
        recorded = {a["id"]: a for a in await store.summaries(sources.get("tuning") or [])}
        tuning = sources.get("tuning") or []
        # L'elenco vale solo se dice proprio le corse del Tuning set: una bozza rifatta e non messa al
        # suo posto lo cambia. Se non combacia, le corse si ritrovano fra quelle scelte oggi.
        if not (len(tuning) == len(tuning_rides) and all(
                i in recorded and matches(t, recorded[i]) for t, i in zip(tuning_rides, tuning))):
            tuning = tuning_ids(latest, tuning_rides)
            if tuning is None:
                raise Overlap(f"{SOURCES_FILE.name} non dice quali uscite ha il Tuning set, e le uscite "
                              "salvate non combaciano più con le sue")
            sources["tuning"] = tuning
        latest = [a for a in latest if a["id"] not in set(tuning)]
    rides = picked(latest)
    details = await store.details([a["id"] for a in rides])
    ftp, lthr = athlete_numbers(await athlete.all(), rng)
    return ({"_comment": "Corse inventate a partire da uscite vere: data, cifre e nome cambiati. "
                         "label: recupero, fondo, ripetute o gara, scritta da una persona.",
             "ftp": ftp, "lthr": lthr,
             "rides": [anonymized(i, a, details, rng) for i, a in enumerate(rides, 1)]},
            [a["id"] for a in rides])


def main(argv: list[str] | None = None, *, store: ActivityStore | None = None, athlete: AthleteData | None = None,
         out: Path | None = None, sources_file: Path = SOURCES_FILE, tuning_file: Path = LABELED_FILES["tuning"],
         rng: random.Random | None = None) -> int:
    """0 con la bozza scritta, 1 senza corse salvate, 2 se il Check set potrebbe ripetere il Tuning set."""
    parser = argparse.ArgumentParser(prog="python -m app.labeled_rides", description=__doc__.splitlines()[0])
    parser.add_argument("--set", choices=("tuning", "check"), default="tuning", dest="chosen",
                        help="tuning (le corse su cui si regolano regola e modello) o check (corse nuove, per "
                             "dire se le etichette sono affidabili)")
    chosen = parser.parse_args(argv).chosen
    out = out or DRAFT_FILES[chosen]
    conninfo = db.url() if store is None or athlete is None else ""
    sources = json.loads(sources_file.read_text(encoding="utf-8")) if sources_file.exists() else {}
    try:
        # Mai un seme fisso: con il seme nel repository le cifre vere si ricaverebbero dalla bozza.
        found, ids = asyncio.run(draft(store or ActivityStore(conninfo), athlete or AthleteData(conninfo),
                                       rng or random.SystemRandom(), chosen, sources, tuning_file))
    except Overlap as e:
        print(f"✗ Non posso evitare che il Check set ripeta corse del Tuning set: {e}.", file=sys.stderr)
        return 2
    if not found["rides"]:
        print("✗ Nessuna uscita in bici salvata: collega Strava nell'app e aspetta la sincronizzazione, poi riprova.",
              file=sys.stderr)
        return 1
    existed = out.exists()
    replace_file(out, json.dumps(found, ensure_ascii=False, indent=2) + "\n")
    replace_file(sources_file, json.dumps({**sources, chosen: ids}, indent=2) + "\n")
    count = len(found["rides"])
    print(f"Scritte {count} corse in {out.name}" + (" (sovrascritta)" if existed else "")
          + (f": ne volevo {WANTED}, sono tutte quelle " + ("fuori dal Tuning set." if chosen == "check" else "salvate.")
             if count < WANTED else "."))
    if found["ftp"] is None or found["lthr"] is None:
        print("FTP o soglia cardiaca non salvate nell'app: scrivile in cima al file, o la regola userà solo il segno gara.")
    print("Poi scrivi in label di ogni corsa recupero, fondo, ripetute o gara, controlla che nessun nome dica un "
          f"luogo o una persona, e sposta il file in {FINAL_FILES[chosen]}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
