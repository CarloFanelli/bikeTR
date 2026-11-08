"""Catalogo dei protocolli del Coach: il modello sceglie solo l'id, watt e struttura
li calcola il codice. Ogni build(ftp, durata) ritorna {title, targetWatt, struttura}
oppure None se la durata non basta per quel protocollo."""

from dataclasses import dataclass
from typing import Callable

from app.jscompat import js_round


def round5(w: float) -> int:
    return js_round(w / 5) * 5


@dataclass(frozen=True)
class Protocol:
    name: str
    # Il paper di supporto, nell'indice: il suo titolo o abstract descrive il protocollo.
    # None = pratica di allenamento, nessuno studio lo descrive.
    source_pmid: str | None
    build: Callable[[float, int], dict | None]


def workout(title: str, target: str, steps: list[str]) -> dict:
    return {"title": title, "targetWatt": target, "struttura": steps}


def z1_recovery(ftp, dur):
    lo, hi = round5(ftp * 0.45), round5(ftp * 0.55)
    warm, cool = 5, 5
    main = dur - warm - cool
    return workout("Recupero attivo Z1", f"{lo}-{hi}W (45-55% FTP)", [
        f"Riscaldamento {warm}': partenza fluida, cadenza 90+ rpm",
        f"Lavoro {main}': costante {lo}-{hi}W, gambe sciolte, niente sforzi",
        f"Defaticamento {cool}': scendere progressivamente",
    ])


def z2_endurance(ftp, dur):
    z1 = round5(ftp * 0.55)
    lo, hi = round5(ftp * 0.70), round5(ftp * 0.80)
    warm, cool = 10, 10
    main = dur - warm - cool
    return workout("Z2 Aerobico (steady)", f"{lo}-{hi}W (70-80% FTP)", [
        f"Riscaldamento {warm}': salita progressiva {z1}→{lo}W",
        f"Lavoro {main}': costante {lo}-{hi}W, respirazione fluida (RPE 4-5/10)",
        f"Defaticamento {cool}': scendere gradualmente a {z1}W",
    ])


def z2_long_intervals(ftp, dur):
    z1 = round5(ftp * 0.55)
    lo, hi = round5(ftp * 0.70), round5(ftp * 0.80)
    w95 = round5(ftp * 0.95)
    closer = 3 * 5 + 2 * 3 + 5
    warm = 10
    base = dur - warm - closer
    return workout("Long ride Z2 + ride-at-the-end", f"Base {lo}-{hi}W · Intervalli {w95}W", [
        f"Riscaldamento {warm}': progressivo",
        f"Base {base}': costante {lo}-{hi}W (70-80% FTP), nutrizione 60-90g CHO/h",
        f"Finale: 3 × 5' @ {w95}W (95% FTP), recupero 3' @ {z1}W tra ripetute — fatigue resistance",
        f"Defaticamento 5': {z1}W",
    ])


def sweet_spot_3x15(ftp, dur):
    lo, hi = round5(ftp * 0.88), round5(ftp * 0.93)
    z1 = round5(ftp * 0.55)
    warm = 10
    reps, reps_time = 3, 3 * 15 + 2 * 5
    if dur < warm + 5 + reps_time:
        reps, reps_time = 2, 2 * 15 + 1 * 5
        if dur < warm + 5 + reps_time:
            return None
    cool = dur - warm - reps_time
    return workout(f"Sweet Spot {reps}×15'", f"{lo}-{hi}W (88-93% FTP)", [
        f"Riscaldamento {warm}': salita progressiva fino a soglia",
        f"{reps} × 15' @ {lo}-{hi}W, recupero 5' @ {z1}W tra ripetute",
        f"Defaticamento {cool}': {z1}W",
    ])


