"""Corse salvate dal servizio Coach nel volume /data: l'ultima lista di attività scaricata
da Strava, l'atleta a cui appartiene e i dettagli corsa. Appartengono al collegamento:
"Disconnetti da Strava" le cancella.

Forma del file:
  {athlete_id, downloaded_at (ms), activities: [...], details: {id corsa: dettagli}}
"""

import asyncio
import json
import os
from pathlib import Path

DETAIL_KEYS = {"np", "watts_n", "hr_mean", "hr_n"}


def valid_details(d) -> bool:
    return isinstance(d, dict) and set(d) == DETAIL_KEYS


class RideStore:
    def __init__(self, path: Path):
        self.path = path
        # Una sola scrittura alla volta: ognuna rilegge il file, lo cambia e lo riscrive.
        self.lock = asyncio.Lock()
        # Cresce a ogni forget(): un download iniziato prima non può più salvare nulla.
        self.generation = 0

    def load(self) -> dict | None:
        """I dati salvati; None se mancano, sono illeggibili o corrotti (si riscaricano)."""
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not (isinstance(data["activities"], list) and isinstance(data["details"], dict)
                    and isinstance(data["downloaded_at"], (int, float))):
                return None
            details = {int(k): v for k, v in data["details"].items() if valid_details(v)}
        except (OSError, ValueError, KeyError, TypeError):
            return None
        return {**data, "details": details}

    def _save(self, data: dict):
        # File temporaneo + rename: un'interruzione a metà scrittura non lascia un file troncato.
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        os.replace(tmp, self.path)

    async def update(self, generation: int, change) -> bool:
        """Salva change(dati salvati o None). False, senza salvare, se dopo `generation`
        è arrivato un forget()."""
        async with self.lock:
            if generation != self.generation:
                return False
            self._save(change(self.load()))
            return True

    async def forget(self):
        async with self.lock:
            self.generation += 1
            self.path.unlink(missing_ok=True)
