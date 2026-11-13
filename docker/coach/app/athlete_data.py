"""I dati dell'atleta che l'app salva sul server: impostazioni, giorni saltati e di pioggia,
storico FTP, mesociclo, segmenti preferiti scaricati e ultima durata chiesta al Coach. Sono gli
stessi in ogni browser; il tema, la scheda di Analisi e la vista di Attività restano in ognuno.

Ogni valore si controlla prima di salvarlo, campo per campo, con la forma che il browser gli dà
(web/src/core/settings.ts, ftp.ts, meso.ts, segments.ts): un campo sconosciuto o di un tipo
sbagliato fa rifiutare il valore intero, con il nome del campo, e nulla viene salvato."""

from typing import Annotated, Any

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, ValidationError

from app import db
from app.errors import CoachError

Day = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class Strict(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Settings(Strict):
    hrMax: float | None = None
    hrLthr: float | None = None
    lthrSource: str | None = None
    ftpDeclared: float | None = None
    ftpSource: str | None = None
    weeklyHours: float | None = None
    weeklyDays: float | None = None
    longRides: float | None = None
    weight: float | None = None
    strengthLevel: float | None = None
    longRideMaxMin: float | None = None
    availableDays: list[int] | None = None
    longRideDays: list[int] | None = None
    raceDate: str | None = None
    raceName: str | None = None
    hasCompression: bool | None = None
    hasMassageGun: bool | None = None


class FtpPoint(Strict):
    date: str
    ftp: float
    source: str


class MesoBlockRecord(Strict):
    blockId: str
    startDate: str
    endDate: str
    weeks: int


class MesoFtpPoint(Strict):
    date: str
    ftp: float


class Mesocycle(Strict):
    startDate: str
    blockIndex: int
    blockId: str
    weekInBlock: int
    blockHistory: list[MesoBlockRecord]
    ftpHistory: list[MesoFtpPoint]


class SegmentCacheEntry(Strict):
    # I tentativi e il segmento sono come li dà Strava: qui si controlla solo che ci siano.
    efforts: list[dict[str, Any]] | None = None
    fetched: float | None = Field(None, alias="_fetched")
    segment: dict[str, Any] | None = Field(None, alias="_segment")


class CoachSettings(Strict):
    lastDuration: float | None = None


KEYS: dict[str, TypeAdapter] = {
    "settings": TypeAdapter(Settings),
    "plannedRests": TypeAdapter(list[Day]),
    "rainyDays": TypeAdapter(list[Day]),
    "ftpHistory": TypeAdapter(list[FtpPoint]),
    "mesocycle": TypeAdapter(Mesocycle),
    "segmentCache": TypeAdapter(dict[str, SegmentCacheEntry]),
    "coachSettings": TypeAdapter(CoachSettings),
}
# Dati di Strava: "Disconnetti da Strava" li cancella, gli altri restano.
STRAVA_KEYS = ("segmentCache",)


def check(key: str, value: Any):
    if key not in KEYS:
        raise CoachError(404, "unknown_key", f"Dato sconosciuto: {key}")
    try:
        KEYS[key].validate_python(value, strict=True)
    except ValidationError as e:
        first = e.errors()[0]
        field = ".".join(str(part) for part in (key, *first["loc"]))
        reason = "è un campo sconosciuto" if first["type"] == "extra_forbidden" else "ha un valore del tipo sbagliato"
        raise CoachError(422, "invalid_data", f"Dati rifiutati: {field} {reason}. Nulla è stato salvato.")


class AthleteData:
    def __init__(self, conninfo: str):
        self.conninfo = conninfo

    async def all(self) -> dict:
        async with await db.connect(self.conninfo) as conn:
            rows = await (await conn.execute("SELECT key, value FROM athlete_data")).fetchall()
        return {r["key"]: r["value"] for r in rows}

    async def save(self, key: str, value: Any):
        check(key, value)
        async with await db.connect(self.conninfo) as conn:
            await conn.execute(
                """INSERT INTO athlete_data (key, value) VALUES (%s, %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""", (key, Jsonb(value)))

    async def import_all(self, data: dict) -> bool:
        """I dati di un browser, tutti insieme e solo se il server non ne ha: False, senza
        salvare nulla, se un altro browser è arrivato prima."""
        for key, value in data.items():
            check(key, value)
        async with await db.connect(self.conninfo) as conn:
            # Il lucchetto sulla tabella: due browser che importano insieme non salvano entrambi.
            await conn.execute("LOCK TABLE athlete_data IN EXCLUSIVE MODE")
            if await (await conn.execute("SELECT 1 FROM athlete_data LIMIT 1")).fetchone():
                return False
            for key, value in data.items():
                await conn.execute("INSERT INTO athlete_data (key, value) VALUES (%s, %s)", (key, Jsonb(value)))
        return True

    async def forget_strava(self):
        async with await db.connect(self.conninfo) as conn:
            await conn.execute("DELETE FROM athlete_data WHERE key = ANY(%s)", (list(STRAVA_KEYS),))
