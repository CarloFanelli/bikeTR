"""Regole di selezione del Coach: per forma (TSB), quota dura delle ultime 4 settimane e minuti
disponibili, i protocolli che il Coach può scegliere. Vale la prima regola che si applica: prima
riposo e recupero, poi la durata, poi le altre. Ogni regola dice la sua fonte: il paper
dell'indice che ne dà il numero, o la pratica di allenamento quando nessun paper lo dà.

Tre regole leggono anche il tipo delle uscite recenti (gara ieri, due giorni duri, una settimana
tranquilla): solo con le etichette delle corse accese le uscite ne hanno uno, con i giorni passati,
quindi con le etichette spente non valgono mai e la scelta resta quella di sempre."""

from dataclasses import dataclass
from functools import cache
from itertools import count

from app.protocols import PROTOCOLS

# Le etichette di un'uscita dura, e i giorni (da oggi) in cui due uscite dure fanno due giorni duri.
HARD_LABELS = ("ripetute", "gara")
HARD_DAYS_WINDOW = 3
# Le uscite degli ultimi 7 giorni (quelle del prompt) che fanno una settimana tranquilla.
QUIET_WEEK_MIN_RIDES = 3


def labelled(rides: list[dict]) -> list[dict]:
    """Le uscite recenti con tipo e giorni passati: nessuna con le etichette spente."""
    return [r for r in rides if r.get("label") and r.get("giorniFa") is not None]


@dataclass(frozen=True)
class Rule:
    name: str
    protocols: tuple[str, ...]
    # Il paper dell'indice che dà il numero della regola; None = pratica.
    source_pmid: str | None
    # Condizioni, tutte insieme. "below" esclude la soglia, "from" la include: un valore sulla
    # soglia appartiene sempre alla regola che dice "da … in su".
    tsb_below: int | None = None
    tsb_from: int | None = None
    hard_unknown: bool = False
    hard_below: int | None = None
    hard_from: int | None = None
    minutes_below: int | None = None
    minutes_from: int | None = None
    # Condizioni sul tipo delle uscite recenti: valgono solo con le etichette accese.
    race_yesterday: bool = False
    hard_rides_min: int | None = None
    quiet_week: bool = False

    @property
    def reads_labels(self) -> bool:
        return self.race_yesterday or self.hard_rides_min is not None or self.quiet_week

    def applies(self, tsb: int, hard: int | None, minutes: int, rides: list[dict] = ()) -> bool:
        if self.reads_labels and not self.applies_to_rides(labelled(list(rides))):
            return False
        return ((self.tsb_below is None or tsb < self.tsb_below)
                and (self.tsb_from is None or tsb >= self.tsb_from)
                and (not self.hard_unknown or hard is None)
                and (self.hard_below is None or (hard is not None and hard < self.hard_below))
                and (self.hard_from is None or (hard is not None and hard >= self.hard_from))
                and (self.minutes_below is None or minutes < self.minutes_below)
                and (self.minutes_from is None or minutes >= self.minutes_from))

    def applies_to_rides(self, rides: list[dict]) -> bool:
        hard_days = [r for r in rides if r["label"] in HARD_LABELS and r["giorniFa"] <= HARD_DAYS_WINDOW]
        return ((not self.race_yesterday or any(r["label"] == "gara" and r["giorniFa"] == 1 for r in rides))
                and (self.hard_rides_min is None or len(hard_days) >= self.hard_rides_min)
                and (not self.quiet_week or (len(rides) >= QUIET_WEEK_MIN_RIDES
                                             and not any(r["label"] in HARD_LABELS for r in rides))))

    def sentence(self, protocols: list[str] | None = None) -> str:
        """La regola in italiano, con i nomi che il modello vede nel prompt (TSB, hard, durata); con
        `protocols`, solo quelli al posto di tutti i protocolli della regola."""
        when = []
        if self.race_yesterday:
            when.append("gara ieri")
        if self.hard_rides_min is not None:
            when.append(f"almeno {self.hard_rides_min} uscite di ripetute o gara negli ultimi {HARD_DAYS_WINDOW} giorni")
        if self.quiet_week:
            when.append(f"almeno {QUIET_WEEK_MIN_RIDES} uscite negli ultimi 7 giorni e nessuna di ripetute o gara")
        if self.tsb_below is not None:
            when.append(f"TSB sotto {self.tsb_below:+d}")
        if self.hard_unknown:
            when.append("hard sconosciuta (—%: nessuna uscita negli ultimi 28 giorni)")
        if self.hard_below is not None:
            when.append(f"hard sotto il {self.hard_below}%")
        if self.hard_from is not None:
            when.append(f"hard dal {self.hard_from}% in su")
        if self.tsb_from is not None:
            when.append(f"TSB da {self.tsb_from:+d} in su")
        if self.minutes_below is not None:
            when.append(f"durata sotto i {self.minutes_below} minuti")
        if self.minutes_from is not None:
            when.append(f"durata da {self.minutes_from} minuti in su")
        condition = " e ".join(when) if when else "in tutti gli altri casi"
        *others, last = self.protocols if protocols is None else protocols
        listed = f"{', '.join(others)} o {last}" if others else last
        source = f"[PMID:{self.source_pmid}]" if self.source_pmid else "[pratica]"
        return f"{condition[0].upper()}{condition[1:]}: {listed} {source}"


