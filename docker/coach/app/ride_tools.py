"""Gli strumenti sulle uscite che il modello chat può chiedere durante una bozza, con COACH_RIDE_TOOLS=on:
lo storico del carico delle ultime 8 settimane (da lunedì a domenica) e degli ultimi 14 giorni, e la forma di
un'uscita in bici di quei 14 giorni. Le uscite in bici dei 14 giorni hanno un codice (r1 la più recente, poi
r2…) che vale solo dentro la richiesta: il modello non vede mai l'id di Strava, il nome dell'uscita né il
percorso."""

import json
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app import labels, prompts
from app.chat import ToolCall
from app.jscompat import days_ago, instant_ms, js_round
from app.metrics import FORM_DAYS, Profile, activity_load, form_trend, is_bike, ride_numbers
from app.ride_shape import ride_shape

HISTORY_WEEKS = 8
HISTORY_DAYS = 14
WEEKDAYS = ("lun", "mar", "mer", "gio", "ven", "sab", "dom")


@dataclass(frozen=True)
class RideHistory:
    """Lo storico di una richiesta. `weeks` dalla più vecchia: lunedì d'inizio, ore, carico, uscite in bici,
    CTL a fine settimana (o a oggi) e giorni contati, 7 tranne la settimana in corso. `days` dal più
    recente: la data e le attività del giorno, dalla più recente, ognuna con tipo, minuti, carico e,
    se è in bici, il suo codice. `rides` per codice: la riga che ride_shape restituisce."""
    weeks: list[dict]
    days: list[dict]
    rides: dict[str, str]


def ride_history(acts: list, details: dict, series: dict, p: Profile, now_ms: float, tz: ZoneInfo) -> RideHistory:
    """Lo storico dalle attività salvate, con il carico di ogni attività e il CTL calcolati come per la
    forma di oggi (app/metrics.py), e la forma di ogni uscita in bici dei 14 giorni dalla sua serie
    compatta (per id), con FTP e soglia cardiaca di oggi."""
    daily = form_trend(acts, details, p, now_ms, tz)["daily"]
    # Il CTL alla fine di ogni giorno, dalla stessa media esponenziale a 42 giorni di form_trend.
    k_ctl, ctl, ctl_by_day = 1 - math.exp(-1 / 42), 0.0, []
    for load in daily:
        ctl += (load - ctl) * k_ctl
        ctl_by_day.append(ctl)
    by_day: dict[int, list] = {}
    for a in sorted(acts, key=lambda a: instant_ms(a["start_date_local"]), reverse=True):
        delta = days_ago(instant_ms(a["start_date_local"]), now_ms, tz)
        if 0 <= delta < FORM_DAYS:
            by_day.setdefault(delta, []).append(
                {"tipo": a["type"], "minuti": (a.get("moving_time") or 0) / 60,
                 "carico": activity_load(a, details.get(a["id"]), p), "bici": is_bike(a), "attivita": a})
    rides = {}
    for delta in range(HISTORY_DAYS):
        for item in by_day.get(delta, []):
            if item["bici"]:
                item["codice"] = f"r{len(rides) + 1}"
                rides[item["codice"]] = shape_line(item, series, p)
    today = datetime.fromtimestamp(now_ms / 1000, tz).date()
    weeks = []
    for w in reversed(range(HISTORY_WEEKS)):
        first = today.weekday() + 7 * w            # giorni fa del lunedì della settimana
        last = max(first - 6, 0)                    # giorni fa della domenica, o oggi
        items = [i for d in range(last, first + 1) for i in by_day.get(d, [])]
        weeks.append({"lunedi": today - timedelta(days=first),
                      "ore": sum(i["minuti"] for i in items) / 60,
                      "carico": sum(daily[FORM_DAYS - 1 - d] for d in range(last, first + 1)),
                      "uscite": sum(i["bici"] for i in items),
                      "ctl": ctl_by_day[FORM_DAYS - 1 - last], "giorni": first - last + 1})
    days = [{"data": today - timedelta(days=d), "attivita": by_day.get(d, [])} for d in range(HISTORY_DAYS)]
    return RideHistory(weeks, days, rides)


# L'ora delle situazioni del set di valutazione: la mattina presto di oggi, prima di ogni uscita.
SITUATION_ZONE = ZoneInfo("Europe/Rome")
SERIES_STEP = 15


def from_situation(history: dict, ctx: dict) -> RideHistory:
    """Lo storico inventato di una situazione del set di valutazione: oggi e le uscite, ognuna con data,
    tipo, minuti, potenza e battito medi, se la potenza è misurata e, nei 14 giorni, i suoi tratti
    (minuti, potenza, battito) da cui viene la serie compatta. Stesse risposte degli strumenti di sempre."""
    now = datetime.combine(date.fromisoformat(history["today"]), datetime.min.time().replace(hour=6),
                           SITUATION_ZONE).timestamp() * 1000
    acts, series = [], {}
    for n, ride in enumerate(history["rides"], 1):
        acts.append({"id": n, "type": ride["type"], "start_date_local": f"{ride['date']}T{9 + n % 10:02d}:00:00Z",
                     "moving_time": ride["minutes"] * 60, "distance": 0,
                     "weighted_average_watts": ride["watts"] if ride["measured"] else None,
                     "average_watts": ride["watts"], "average_heartrate": ride["hr"],
                     "has_heartrate": ride["hr"] is not None, "device_watts": ride["measured"],
                     "total_elevation_gain": 0})
        if "segments" in ride:
            steps = [(w, h) for minutes, w, h in ride["segments"] for _ in range(round(minutes * 60 / SERIES_STEP))]
            series[n] = {"step": SERIES_STEP, "watts": [w for w, _ in steps] if ride["measured"] else None,
                         "hr": [h for _, h in steps] if ride["hr"] is not None else None}
    return ride_history(acts, {}, series, Profile(ftp=ctx.get("ftp"), lthr=ctx.get("lthr")), now, SITUATION_ZONE)


