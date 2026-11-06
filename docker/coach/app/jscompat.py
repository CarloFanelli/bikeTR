"""Aritmetica e date come le fa JavaScript nel browser, per ottenere gli stessi numeri."""

import math
from datetime import datetime
from zoneinfo import ZoneInfo

DAY_MS = 86_400_000


def js_round(x: float) -> int:
    """Math.round: le metà vanno verso l'alto (round() di Python le manda al numero pari)."""
    r = math.floor(x)
    return r + 1 if x - r >= 0.5 else r


def js_sum(values) -> float:
    """Somma da sinistra a destra, con i valori mancanti (null) contati 0, come in
    JavaScript. sum() di Python 3.12 compensa gli errori di arrotondamento e
    darebbe un risultato diverso nell'ultima cifra."""
    total = 0
    for v in values:
        total += v or 0
    return total


def instant_ms(iso: str) -> float:
    """new Date(iso).getTime(): Strava scrive l'ora locale con una "Z" e il browser la legge come UTC."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000


def local_midnight_ms(ms: float, tz: ZoneInfo) -> float:
    """date.setHours(0, 0, 0, 0) nel fuso orario del browser."""
    local = datetime.fromtimestamp(ms / 1000, tz)
    return datetime(local.year, local.month, local.day, tzinfo=tz).timestamp() * 1000


def days_ago(ms: float, now_ms: float, tz: ZoneInfo) -> int:
    """Giorni di calendario tra il giorno di `ms` e oggi, nel fuso del browser. L'arrotondamento
    assorbe i giorni di 23 o 25 ore dei cambi d'ora."""
    return js_round((local_midnight_ms(now_ms, tz) - local_midnight_ms(ms, tz)) / DAY_MS)


def js_str(value) -> str:
    """String(value) di JavaScript per un valore JSON: null, true, 42 (non 42.0), 12.3,
    [1,2] → "1,2", oggetto → "[object Object]". Vale per numeri né minuscoli né enormi
    (niente notazione esponenziale), come quelli del Coach."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, list):
        return ",".join("" if v is None else js_str(v) for v in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


def js_truthy(value) -> bool:
    """Vero come in JavaScript: [] e {} sono veri; null, false, 0 e "" falsi."""
    return isinstance(value, (list, dict)) or value not in (None, False, 0, "")


def js_slice(text: str, end: int) -> str:
    """text.slice(0, end): JavaScript conta le unità UTF-16, quindi un'emoji vale 2."""
    return text.encode("utf-16-le", "surrogatepass")[: 2 * end].decode("utf-16-le", "surrogatepass")


def js_length(text: str) -> int:
    """text.length in unità UTF-16."""
    return len(text.encode("utf-16-le", "surrogatepass")) // 2
