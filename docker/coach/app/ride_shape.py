"""La forma di un'uscita: i suoi blocchi duri, il recupero dopo ognuno, i minuti per zona e il
carico per ora dal battito (quello che legge la regola delle etichette), dalla serie compatta
salvata con i dettagli corsa e con FTP e soglia cardiaca di oggi. Non si salva: un nuovo FTP cambia
la forma senza scaricare nulla.

Ogni passo della serie prende la zona dalla potenza, quando l'ha misurata un misuratore e c'è un
FTP; altrimenti dalla frequenza cardiaca, quando c'è una soglia. Un passo senza né l'una né l'altra
(pausa, fascia staccata) non conta: non è recupero e non spezza un blocco."""

# Zone di potenza di Coggan su FTP: Z2 fino a 0.75, Z3 (tempo) da 0.76, Z4 (soglia) da 0.91,
# Z5 (VO2max) da 1.06, Z6 (anaerobico) da 1.21. Ogni valore è l'inizio della zona successiva.
POWER_ZONES = (0.56, 0.76, 0.91, 1.06, 1.21)
# Zone di frequenza cardiaca su soglia (LTHR), quelle di Coggan: Z2 da 0.69, Z3 da 0.85 (Coggan
# dice 0.84; 0.85 è l'inizio di un blocco duro deciso per BikeTR), Z4 da 0.95, Z5 da 1.06.
HR_ZONES = (0.69, 0.85, 0.95, 1.06)
ZONE_NAMES = ("Z1", "Z2", "Z3", "Z4", "Z5", "Z6")
# Un blocco duro sta sopra Z2 per almeno un minuto; un calo fino a 30 secondi non lo spezza.
HARD_FROM_ZONE = 3
MIN_BLOCK_SECONDS = 60
MERGE_GAP_SECONDS = 30


def zone(share: float, starts: tuple) -> int:
    return 1 + sum(share >= s for s in starts)


def step_zones(series: dict, power_measured: bool, ftp: float | None, lthr: float | None) -> tuple[list, set]:
    """La zona di ogni passo (None se non si sa) e i segnali usati."""
    watts = (series.get("watts") or []) if power_measured and ftp else []
    hr = (series.get("hr") or []) if lthr else []
    zones, used = [], set()
    for i in range(max(len(watts), len(hr))):
        w = watts[i] if i < len(watts) else None
        h = hr[i] if i < len(hr) else None
        if w is not None:
            zones.append(zone(w / ftp, POWER_ZONES))
            used.add("potenza")
        elif h is not None:
            zones.append(zone(h / lthr, HR_ZONES))
            used.add("fc")
        else:
            zones.append(None)
    return zones, used


def hard_stretches(zones: list, step: int) -> list[tuple[int, int]]:
    """I tratti sopra Z2 (primo e ultimo passo), uniti quando li separano al massimo
    MERGE_GAP_SECONDS di passi più facili."""
    stretches, easy = [], 0
    for i, z in enumerate(zones):
        if z is None:
            continue
        if z < HARD_FROM_ZONE:
            easy += 1
        elif stretches and easy * step <= MERGE_GAP_SECONDS:
            stretches[-1] = (stretches[-1][0], i)
            easy = 0
        else:
            stretches.append((i, i))
            easy = 0
    return stretches


def known_minutes(zones: list, start: int, end: int, step: int) -> float:
    """I minuti con una zona nota fra il passo start e il passo end escluso."""
    return sum(z is not None for z in zones[start:end]) * step / 60


def load_per_hour(series: dict, lthr: float | None) -> float | None:
    """Il carico per ora dal battito (hrTSS l'ora): la media di (FC / soglia)² per 100 sui passi con
    il battito, quindi 100 per un'ora intera alla soglia. Pesa di più i tratti duri della sola media.
    None senza battito o senza soglia."""
    hr = [h for h in (series.get("hr") or []) if h is not None]
    if not hr or not lthr:
        return None
    return round(sum((h / lthr) ** 2 for h in hr) / len(hr) * 100, 1)


def ride_shape(series: dict | None, power_measured: bool, ftp: float | None, lthr: float | None) -> dict | None:
    """Blocchi duri (minuti, zona più alta raggiunta, minuti di recupero fino al blocco dopo o alla
    fine), minuti per zona, carico per ora dal battito e segnali usati. None se nessun passo ha una
    zona: la corsa si giudica allora dalle medie."""
    if not series:
        return None
    step = series["step"]
    zones, used = step_zones(series, power_measured, ftp, lthr)
    if not used:
        return None
    blocks = [(s, e) for s, e in hard_stretches(zones, step)
              if known_minutes(zones, s, e + 1, step) * 60 >= MIN_BLOCK_SECONDS]
    found = []
    for n, (s, e) in enumerate(blocks):
        until = blocks[n + 1][0] if n + 1 < len(blocks) else len(zones)
        found.append({"minuti": known_minutes(zones, s, e + 1, step),
                      "zona": max(z for z in zones[s:e + 1] if z is not None),
                      "recuperoMin": known_minutes(zones, e + 1, until, step)})
    per_zone = {name: sum(z == k for z in zones) * step / 60 for k, name in enumerate(ZONE_NAMES, 1)}
    return {"fonte": " e ".join(sorted(used, reverse=True)), "blocchi": found, "minutiPerZona": per_zone,
            "caricoOra": load_per_hour(series, lthr)}