def shape_line(item: dict, series: dict, p: Profile) -> str:
    """La risposta di ride_shape per un'uscita: la data, il tipo, i minuti e il carico, poi la forma; senza
    serie o senza zone, le medie e il perché."""
    a = item["attivita"]
    head = (f"{item['codice']}: {a['type']} del {instant_date(a):%d/%m}, {js_round(item['minuti'])}', "
            f"carico {js_round(item['carico'])}")
    numbers = ride_numbers(a)
    averages = f"potenza media {labels.or_dash(numbers['avgWatts'])}W, FC media {labels.or_dash(numbers['avgHr'])}"
    if a["id"] not in series:
        return f"{head}. Forma non ancora disponibile: i dati secondo per secondo non sono scaricati; {averages}."
    measured = bool(a.get("device_watts"))
    shape = ride_shape(series[a["id"]], measured, p.ftp, p.lthr)
    if shape is None:
        why = ("senza FTP né soglia cardiaca non si calcolano le zone" if not (p.ftp or p.lthr)
               else "l'uscita non ha né potenza misurata né battito utilizzabili")
        return f"{head}. Nessuna forma: {why}; {averages}."
    missing = [text for text, absent in (("senza FTP, zone solo dal battito", not p.ftp and measured),
                                         ("senza soglia cardiaca, zone solo dalla potenza e niente carico per ora",
                                          not p.lthr)) if absent]
    return f"{head}. {labels.shape_text(shape)}" + (f" ({'; '.join(missing)})" if missing else "") + "."


def instant_date(a: dict) -> date:
    """Il giorno dell'attività come lo scrive Strava, nell'ora locale."""
    return date.fromisoformat(a["start_date_local"][:10])


def day_label(day: date) -> str:
    return f"{WEEKDAYS[day.weekday()]} {day:%d/%m}"


def history_text(history: RideHistory) -> str:
    """Lo storico come lo legge il modello: corto, perché anche un modello piccolo lo legga tutto."""
    lines = ["STORICO DEL CARICO, settimane da lunedì a domenica, dalla più vecchia:"]
    for w in history.weeks:
        partial = f" (in corso, {w['giorni']} giorni)" if w["giorni"] < 7 else ""
        lines.append(f"- sett. dal {w['lunedi']:%d/%m}{partial}: {w['ore']:.1f} h · carico {js_round(w['carico'])}"
                     f" · {w['uscite']} uscite in bici · CTL {js_round(w['ctl'])}")
    lines.append(f"ULTIMI {HISTORY_DAYS} GIORNI, dal più recente (r1, r2… è il codice di un'uscita in bici "
                 "da dare a ride_shape):")
    for d in history.days:
        items = [f"{i['codice'] + ' ' if 'codice' in i else ''}{i['tipo']} {js_round(i['minuti'])}' "
                 f"carico {js_round(i['carico'])}" for i in d["attivita"]]
        lines.append(f"- {day_label(d['data'])}: {' · '.join(items) or 'nessuna attività'}")
    return "\n".join(lines)


def asked_code(call: ToolCall) -> str | None:
    """Il codice chiesto, dagli argomenti come il modello li ha scritti (un oggetto, o il testo JSON che lo
    contiene); None se non c'è."""
    arguments = call.arguments
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except (ValueError, RecursionError):
            return None
    code = arguments.get("code") if isinstance(arguments, dict) else None
    return code.strip().lower() if isinstance(code, str) else None


def answer(call: ToolCall, history: RideHistory | None) -> str | None:
    """La risposta a uno strumento sulle uscite; None per un nome che non è uno di loro."""
    if call.name == prompts.LOAD_HISTORY_TOOL["function"]["name"]:
        return history_text(history) if history else prompts.RIDE_NO_HISTORY
    if call.name == prompts.RIDE_SHAPE_TOOL["function"]["name"]:
        if history is None:
            return prompts.RIDE_NO_HISTORY
        return history.rides.get(asked_code(call), prompts.RIDE_BAD_CODE)
    return None


def version_sample() -> str:
    """Uno storico d'esempio fisso, una settimana e un giorno con un'uscita in bici: la forma delle righe
    entra nella versione del prompt."""
    ride = {"id": 1, "type": "Ride", "start_date_local": "2000-01-03T09:00:00Z", "moving_time": 5400,
            "distance": 40000, "device_watts": True, "average_heartrate": 140}
    item = {"tipo": "Ride", "minuti": 90, "carico": 80, "bici": True, "codice": "r1", "attivita": ride}
    series = {1: {"step": 15, "watts": [150] * 4 + [240] * 8 + [150] * 4, "hr": [130] * 4 + [160] * 8 + [130] * 4}}
    monday, p = date(2000, 1, 3), Profile(ftp=250, lthr=165)
    history = RideHistory([{"lunedi": monday, "ore": 1.5, "carico": 80, "uscite": 1, "ctl": 40, "giorni": 7}],
                          [{"data": monday, "attivita": [item]}], {})
    return "\n".join([history_text(history), shape_line(item, series, p), shape_line(item, {}, p)])
