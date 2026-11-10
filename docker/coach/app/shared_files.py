"""File che il servizio Coach e i comandi di coach-tools scrivono entrambi: sono container diversi
sullo stesso volume, e asyncio.Lock vale per un processo solo."""

import fcntl
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def locked(path: Path):
    """Un processo alla volta tra rilettura e riscrittura del file."""
    with open(path.with_name(path.name + ".lock"), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield   # chiudere il file libera il lucchetto
