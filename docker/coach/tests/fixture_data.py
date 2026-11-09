"""Dati dei test letti da fixtures/: attività, profili e stream inventati, e i risultati
del codice del browser (reference/make_reference.mjs), con le regole di selezione e i passaggi
dei paper del servizio al posto delle regole e degli abstract del browser, e la query di ricerca
del browser seguita dai protocolli che le regole ammettono."""

import json
from pathlib import Path
from zoneinfo import ZoneInfo

from app.jscompat import instant_ms
from app.live_check import strava_streams
from app.metrics import Profile, coach_context, ride_details
from app.prompts import system_prompt
from app.protocols import PROTOCOLS
from app.selection_rules import select

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


def case_context(case: dict) -> dict:
    """Il contesto atleta di un caso del browser, calcolato dalle corse inventate."""
    sc = scenario(case["scenario"])
    return coach_context(activities(sc), DETAILS, profile(sc["profile"]), NOW_MS, ZoneInfo(case["timeZone"]))


def service_query(browser: str, ctx: dict, minutes: int) -> str:
    """La query di ricerca del browser, poi i nomi dei protocolli che le regole di selezione ammettono."""
    return " ".join([browser, *(PROTOCOLS[pid].name for pid in select(ctx, minutes)[1])])


def rules_section(text: str) -> str:
    """Dalle regole di selezione fino alla spiegazione dei protocolli Z2."""
    return text[text.index("REGOLE DI SELEZIONE"):text.index("DIFFERENZE TRA PROTOCOLLI Z2")]


def with_service_sections(browser: str, papers: list) -> str:
    """Il prompt di sistema del browser con le regole del servizio al posto delle sue otto, senza la
    sua regola negativa, e dai paper in fondo quello del servizio: i paper con i loro passaggi al posto
    degli abstract, e la risposta che cita i passaggi per etichetta. Il resto resta carattere per
    carattere quello del browser."""
    papers_title = "PAPER SCIENTIFICI RECUPERATI"
    service = system_prompt(papers)
    browser = browser[:browser.index("REGOLA NEGATIVA")] + service[service.index(papers_title):]
    return browser.replace(rules_section(browser), rules_section(service))
