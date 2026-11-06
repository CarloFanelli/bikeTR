"""Numeri di allenamento del Coach, calcolati come nel browser: carico di ogni attività,
forma (CTL/ATL/TSB), distribuzione dell'intensità, uscite recenti e fascia di volume.

Le formule seguono quelle del browser (web/src/core: streams.ts, load.ts, form.ts,
training-v2.ts) e del Coach del browser (coach_before_move.js); i test confrontano i
risultati con quelli del codice del browser.
"""

import math
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from app.jscompat import days_ago, instant_ms, js_round, js_sum

FORM_DAYS = 90
TYPE_WEIGHTS = {
    "Ride": 1.0, "VirtualRide": 1.0, "EBikeRide": 0.7,
    "MountainBikeRide": 1.0, "GravelRide": 1.0,
    "Run": 1.0, "VirtualRun": 1.0, "TrailRun": 1.05,
    "Swim": 0.9,
    "Walk": 0.2, "Hike": 0.5,
    "Workout": 0.6, "WeightTraining": 0.5, "Crossfit": 0.8,
    "Yoga": 0.3, "Pilates": 0.4, "Elliptical": 0.8, "StairStepper": 0.8,
    "RockClimbing": 0.6, "InlineSkate": 0.7, "NordicSki": 1.0,
    "BackcountrySki": 1.0, "AlpineSki": 0.7, "Snowboard": 0.6,
    "Rowing": 0.9, "Canoeing": 0.7, "Kayaking": 0.7,
    "Handcycle": 0.8, "Velomobile": 0.8, "Skateboard": 0.4,
}
WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"]


@dataclass(frozen=True)
class Profile:
    """Profilo atleta inviato dal browser: i valori che l'app mostra, digitati o stimati."""
    ftp: float | None = None
    lthr: float | None = None
    hr_max: float | None = None
    weight: float | None = None
    weekly_hours: float | None = None
    weekly_days: float | None = None


# ---- Dettagli corsa: dagli stream Strava, senza FTP né soglia FC ----

def ride_details(streams: dict) -> dict:
    """Le cifre degli stream che non dipendono da FTP o soglia: un nuovo FTP cambia il
    TSS senza scaricare di nuovo nulla."""
    watts = (streams.get("watts") or {}).get("data") or []
    hr = (streams.get("heartrate") or {}).get("data") or []
    return {
        "np": normalized_power(watts) if watts else None,
        "watts_n": len(watts),
        "hr_mean": js_sum(hr) / len(hr) if hr else None,
        "hr_n": len(hr),
    }


def normalized_power(watts: list) -> float:
    """NP = (media delle medie mobili a 30 s elevate alla quarta) ^ (1/4)."""
    win = 30
    total = 0
    roll = []
    for i, w in enumerate(watts):
        total += w or 0
        if i >= win:
            total -= watts[i - win] or 0
        if i >= win - 1:
            roll.append(total / win)
    return (js_sum(r * r * r * r for r in roll) / max(1, len(roll))) ** 0.25


def details_tss(details: dict, ftp: float | None) -> int | None:
    np_ = details["np"]
    if not ftp or np_ is None:
        return None
    intensity = np_ / ftp
    return js_round((details["watts_n"] * np_ * intensity) / (ftp * 3600) * 100)


def details_hrtss(details: dict, lthr: float | None) -> int | None:
    if not lthr or details["hr_mean"] is None:
        return None
    return js_round((details["hr_mean"] / lthr) ** 2 * (details["hr_n"] / 3600) * 100)


# ---- Carico di un'attività ----

def type_weight(act: dict) -> float:
    """Peso del tipo di attività; escursioni e trail run crescono col dislivello."""
    kind = act.get("type") or ""
    elev = act.get("total_elevation_gain") or 0
    if kind in ("Hike", "Walk"):
        for limit, weight in ((1500, 0.9), (1000, 0.8), (500, 0.65), (200, 0.45)):
            if elev > limit:
                return weight
    elif kind == "TrailRun":
        if elev > 800:
            return 1.15
        if elev > 400:
            return 1.1
    return TYPE_WEIGHTS.get(kind, 0.5)


def hike_load(act: dict, p: Profile) -> float:
    hours = (act.get("moving_time") or 0) / 3600
    elev = act.get("total_elevation_gain") or 0
    w = type_weight(act)
    if p.lthr and act.get("has_heartrate") and act.get("average_heartrate"):
        r = act["average_heartrate"] / p.lthr
        return r * r * hours * 100 * w + elev / 100 * 1.2
    duration_bonus = (hours - 3) * 12 if hours > 3 else 0
    return hours * 45 * w + elev / 100 * 1.5 + duration_bonus


