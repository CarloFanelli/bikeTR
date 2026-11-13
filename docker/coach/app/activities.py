"""I dati di Strava salvati dal servizio Coach nel database: le attività, i dettagli corsa,
l'atleta con le statistiche e lo stato della sincronizzazione. Appartengono al collegamento:
"Disconnetti da Strava" li cancella.

Ogni scrittura porta la `generation` letta quando il suo download è partito: se nel frattempo
è arrivato un forget(), non salva nulla."""

import asyncio
from datetime import datetime, timedelta

from psycopg.types.json import Jsonb

from app import db
from app.athlete_data import STRAVA_KEYS

DETAIL_KEYS = ("np", "watts_n", "hr_mean", "hr_n")
CARD_FIELDS = ("id", "name", "type", "start_date", "start_date_local", "distance", "moving_time",
               "total_elevation_gain")
# Le attività con potenza misurata o frequenza cardiaca: solo queste hanno dettagli da scaricare.
# La potenza stimata da Strava (senza misuratore) non ha uno stream da leggere.
WITH_DATA = "(summary->>'device_watts')::boolean IS TRUE OR (summary->>'has_heartrate')::boolean IS TRUE"
# Un'attività i cui dettagli non si sono scaricati si riprova dopo questo tempo: una che fallisce
# sempre (cancellata su Strava da più di 30 giorni) non consuma ogni giorno tutte le richieste.
RETRY_FAILED = timedelta(days=1)


def start_date(summary: dict) -> datetime:
    return datetime.fromisoformat(summary["start_date"].replace("Z", "+00:00"))


