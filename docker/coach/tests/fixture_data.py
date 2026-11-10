"""Dati dei test letti da fixtures/: attività, profili e stream inventati, e i risultati
del codice del browser (reference/make_reference.mjs), con i protocolli e la regola di selezione
ammessi oggi e i passaggi dei paper del servizio al posto del catalogo, delle regole e degli abstract
del browser, e la query di ricerca del browser seguita dai protocolli che le regole ammettono."""

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


def with_service_sections(browser: str, papers: list, ctx: dict, minutes: int) -> str:
    """Il prompt di sistema del browser con quello del servizio dal catalogo dei protocolli in poi: i
    protocolli e la regola di selezione ammessi oggi, le differenze tra i Z2 ammessi, i paper con i loro
    passaggi al posto degli abstract, e la risposta che cita i passaggi per etichetta. L'inizio resta
    carattere per carattere quello del browser."""
    catalog = "CATALOGO PROTOCOLLI"
    service = system_prompt(papers, ctx, minutes)
    return browser[:browser.index(catalog)] + service[service.index(catalog):]