Z2_DAYS = ("z2_endurance", "z2_cadence_drills", "z2_progressive")
QUALITY = ("sweet_spot_3x15", "threshold_3x10", "tempo_2x20")

# Le soglie di forma e di durata non vengono da un paper: sono pratica. Le soglie della quota dura
# stanno intorno al 20% di lavoro intenso di Seiler 2010 (20861519); Stöggl 2014 (24550842): chi fa
# solo volume a bassa intensità non migliora, il polarizzato sì. Dopo una gara, o dopo due giorni
# duri, un giorno facile è pratica (non mettere giorni duri uno dopo l'altro); dopo una settimana di
# solo fondo, la seduta di qualità segue Stöggl 2014.
RULES = (
    Rule("riposo", ("rest",), None, tsb_below=-25),
    Rule("recupero", ("z1_recovery", "rest"), None, tsb_below=-15),
    Rule("dopo_gara", ("z1_recovery", "rest"), None, race_yesterday=True),
    Rule("due_giorni_duri", Z2_DAYS, None, hard_rides_min=2),
    Rule("uscita_lunga", ("z2_long_intervals",), None, minutes_from=120),
    Rule("poco_tempo", ("z2_endurance", "z2_progressive"), None, minutes_below=50),
    Rule("ripresa", Z2_DAYS, None, hard_unknown=True),
    Rule("gia_stressato", Z2_DAYS, "20861519", hard_from=30),
    Rule("un_po_stanco", Z2_DAYS, None, tsb_below=-10),
    Rule("qualita_dopo_fondo", ("seiler_4x8", *QUALITY), "24550842", quiet_week=True, tsb_from=5),
    Rule("sotto_stimolato_fresco", ("seiler_4x8", *QUALITY), "24550842", hard_below=15, tsb_from=5),
    Rule("sotto_stimolato", QUALITY, "24550842", hard_below=15),
    Rule("fresco", ("seiler_4x8", "seiler_4x4", "ronnestad_30_15", "over_under"), None, tsb_from=10),
    Rule("base", (*QUALITY, "z2_cadence_drills"), None),
)


@cache
def fits(protocol_id: str, minutes: int) -> bool:
    """Il protocollo entra nei minuti: il suo build non rinuncia. Dipende solo dalla durata, non
    dall'FTP."""
    return PROTOCOLS[protocol_id].build(250, minutes) is not None


def select(ctx: dict, minutes: int) -> tuple[Rule, list[str]]:
    """La prima regola che vale per l'atleta, e i suoi protocolli che entrano nei minuti."""
    tsb, hard, rides = ctx["tsb"], ctx["polarizzazione"]["hardPct"], ctx.get("recentDays", [])
    rule = next(r for r in RULES if r.applies(tsb, hard, minutes, rides))
    return rule, [pid for pid in rule.protocols if fits(pid, minutes)]


def minimum_minutes(protocol_id: str) -> int:
    """I minuti più corti in cui il protocollo entra: da lì in su entra sempre."""
    return next(m for m in count() if fits(protocol_id, m))


def fallback_protocol_id(ctx: dict, duration: int) -> str:
    """Scelta deterministica quando il modello non dà una risposta utilizzabile: il primo
    protocollo che la regola dell'atleta ammette."""
    return select(ctx, duration)[1][0]
