"""Regole di selezione del Coach: per forma (TSB), quota dura delle ultime 4 settimane e minuti
disponibili, i protocolli che il Coach può scegliere. Vale la prima regola che si applica: prima
riposo e recupero, poi la durata, poi le altre. Ogni regola dice la sua fonte: il paper
dell'indice che ne dà il numero, o la pratica di allenamento quando nessun paper lo dà."""

from dataclasses import dataclass
from functools import cache

from app.protocols import PROTOCOLS


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

    def applies(self, tsb: int, hard: int | None, minutes: int) -> bool:
        return ((self.tsb_below is None or tsb < self.tsb_below)
                and (self.tsb_from is None or tsb >= self.tsb_from)
                and (not self.hard_unknown or hard is None)
                and (self.hard_below is None or (hard is not None and hard < self.hard_below))
                and (self.hard_from is None or (hard is not None and hard >= self.hard_from))
                and (self.minutes_below is None or minutes < self.minutes_below)
                and (self.minutes_from is None or minutes >= self.minutes_from))

    def sentence(self) -> str:
        """La regola in italiano, con i nomi che il modello vede nel prompt (TSB, hard, durata)."""
        when = []
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
        *others, last = self.protocols
        protocols = f"{', '.join(others)} o {last}" if others else last
        source = f"[PMID:{self.source_pmid}]" if self.source_pmid else "[pratica]"
        return f"{condition[0].upper()}{condition[1:]}: {protocols} {source}"


Z2_DAYS = ("z2_endurance", "z2_cadence_drills", "z2_progressive")
QUALITY = ("sweet_spot_3x15", "threshold_3x10", "tempo_2x20")

# Le soglie di forma e di durata non vengono da un paper: sono pratica. Le soglie della quota dura
# stanno intorno al 20% di lavoro intenso di Seiler 2010 (20861519); Stöggl 2014 (24550842): chi fa
# solo volume a bassa intensità non migliora, il polarizzato sì.
RULES = (
    Rule("riposo", ("rest",), None, tsb_below=-25),
    Rule("recupero", ("z1_recovery", "rest"), None, tsb_below=-15),
    Rule("uscita_lunga", ("z2_long_intervals",), None, minutes_from=120),
    Rule("poco_tempo", ("z2_endurance", "z2_progressive"), None, minutes_below=50),
    Rule("ripresa", Z2_DAYS, None, hard_unknown=True),
    Rule("gia_stressato", Z2_DAYS, "20861519", hard_from=30),
    Rule("un_po_stanco", Z2_DAYS, None, tsb_below=-10),
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
    tsb, hard = ctx["tsb"], ctx["polarizzazione"]["hardPct"]
    rule = next(r for r in RULES if r.applies(tsb, hard, minutes))
    return rule, [pid for pid in rule.protocols if fits(pid, minutes)]
