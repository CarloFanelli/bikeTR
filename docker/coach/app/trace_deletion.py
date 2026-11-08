"""La cancellazione in Phoenix delle tracce della schermata Coach dopo "Disconnetti da Strava":
contengono i numeri calcolati dalle corse, quindi seguono la regola delle corse salvate. Le tracce
del controllo dal vivo e della valutazione stanno in altri progetti e restano: atleti inventati.

La cancellazione parte WAIT secondi dopo il clic, così arrivano anche i passi già in viaggio verso
Phoenix. Fino a quando Phoenix non risponde resta scritta in /data, si riprova ogni RETRY secondi
e, dopo un riavvio del Coach, riparte da sola. Un secondo Disconnetti tiene l'istante più tardo.

Forma del file:
  {before: istante del clic, ISO 8601 in UTC}
"""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

import httpx

from app import tracing

DELETION_FILE = Path("/data/trace-deletion.json")
WAIT = 5
RETRY = 10
# Secondi concessi a Phoenix per ogni tentativo.
SEND_TIMEOUT = 5


class TraceDeletion:
    def __init__(self, path: Path, http: httpx.AsyncClient, sleep=asyncio.sleep):
        self.path = path
        self.http = http
        self.sleep = sleep
        # Il riferimento tiene in vita il task: asyncio da solo lo potrebbe perdere a metà attesa.
        self.task: asyncio.Task | None = None

    def pending(self) -> datetime | None:
        """L'istante del Disconnetti ancora da cancellare in Phoenix; None se non ce n'è."""
        try:
            return datetime.fromisoformat(json.loads(self.path.read_text(encoding="utf-8"))["before"])
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def schedule(self, before: datetime) -> None:
        """Ricorda in /data di cancellare le tracce partite prima di `before` e fa ripartire
        l'attesa. Non aspetta Phoenix."""
        pending = self.pending()
        if pending is None or before > pending:
            # File temporaneo + rename: un'interruzione a metà scrittura non lascia un file troncato.
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"before": before.isoformat()}), encoding="utf-8")
            os.replace(tmp, self.path)
        self.resume()

    def resume(self) -> None:
        """Fa partire la cancellazione in sospeso, se c'è (all'avvio del Coach)."""
        if self.task:
            self.task.cancel()
        if self.pending() is not None:
            self.task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        await self.sleep(WAIT)
        failed = False
        while (before := self.pending()) is not None:
            if await self._delete(before):
                self.path.unlink(missing_ok=True)
                print("[coach] Cancellate in Phoenix le tracce della schermata Coach partite prima di Disconnetti",
                      flush=True)
                return
            if not failed:
                failed = True
                print(f"[coach] Phoenix non risponde su {tracing.PHOENIX_URL}: le tracce della schermata Coach "
                      "si cancellano appena torna", flush=True)
            await self.sleep(RETRY)

    async def _delete(self, before: datetime) -> bool:
        """True se Phoenix non ha più tracce della schermata Coach partite prima di `before`: 204
        cancellate, 404 il progetto non c'è (nessuna richiesta ancora, o dati di Phoenix cancellati)."""
        try:
            # Phoenix vuole anche l'inizio dell'intervallo: tutto quello che viene prima del clic.
            res = await self.http.delete(f"{tracing.PHOENIX_URL}/v1/projects/{tracing.COACH_SCREEN}/traces",
                                         params={"start_time": tracing.EPOCH.isoformat(),
                                                 "end_time": before.isoformat()},
                                         timeout=SEND_TIMEOUT)
        except httpx.HTTPError:
            return False
        return res.status_code in (204, 404)
