"""Il database PostgreSQL del servizio db (compose.yaml): l'indirizzo in DATABASE_URL e le
tabelle create dai file di migrations/, applicati in ordine all'avvio del Coach.

Ogni operazione apre una sua connessione: un solo atleta in locale, e i test del Coach girano
ognuno nel suo ciclo asyncio, a cui un pool di connessioni resterebbe legato."""

import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
DATABASE_UNREACHABLE = "Database non raggiungibile. Controlla i log con: docker compose logs db"


def url() -> str:
    return os.environ["DATABASE_URL"]


async def connect(conninfo: str, autocommit: bool = False) -> psycopg.AsyncConnection:
    return await psycopg.AsyncConnection.connect(conninfo, row_factory=dict_row, autocommit=autocommit)


async def migrate(conninfo: str) -> None:
    """Applica i file di migrations/ non ancora applicati, ognuno nella sua transazione. Il
    lucchetto di sessione evita che due avvii applichino lo stesso file insieme."""
    async with await connect(conninfo, autocommit=True) as conn:
        await conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)")
        await conn.execute("SELECT pg_advisory_lock(7213)")
        try:
            done = {r["name"] for r in await (await conn.execute("SELECT name FROM schema_migrations")).fetchall()}
            for path in sorted(MIGRATIONS.glob("*.sql")):
                if path.name in done:
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
        finally:
            await conn.execute("SELECT pg_advisory_unlock(7213)")
