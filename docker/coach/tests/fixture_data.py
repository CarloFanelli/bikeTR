"""Dati dei test letti da fixtures/: attività, profili e stream inventati, e i risultati
del codice del browser (reference/make_reference.mjs)."""

import json
from pathlib import Path

from app.jscompat import instant_ms
from app.metrics import Profile, ride_details

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


RIDES = load("rides.json")
NOW_MS = instant_ms(RIDES["now"])


def profile(name: str) -> Profile:
    p = RIDES["profiles"][name]
    return Profile(ftp=p["ftp"], lthr=p["lthr"], hr_max=p["hrMax"], weight=p["weight"],
                   weekly_hours=p["weeklyHours"], weekly_days=p["weeklyDays"])


def streams(blocks: dict) -> dict:
    """Stream in formato Strava dai blocchi [valore, secondi] delle fixtures."""
    return {k: {"data": [v for v, n in b for _ in range(n)]} for k, b in blocks.items()}


DETAILS = {int(i): ride_details(streams(s)) for i, s in RIDES["streams"].items()}


def activities(sc: dict) -> list:
    return [] if sc.get("noActivities") else RIDES["activities"]


def scenario(name: str) -> dict:
    return next(sc for sc in RIDES["scenarios"] if sc["name"] == name)
