"""Le etichette delle corse recenti nel prompt del Coach: recupero, fondo, ripetute o gara. Con
COACH_RIDE_LABELS=rule le dà la regola qui sotto, che guarda solo il segno gara di Strava,
l'intensità rispetto a FTP o soglia cardiaca e la durata: fa da confronto per il modello che
etichetta, e da ripiego quando quel modello non risponde. Con COACH_RIDE_LABELS=model le chiede al
modello che etichetta, con i messaggi e la lettura della risposta qui sotto.

La potenza conta solo quando l'ha misurata un misuratore: quella che Strava stima senza misuratore
sbaglia spesso, soprattutto sulle uscite lunghe. Senza misuratore la corsa si giudica dalla frequenza
cardiaca, con soglie sue. Le soglie partono da modelli a zone pubblicati e sono regolate sul Tuning
set (evaluation/labeled_rides.json), mai sul Check set."""

from app.check import parse_model_json
from app.jscompat import js_str
from app.metrics import is_bike, recent_bike_rides, ride_numbers

LABELS = ("recupero", "fondo", "ripetute", "gara")
# Strava segna una corsa in bici come gara con workout_type 11.
RACE_WORKOUT_TYPE = 11
# Potenza misurata (normalizzata, o media) su FTP. Da 0.80 in su la corsa intera sta da tempo in su
# (Intensity Factor di Coggan: un'uscita di fondo sta fra 0.65 e 0.80); sotto 0.65, breve, è recupero.
POWER_INTERVALS_FROM = 0.80
POWER_RECOVERY_BELOW = 0.65
# Frequenza cardiaca media su soglia (zone di Friel su LTHR: Z1 sotto 0.81, Z2 fino a 0.89). Un'uscita
# di fondo sta fra 0.85 e 0.95: ripetute da 0.95 in su, ma solo fino a 90 minuti, perché sulle uscite
# lunghe la frequenza cardiaca sale da sola a sforzo costante (deriva cardiaca).
HR_INTERVALS_FROM = 0.95
HR_INTERVALS_MAX_MINUTES = 90
HR_RECOVERY_BELOW = 0.81
RECOVERY_MAX_MINUTES = 75
# Le cifre di una corsa che il classificatore legge oltre a quelle che il prompt mostra già.
FACT_KEYS = ("nome", "gara", "np", "maxWatts", "maxHr", "potenzaMisurata")


def facts(a: dict, details: dict) -> dict:
    """Di un'uscita di Strava: id, nome, segno gara, potenza normalizzata dai dettagli corsa (quando ci
    sono), massimi di potenza e frequenza cardiaca, e se la potenza l'ha misurata un misuratore."""
    return {"id": a["id"], "nome": a.get("name") or "", "gara": a.get("workout_type") == RACE_WORKOUT_TYPE,
            "np": round(details[a["id"]]["np"]) if (details.get(a["id"]) or {}).get("np") else None,
            "maxWatts": a.get("max_watts") or None, "maxHr": a.get("max_heartrate") or None,
            "potenzaMisurata": bool(a.get("device_watts"))}


def ride_facts(acts: list, details: dict, now_ms: float) -> list[dict]:
    """Per le stesse corse delle uscite recenti, nello stesso ordine, le cifre che il prompt non mostra."""
    return [facts(a, details) for a in recent_bike_rides(acts, now_ms)]


def ride(a: dict, details: dict) -> dict:
    """Un'uscita di Strava con tutto quello che la regola legge: le cifre del prompt e le altre."""
    return {**ride_numbers(a), **facts(a, details)}


def badges(acts: list, details: dict, saved: dict[int, str], ftp: float | None, lthr: float | None) -> dict[str, str]:
    """Il tipo di ogni uscita in bici con potenza misurata o frequenza cardiaca, per id: l'etichetta
    salvata del modello che etichetta quando c'è, altrimenti quella della regola, con FTP e soglia di oggi.
    Nessuna chiamata a un modello."""
    return {str(a["id"]): saved.get(a["id"]) or rule_label(ride(a, details), ftp, lthr)
            for a in acts if is_bike(a) and (a.get("device_watts") or a.get("average_heartrate"))}


def power_share(ride: dict, ftp: float | None) -> float | None:
    """La potenza misurata (normalizzata, o media) su FTP; None senza misuratore o senza FTP."""
    watts = ride.get("np") or ride.get("avgWatts")
    return watts / ftp if ride.get("potenzaMisurata") and ftp and watts else None


def hr_share(ride: dict, lthr: float | None) -> float | None:
    """La frequenza cardiaca media su soglia; None senza l'una o l'altra."""
    return ride["avgHr"] / lthr if lthr and ride.get("avgHr") else None