class ActivityStore:
    def __init__(self, conninfo: str):
        self.conninfo = conninfo
        # Una scrittura alla volta: il controllo della generation e la scrittura vanno insieme.
        self.lock = asyncio.Lock()
        # Cresce a ogni forget(): un download iniziato prima non può più salvare nulla.
        self.generation = 0

    async def _rows(self, query: str, params=()) -> list[dict]:
        async with await db.connect(self.conninfo) as conn:
            return await (await conn.execute(query, params)).fetchall()

    async def _write(self, generation: int, change) -> bool:
        """Esegue change(connessione) in una transazione. False, senza scrivere nulla, se dopo
        `generation` è arrivato un forget()."""
        async with self.lock:
            if generation != self.generation:
                return False
            async with await db.connect(self.conninfo) as conn:
                await change(conn)
            return True

    # ---- Letture ----

    async def sync_state(self) -> dict | None:
        rows = await self._rows("SELECT * FROM strava_sync")
        return rows[0] if rows else None

    async def latest(self, limit: int) -> list[dict]:
        """Le attività più recenti, dalla più nuova, com'erano nella lista di Strava."""
        rows = await self._rows("SELECT summary FROM strava_activities ORDER BY start_date DESC, id DESC LIMIT %s",
                                (limit,))
        return [r["summary"] for r in rows]

    async def cards(self) -> list[dict]:
        """Tutte le attività, dalla più nuova, con i soli campi delle card di Attività e
        dell'ultima uscita di Home: lo storico intero resta leggero."""
        rows = await self._rows(
            f"""SELECT jsonb_build_object({", ".join(f"'{k}', summary->'{k}'" for k in CARD_FIELDS)},
                   'map', jsonb_build_object('summary_polyline', summary->'map'->'summary_polyline')) AS card
                FROM strava_activities ORDER BY start_date DESC, id DESC""")
        return [r["card"] for r in rows]

    async def oldest_and_newest(self) -> tuple[datetime | None, datetime | None]:
        row = (await self._rows("SELECT min(start_date) AS oldest, max(start_date) AS newest FROM strava_activities"))[0]
        return row["oldest"], row["newest"]

    async def summaries(self, ids: list[int]) -> list[dict]:
        """Le attività salvate fra `ids`, come le elenca Strava; quelle non salvate mancano."""
        rows = await self._rows("SELECT summary FROM strava_activities WHERE id = ANY(%s)", (list(ids),))
        return [r["summary"] for r in rows]

    async def details(self, ids: list[int]) -> dict:
        rows = await self._rows("SELECT * FROM ride_details WHERE activity_id = ANY(%s)", (list(ids),))
        return {r["activity_id"]: {k: r[k] for k in DETAIL_KEYS} for r in rows}

    async def next_without_details(self, now: datetime) -> int | None:
        """L'attività più recente con potenza o FC e senza dettagli; quelle già fallite per ultime,
        e solo una volta trascorso RETRY_FAILED dal fallimento."""
        rows = await self._rows(
            f"""SELECT a.id FROM strava_activities a
                LEFT JOIN ride_details d ON d.activity_id = a.id
                LEFT JOIN detail_failures f ON f.activity_id = a.id
                WHERE d.activity_id IS NULL AND ({WITH_DATA}) AND (f.failed_at IS NULL OR f.failed_at <= %s)
                ORDER BY f.failed_at ASC NULLS FIRST, a.start_date DESC, a.id DESC LIMIT 1""",
            (now - RETRY_FAILED,))
        return rows[0]["id"] if rows else None

    async def details_progress(self) -> dict:
        """Quante attività con potenza o FC hanno i dettagli, su quante."""
        row = (await self._rows(
            f"""SELECT count(*) AS total, count(d.activity_id) AS done FROM strava_activities a
                LEFT JOIN ride_details d ON d.activity_id = a.id WHERE {WITH_DATA}"""))[0]
        return {"done": row["done"], "total": row["total"]}

    async def requests_since(self, moment: datetime) -> int:
        return (await self._rows("SELECT count(*) AS n FROM detail_requests WHERE at >= %s", (moment,)))[0]["n"]

    # ---- Scritture ----

    async def record_request(self, now: datetime):
        """Una richiesta di dettagli del download in sottofondo; quelle di oltre due giorni non servono più."""
        async with await db.connect(self.conninfo) as conn:
            await conn.execute("DELETE FROM detail_requests WHERE at < %s", (now - timedelta(days=2),))
            await conn.execute("INSERT INTO detail_requests (at) VALUES (%s)", (now,))

    async def mark_failed(self, generation: int, activity_id: int, now: datetime) -> bool:
        async def change(conn):
            await conn.execute(
                """INSERT INTO detail_failures (activity_id, failed_at)
                   SELECT id, %s FROM strava_activities WHERE id = %s
                   ON CONFLICT (activity_id) DO UPDATE SET failed_at = EXCLUDED.failed_at""",
                (now, activity_id))
        return await self._write(generation, change)


    async def start_sync(self, generation: int, athlete: dict, stats: dict, now: datetime) -> bool:
        """L'atleta e le statistiche appena scaricati. Un atleta diverso da quello salvato: le
        sue attività, i dettagli e i segmenti vanno via prima di scaricare quelli del nuovo."""
        async def change(conn):
            saved = await (await conn.execute("SELECT athlete_id FROM strava_sync")).fetchone()
            if saved and saved["athlete_id"] != athlete["id"]:
                await conn.execute("DELETE FROM strava_activities")
                await conn.execute("DELETE FROM strava_sync")
                await conn.execute("DELETE FROM athlete_data WHERE key = ANY(%s)", (list(STRAVA_KEYS),))
            await conn.execute(
                """INSERT INTO strava_sync (athlete_id, athlete, stats, checked_at) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (only_row) DO UPDATE SET athlete = EXCLUDED.athlete, stats = EXCLUDED.stats,
                   checked_at = EXCLUDED.checked_at""",
                (athlete["id"], Jsonb(athlete), Jsonb(stats), now))
        return await self._write(generation, change)

    async def mark_checked(self, generation: int, now: datetime) -> bool:
        """Strava non ha risposto: anche un tentativo fallito conta per l'attesa fra due controlli."""
        async def change(conn):
            await conn.execute("UPDATE strava_sync SET checked_at = %s", (now,))
        return await self._write(generation, change)

    async def save_activities(self, generation: int, summaries: list[dict]) -> bool:
        async def change(conn):
            async with conn.cursor() as cur:
                await cur.executemany(
                    """INSERT INTO strava_activities (id, start_date, summary) VALUES (%s, %s, %s)
                       ON CONFLICT (id) DO UPDATE SET start_date = EXCLUDED.start_date, summary = EXCLUDED.summary""",
                    [(s["id"], start_date(s), Jsonb(s)) for s in summaries])
        return await self._write(generation, change)

    async def remove_missing(self, generation: int, after: datetime, listed: set[int]) -> bool:
        """Le attività partite dopo `after` che Strava non elenca più: cancellate su Strava."""
        async def change(conn):
            await conn.execute("DELETE FROM strava_activities WHERE start_date > %s AND NOT (id = ANY(%s))",
                               (after, list(listed)))
        return await self._write(generation, change)

    async def finish_sync(self, generation: int, now: datetime, history_complete: bool) -> bool:
        async def change(conn):
            await conn.execute("UPDATE strava_sync SET synced_at = %s, history_complete = %s",
                               (now, history_complete))
        return await self._write(generation, change)

    async def save_details(self, generation: int, activity_id: int, details: dict) -> bool:
        async def change(conn):
            await conn.execute(
                # Un'attività cancellata su Strava durante il download non riceve dettagli.
                """INSERT INTO ride_details (activity_id, np, watts_n, hr_mean, hr_n)
                   SELECT id, %s, %s, %s, %s FROM strava_activities WHERE id = %s
                   ON CONFLICT (activity_id) DO NOTHING""",
                (*(details[k] for k in DETAIL_KEYS), activity_id))
        return await self._write(generation, change)

    async def forget(self):
        async with self.lock:
            self.generation += 1
            async with await db.connect(self.conninfo) as conn:
                await conn.execute("DELETE FROM strava_activities")
                await conn.execute("DELETE FROM strava_sync")