def threshold_3x10(ftp, dur):
    lo, hi = round5(ftp * 0.95), round5(ftp * 1.00)
    z1 = round5(ftp * 0.55)
    reps_time, warm = 3 * 10 + 2 * 4, 12
    if dur < warm + 5 + reps_time:
        return None
    cool = dur - warm - reps_time
    return workout("Soglia 3×10'", f"{lo}-{hi}W (95-100% FTP)", [
        f"Riscaldamento {warm}': progressivo + 2-3 spin-up da 30\"",
        f"3 × 10' @ {lo}-{hi}W, recupero 4' @ {z1}W",
        f"Defaticamento {cool}': {z1}W",
    ])


def seiler_4x8(ftp, dur):
    lo, hi = round5(ftp * 1.05), round5(ftp * 1.10)
    z1 = round5(ftp * 0.55)
    reps_time, warm = 4 * 8 + 3 * 2, 15
    if dur < warm + 7 + reps_time:
        return None
    cool = dur - warm - reps_time
    return workout("Seiler 4×8'", f"{lo}-{hi}W (105-110% FTP)", [
        f"Riscaldamento {warm}': progressivo + 3 × 30\" spin-up",
        f"4 × 8' @ {lo}-{hi}W (regola d'oro: ultima ripetuta = prima), recupero 2' @ {z1}W",
        f"Defaticamento {cool}': {z1}W",
    ])


def seiler_4x4(ftp, dur):
    lo, hi = round5(ftp * 1.15), round5(ftp * 1.20)
    z1 = round5(ftp * 0.55)
    reps_time, warm = 4 * 4 + 3 * 3, 15
    if dur < warm + 8 + reps_time:
        return None
    cool = dur - warm - reps_time
    return workout("Seiler 4×4' (VO2max)", f"{lo}-{hi}W (115-120% FTP)", [
        f"Riscaldamento {warm}': progressivo + 3 × 30\" all-out",
        f"4 × 4' @ {lo}-{hi}W (sforzo massimale sostenuto), recupero 3' @ {z1}W",
        f"Defaticamento {cool}': {z1}W",
    ])


def ronnestad_30_15(ftp, dur):
    w105, easy = round5(ftp * 1.05), round5(ftp * 0.50)
    z1 = round5(ftp * 0.55)
    reps_time, warm = 3 * 9 + 2 * 3, 15
    if dur < warm + 7 + reps_time:
        return None
    cool = dur - warm - reps_time
    return workout("Rønnestad 30/15", f"{w105}W on · {easy}W off", [
        f"Riscaldamento {warm}': progressivo",
        f"3 set × 12 × (30\" @ {w105}W / 15\" @ {easy}W), recupero 3' @ {z1}W tra set",
        f"Defaticamento {cool}': {z1}W",
    ])


def over_under(ftp, dur):
    over, under = round5(ftp * 1.05), round5(ftp * 0.95)
    z1 = round5(ftp * 0.55)
    reps_time, warm = 3 * 12 + 2 * 5, 12
    if dur < warm + 6 + reps_time:
        return None
    cool = dur - warm - reps_time
    return workout("Over-Under 3 blocchi", f"Over {over}W · Under {under}W", [
        f"Riscaldamento {warm}': progressivo",
        f"3 blocchi × [3 × (2' @ {over}W + 2' @ {under}W)] continuo, recupero 5' @ {z1}W tra blocchi",
        f"Defaticamento {cool}': {z1}W",
    ])


def z2_cadence_drills(ftp, dur):
    lo, hi = round5(ftp * 0.70), round5(ftp * 0.80)
    z1 = round5(ftp * 0.55)
    drill = round5(ftp * 0.65)
    drills = 3 * 5 + 2 * 3
    warm, cool = 10, 5
    main = dur - warm - cool - drills
    if main < 10:
        return None
    return workout("Z2 + cadence drills", f"{lo}-{hi}W base · {drill}W drill (cadenza 100+ rpm)", [
        f"Riscaldamento {warm}': progressivo",
        f"Z2 base {main}': {lo}-{hi}W (70-80% FTP), cadenza libera 85-95 rpm",
        f"Drill 3 × 5' a cadenza alta (100-110 rpm) @ {drill}W (65% FTP, mantieni potenza), rec 3' a cadenza normale",
        f"Defaticamento {cool}': {z1}W",
    ])


