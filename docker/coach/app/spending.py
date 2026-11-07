"""La spesa per il modello chat in cloud: il costo di ogni risposta, dai token e dai prezzi di
.env, e il totale speso, in /data/spending.json ({"total": dollari}). Il file sta nel volume
dei dati del Coach: resta dopo un riavvio e dopo "Disconnetti da Strava", e solo
`docker compose down -v` lo cancella. Il controllo dal vivo (coach-tools) usa lo stesso file,
quindi lo stesso tetto. Le risposte di Ollama non costano nulla e non passano di qui."""

import fcntl
import json
import os
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.errors import CoachError
from app.jscompat import is_number

SPENDING_FILE = Path("/data/spending.json")
# Una risposta fermata prima che il provider dica i token (Stop, silenzio, connessione caduta,
# provider che non li manda) costa quanto la più lunga possibile: il provider fa pagare anche
# quello che ha già scritto, e il tetto deve valere comunque.
CEILING_INPUT_TOKENS = 8000
CEILING_OUTPUT_TOKENS = 4000


@dataclass(frozen=True)
class Prices:
    input: float    # dollari per milione di token letti
    output: float   # dollari per milione di token scritti
    limit: float    # tetto di spesa in dollari


def cost(prices: Prices | None, input_tokens: int | None, output_tokens: int | None) -> float | None:
    """Il costo di una risposta in dollari; None con Ollama o senza i token."""
    if prices is None or input_tokens is None or output_tokens is None:
        return None
    return (input_tokens * prices.input + output_tokens * prices.output) / 1_000_000


def charge(prices: Prices, input_tokens: int | None, output_tokens: int | None) -> float:
    """Quanto aggiungere al totale: il costo della risposta, o quello massimo senza i token."""
    known = cost(prices, input_tokens, output_tokens)
    return known if known is not None else cost(prices, CEILING_INPUT_TOKENS, CEILING_OUTPUT_TOKENS)


def is_amount(value) -> bool:
    return is_number(value) and value >= 0


class Spending:
    def __init__(self, path: Path):
        self.path = path

    def unreadable(self) -> CoachError:
        return CoachError(500, "spending_unreadable",
                          f"Il totale della spesa cloud in {self.path} non si legge: le richieste cloud restano "
                          'ferme finché il file non contiene {"total": dollari spesi}.')

    def total(self) -> float:
        """I dollari spesi finora; 0 prima della prima risposta cloud. Un file illeggibile non
        vale 0: le richieste cloud si fermano e il file resta com'è."""
        try:
            total = json.loads(self.path.read_text(encoding="utf-8"))["total"]
        except FileNotFoundError:
            return 0.0
        except (OSError, ValueError, KeyError, TypeError, RecursionError) as e:
            raise self.unreadable() from e
        if not is_amount(total):
            raise self.unreadable()
        return float(total)

    def check(self, limit: float) -> None:
        """Rifiuta la richiesta cloud se il totale ha raggiunto il tetto. Due richieste partite
        insieme appena sotto il tetto vanno avanti entrambe: lo superano al massimo di due risposte."""
        spent = self.total()
        if spent >= limit:
            raise CoachError(402, "spending_cap",
                             f"Tetto di spesa raggiunto: spesi ${spent:.4f} su un limite di ${limit:.2f} "
                             "(CLOUD_SPENDING_LIMIT in .env). Alza il limite per continuare.")

    def add(self, dollars: float) -> float:
        """Aggiunge al totale e ritorna quello nuovo. Senza attese async: una richiesta annullata
        (Stop) registra comunque la sua spesa."""
        with self.locked():
            total = self.total() + dollars
            # File temporaneo + rename, come store.py: mai un totale scritto a metà.
            tmp = self.path.with_name(self.path.name + ".tmp")
            tmp.write_text(json.dumps({"total": total}), encoding="utf-8")
            os.replace(tmp, self.path)
        return total

    @contextmanager
    def locked(self):
        """Un processo alla volta tra rilettura e riscrittura: il servizio Coach e il controllo
        dal vivo sono due container sullo stesso file, e asyncio.Lock vale per un processo solo."""
        with open(self.path.with_name(self.path.name + ".lock"), "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield   # chiudere il file libera il lucchetto