def activity_load(act: dict, details: dict | None, p: Profile) -> float:
    """Carico (TSS) di un'attività, dalla fonte più precisa disponibile: dettagli corsa,
    potenza, frequenza cardiaca, suffer score di Strava, durata. Pesato per tipo."""
    w = type_weight(act)
    if act.get("type") in ("Hike", "Walk") and (act.get("total_elevation_gain") or 0) > 100:
        return hike_load(act, p)
    minutes = (act.get("moving_time") or 0) / 60
    hours = minutes / 60
    if details is not None:
        tss = details_tss(details, p.ftp)
        if tss is not None:
            return tss * w
        hrtss = details_hrtss(details, p.lthr)
        if hrtss is not None:
            return hrtss * w
    hr = act.get("average_heartrate") if act.get("has_heartrate") else None
    if p.ftp and act.get("weighted_average_watts"):
        intensity = act["weighted_average_watts"] / p.ftp
        return intensity * intensity * hours * 100 * w
    if p.lthr and hr:
        r = hr / p.lthr
        return r * r * hours * 100 * w
    if hr and p.hr_max:
        r = min(hr / p.hr_max, 1.1)
        return minutes * r * r * 10 * w
    if act.get("suffer_score"):
        return act["suffer_score"] * w
    return minutes * 0.5 * w


# ---- Forma, intensità, uscite recenti ----

def form_trend(acts: list, details: dict, p: Profile, now_ms: float, tz: ZoneInfo) -> dict:
    """Carico giornaliero degli ultimi 90 giorni e medie esponenziali a 42 giorni (CTL,
    forma fisica) e 7 giorni (ATL, fatica); TSB = CTL - ATL. I giorni sono quelli del
    fuso orario del browser."""
    daily = [0.0] * FORM_DAYS
    for a in acts:
        delta = days_ago(instant_ms(a["start_date_local"]), now_ms, tz)
        if 0 <= delta < FORM_DAYS:
            daily[FORM_DAYS - 1 - delta] += activity_load(a, details.get(a["id"]), p)
    k_ctl = 1 - math.exp(-1 / 42)
    k_atl = 1 - math.exp(-1 / 7)
    ctl = atl = 0.0
    for load in daily:
        ctl += (load - ctl) * k_ctl
        atl += (load - atl) * k_atl
    return {"daily": daily, "ctl": ctl, "atl": atl, "tsb": ctl - atl}


def is_bike(act: dict) -> bool:
    return "Ride" in (act.get("type") or "")


def intensity_split(acts: list, p: Profile, now_ms: float) -> dict:
    """Minuti in bici degli ultimi 28 giorni sopra (duri) e sotto (facili) l'88% della soglia FC."""
    cutoff = now_ms - 28 * 24 * 3600e3
    easy = hard = 0
    for a in acts:
        if not is_bike(a) or instant_ms(a["start_date_local"]) < cutoff:
            continue
        minutes = a["moving_time"] / 60
        hr = a.get("average_heartrate")
        if p.lthr and hr and hr >= 0.88 * p.lthr:
            hard += minutes
        else:
            easy += minutes
    total = easy + hard
    return {
        "easyPct": js_round(100 * easy / total) if total else None,
        "hardPct": js_round(100 * hard / total) if total else None,
        "totalMin": js_round(total),
    }


def recent_rides(acts: list, now_ms: float) -> list:
    """Le uscite in bici degli ultimi 7 giorni, al massimo 10, dalla più recente."""
    cutoff = now_ms - 7 * 24 * 3600e3
    rides = [a for a in acts if is_bike(a) and instant_ms(a["start_date_local"]) >= cutoff][:10]
    return [{
        "data": a["start_date_local"][:10],
        "tipo": a["type"],
        "durataMin": js_round(a["moving_time"] / 60),
        "distanzaKm": js_round(a["distance"] / 100) / 10,
        "avgWatts": a.get("weighted_average_watts") or a.get("average_watts") or None,
        "avgHr": js_round(a["average_heartrate"]) if a.get("average_heartrate") else None,
    } for a in rides]


def capacity_tier(weekly_hours: float | None, ctl: float) -> str:
    """Fascia di volume: ore settimanali dichiarate (6 se mancano) più CTL/20."""
    score = (weekly_hours or 6) + (ctl or 0) / 20
    if score < 6:
        return "Low volume"
    if score < 9:
        return "Mid volume"
    if score < 13:
        return "High volume"
    return "Elite volume"


def coach_context(acts: list, details: dict, p: Profile, now_ms: float, tz: ZoneInfo) -> dict:
    """Il contesto atleta che il Coach passa al modello, con le stesse chiavi del browser."""
    form = form_trend(acts, details, p, now_ms, tz)
    ctl, atl, tsb = js_round(form["ctl"]), js_round(form["atl"]), js_round(form["tsb"])
    return {
        "ftp": p.ftp or None,
        "lthr": p.lthr or None,
        "weight": p.weight or None,
        "ctl": ctl,
        "atl": atl,
        "tsb": tsb,
        "tier": capacity_tier(p.weekly_hours, ctl),
        "polarizzazione": intensity_split(acts, p, now_ms),
        "weeklyHours": p.weekly_hours or None,
        "weeklyDays": p.weekly_days or None,
        "recentDays": recent_rides(acts, now_ms),
        "oggi": day_name(now_ms, tz),
    }


def day_name(ms: float, tz: ZoneInfo) -> str:
    return WEEKDAYS[datetime.fromtimestamp(ms / 1000, tz).isoweekday() % 7]