def tempo_2x20(ftp, dur):
    lo, hi = round5(ftp * 0.83), round5(ftp * 0.87)
    z1 = round5(ftp * 0.55)
    reps_time, warm = 2 * 20 + 1 * 5, 10
    if dur < warm + 5 + reps_time:
        return None
    cool = dur - warm - reps_time
    return workout("Tempo 2×20'", f"{lo}-{hi}W (83-87% FTP)", [
        f"Riscaldamento {warm}': progressivo",
        f"2 × 20' @ {lo}-{hi}W (tempo continuo, RPE 6/10), recupero 5' @ {z1}W",
        f"Defaticamento {cool}': {z1}W",
    ])


def z2_progressive(ftp, dur):
    w65, w75, w85 = round5(ftp * 0.65), round5(ftp * 0.75), round5(ftp * 0.85)
    z1 = round5(ftp * 0.55)
    warm, cool = 8, 5
    blocks = dur - warm - cool
    blk = blocks // 3
    return workout("Z2 progressivo (build-up)", f"{w65}W → {w75}W → {w85}W", [
        f"Riscaldamento {warm}': partenza fluida",
        f"Blocco 1 ({blk}'): costante {w65}W (65% FTP, conversazionale)",
        f"Blocco 2 ({blk}'): salita a {w75}W (75% FTP, respirazione fluida)",
        f"Blocco 3 ({blocks - 2 * blk}'): finale a {w85}W (85% FTP, stimolo sub-soglia)",
        f"Defaticamento {cool}': {z1}W",
    ])


def rest(ftp, dur):
    return workout("Riposo / mobilità", "—", [
        "Sonno + idratazione + nutrienti (recupero attivo del sistema nervoso).",
        "Mobilità leggera 15-20' opzionale: foam rolling, hip flexor stretch, 90/90 rotation.",
        "Il fitness cresce durante il riposo, non durante l'allenamento.",
    ])


# L'ordine è quello del catalogo nel prompt. Accanto a ogni paper di supporto, cosa descrive.
PROTOCOLS = {
    "z1_recovery": Protocol("Recupero attivo Z1", None, z1_recovery),
    # Sitko 2025: Z2 appena sotto la prima soglia, anche in sedute continue.
    "z2_endurance": Protocol("Z2 Aerobico", "40010355", z2_endurance),
    # Spragg 2023: tempo sotto la prima soglia e potenza dopo 2000 kJ di lavoro (durability).
    "z2_long_intervals": Protocol("Long ride Z2 + ride-at-the-end", "35239466", z2_long_intervals),
    "sweet_spot_3x15": Protocol("Sweet Spot 3×15'", None, sweet_spot_3x15),
    "threshold_3x10": Protocol("Soglia 3×10'", None, threshold_3x10),
    # Seiler 2013: 4 × 8' meglio di 4 × 4' e 4 × 16' a sforzo massimo sostenibile.
    "seiler_4x8": Protocol("Seiler 4×8' (FTP/VO2)", "21812820", seiler_4x8),
    # Seiler 2013, lo stesso studio: il gruppo 4 × 4'.
    "seiler_4x4": Protocol("Seiler 4×4' (VO2max)", "21812820", seiler_4x4),
    # Rønnestad 2020: 3 serie di 13 × 30" di lavoro e 15" di recupero, 3' tra le serie.
    "ronnestad_30_15": Protocol("Rønnestad 30/15", "31977120", ronnestad_30_15),
    "over_under": Protocol("Over-Under", None, over_under),
    # Whitty 2016: intervalli a cadenza alta, cadenza spontanea ed efficienza più alte.
    "z2_cadence_drills": Protocol("Z2 + cadence drills", "27175601", z2_cadence_drills),
    "tempo_2x20": Protocol("Tempo 2×20'", None, tempo_2x20),
    "z2_progressive": Protocol("Z2 progressivo", None, z2_progressive),
    "rest": Protocol("Riposo", None, rest),
}

