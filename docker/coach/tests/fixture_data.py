"""Dati dei test letti da fixtures/: attività, profili e stream inventati, e i risultati
del codice del browser (reference/make_reference.mjs), con le regole di selezione del servizio
al posto di quelle del browser."""

import json
from pathlib import Path

from app.jscompat import instant_ms
from app.live_check import strava_streams
from app.metrics import Profile, ride_details
from app.prompts import system_prompt

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


RIDES = load("rides.json")
NOW_MS = instant_ms(RIDES["now"])


def profile(name: str) -> Profile:
    p = RIDES["profiles"][name]
    return Profile(ftp=p["ftp"], lthr=p["lthr"], hr_max=p["hrMax"], weight=p["weight"],
                   weekly_hours=p["weeklyHours"], weekly_days=p["weeklyDays"])


DETAILS = {int(i): ride_details(strava_streams(s)) for i, s in RIDES["streams"].items()}


def activities(sc: dict) -> list:
    return [] if sc.get("noActivities") else RIDES["activities"]


def scenario(name: str) -> dict:
    return next(sc for sc in RIDES["scenarios"] if sc["name"] == name)


def rules_section(text: str) -> str:
    """Dalle regole di selezione fino alla spiegazione dei protocolli Z2."""
    return text[text.index("REGOLE DI SELEZIONE"):text.index("DIFFERENZE TRA PROTOCOLLI Z2")]


def with_service_rules(browser: str) -> str:
    """Il prompt di sistema del browser con le regole del servizio al posto delle sue otto, e senza
    la sua regola negativa: il resto resta carattere per carattere quello del browser."""
    browser = browser[:browser.index("REGOLA NEGATIVA")] + browser[browser.index("PAPER SCIENTIFICI RECUPERATI"):]
    return browser.replace(rules_section(browser), rules_section(system_prompt([])))