def rule_label(ride: dict, ftp: float | None, lthr: float | None) -> str:
    if ride.get("gara"):
        return "gara"
    short = ride["durataMin"] <= RECOVERY_MAX_MINUTES
    power = power_share(ride, ftp)
    if power is not None:
        if power >= POWER_INTERVALS_FROM:
            return "ripetute"
        return "recupero" if power < POWER_RECOVERY_BELOW and short else "fondo"
    hr = hr_share(ride, lthr)
    if hr is None:
        return "fondo"
    if hr >= HR_INTERVALS_FROM and ride["durataMin"] <= HR_INTERVALS_MAX_MINUTES:
        return "ripetute"
    return "recupero" if hr < HR_RECOVERY_BELOW and short else "fondo"


LABEL_SYSTEM = f"""Etichetti uscite in bici di un atleta. Per ogni corsa scegli UNA etichetta:
- recupero: uscita molto facile e breve, per recuperare
- fondo: lavoro aerobico continuo, anche lungo, senza blocchi intensi
- ripetute: lavoro a intervalli o a intensità alta (soglia, VO2max, sprint)
- gara: una competizione

Di ogni corsa hai l'intensità già calcolata: la quota di FTP, solo quando la potenza l'ha misurata un
misuratore, e la quota di soglia cardiaca. La potenza media senza misuratore è una stima di Strava:
non usarla. Come orientamento:
- ripetute: quota di FTP da {POWER_INTERVALS_FROM:.2f} in su; senza quota di FTP, quota di soglia cardiaca da {HR_INTERVALS_FROM:.2f} in su in un'uscita fino a {HR_INTERVALS_MAX_MINUTES} minuti
- recupero: uscita fino a {RECOVERY_MAX_MINUTES} minuti con quota di FTP sotto {POWER_RECOVERY_BELOW:.2f}, o senza quota di FTP con quota di soglia cardiaca sotto {HR_RECOVERY_BELOW:.2f}
- fondo: tutto il resto, comprese le uscite lunghe con la frequenza cardiaca alta (sale da sola con le ore)
- gara: solo una corsa segnata come gara su Strava

Dai un'etichetta a OGNI corsa, da c1 all'ultima. Rispondi SOLO con un oggetto JSON che dà a ogni id di
corsa la sua etichetta, nessun testo prima o dopo, per esempio:
{{"c1":"fondo","c2":"ripetute"}}"""


def or_dash(value) -> str:
    return "—" if value in (None, "") else js_str(value)


def share(value: float | None) -> str:
    return "—" if value is None else f"{value:.2f}"


def model_messages(rides: list[dict], ftp: float | None, lthr: float | None) -> list[dict]:
    """Le corse con un id corto (c1, c2, …: mai l'id di Strava), il nome dato dall'atleta, le cifre e
    l'intensità già calcolata, con le stesse quote che legge la regola."""
    lines = [f"- c{i}: «{or_dash(r.get('nome'))}» ({r['tipo']}), {js_str(r['durataMin'])}min, "
             f"{js_str(r['distanzaKm'])}km, potenza media {or_dash(r.get('avgWatts'))}W "
             f"({'misurata' if r.get('potenzaMisurata') else 'stimata'}), normalizzata "
             f"{or_dash(r.get('np'))}W, massima {or_dash(r.get('maxWatts'))}W, FC media {or_dash(r.get('avgHr'))}, "
             f"FC massima {or_dash(r.get('maxHr'))}, quota di FTP {share(power_share(r, ftp))}, quota di soglia "
             f"cardiaca {share(hr_share(r, lthr))}, segnata come gara su Strava: {'sì' if r.get('gara') else 'no'}"
             for i, r in enumerate(rides, 1)]
    athlete = f"Atleta: FTP {or_dash(ftp)}W, soglia cardiaca {or_dash(lthr)} bpm."
    return [{"role": "system", "content": LABEL_SYSTEM},
            {"role": "user", "content": athlete + "\n\nCorse:\n" + "\n".join(lines)}]


def read_answer(text: str, count: int) -> dict[int, str]:
    """Le etichette valide della risposta, per posizione della corsa (0, 1, …); un id che non è di
    una corsa, o un'etichetta sconosciuta, restano fuori."""
    parsed = parse_model_json(text)
    if not isinstance(parsed, dict):
        return {}
    found = {}
    for i in range(count):
        label = parsed.get(f"c{i + 1}")
        if isinstance(label, str) and label.strip().lower() in LABELS:
            found[i] = label.strip().lower()
    return found
