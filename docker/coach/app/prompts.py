"""Prompt del Coach e query per la ricerca dei paper, carattere per carattere come
li scriveva il browser, tranne le regole di selezione, che vengono da selection_rules: i test
li confrontano con il vecchio codice."""

import hashlib

from app.jscompat import js_length, js_slice, js_str
from app.protocols import PROTOCOLS
from app.selection_rules import RULES, minimum_minutes

ABSTRACT_CHARS = 1200

# Le regole di selezione nell'ordine in cui valgono, poi i minuti che servono ai protocolli che non
# entrano in ogni durata: la lista ammessa toglie quelli che non ci stanno.
RULES_SECTION = (
    "\n".join(f"{n}. {rule.sentence()}" for n, rule in enumerate(RULES, 1))
    + "\nScegli solo un protocollo che entra nella durata disponibile. Durata minima: "
    + ", ".join(f"{pid} {m}'" for pid in PROTOCOLS if (m := minimum_minutes(pid)) > 0) + "."
)

# Testo fisso del prompt di sistema; i segnaposto si sostituiscono con .replace
# (con un f-string le graffe dell'esempio JSON andrebbero raddoppiate).
SYSTEM_TEMPLATE = """Sei un coach di ciclismo evidence-based. Devi scegliere UN protocollo dal catalogo basandoti sullo stato fisico dell'atleta e sui paper scientifici recuperati.

CATALOGO PROTOCOLLI (devi scegliere SOLO uno di questi id):
<PROTOCOL_LIST>

REGOLE DI SELEZIONE (applica in ordine, vale la prima che si applica). Tra parentesi quadre la fonte della regola: il paper che ne dà il numero, o [pratica] quando nessun paper lo dà. È solo un'informazione: nel razionale cita solo i PMID dei paper recuperati qui sotto.
<SELECTION_RULES>

DIFFERENZE TRA PROTOCOLLI Z2 (quando vuoi un giorno facile):
- z2_endurance: piatto e costante, base pura, scelta neutra.
- z2_cadence_drills: Z2 + 3×5' cadenza alta — aggiunge stimolo neuromuscolare senza intensità cardio.
- z2_progressive: build-up 65→75→85% FTP — utile come pre-gara o per testare la base.

PAPER SCIENTIFICI RECUPERATI (cita SOLO questi PMID, mai altri):
<PAPERS_BLOCK>

OUTPUT — rispondi SOLO con un oggetto JSON valido, nessun testo extra prima o dopo, niente markdown, niente blocchi di codice:

{"protocolId":"<id_dal_catalogo>","razionale":"<2-3 frasi italiane che giustificano la scelta citando TSB, polarizzazione, e quando rilevante un paper come [PMID:xxx]>","paperUsati":["<PMID1>","<PMID2>"]}

Vincoli:
- protocolId DEVE essere uno degli id del catalogo
- paperUsati può essere [] se nessun paper recuperato è davvero rilevante; altrimenti includi solo PMID che hai effettivamente usato nel razionale
- Non inventare PMID: usa solo quelli forniti sopra"""


def paper_entry(p: dict) -> str:
    abstract = p["abstract"]
    cut = js_slice(abstract, ABSTRACT_CHARS) + ("…" if js_length(abstract) > ABSTRACT_CHARS else "")
    return f"[PMID:{p['pmid']}] {js_str(p['authors'])} {js_str(p['year'])}. {js_str(p['title'])}\nAbstract: {cut}"


def system_prompt(papers: list) -> str:
    protocol_list = "\n".join(f"- {pid}: {proto.name}" for pid, proto in PROTOCOLS.items())
    papers_block = "\n\n".join(paper_entry(p) for p in papers)
    # I paper vanno inseriti per ultimi: un abstract potrebbe contenere "<PROTOCOL_LIST>".
    return (SYSTEM_TEMPLATE.replace("<PROTOCOL_LIST>", protocol_list).replace("<SELECTION_RULES>", RULES_SECTION)
            .replace("<PAPERS_BLOCK>", papers_block))


def prompt_version() -> str:
    """Le prime 8 cifre dell'impronta SHA-256 del prompt di sistema senza paper: lo stesso testo
    dà sempre la stessa versione, due testi diversi mai la stessa (salvo una coincidenza su
    quattro miliardi). Così i risultati di due prompt non si confondono."""
    return hashlib.sha256(system_prompt([]).encode("utf-8")).hexdigest()[:8]


def or_dash(value) -> str:
    """`${v || '—'}`: i valori falsi (null, 0, "") diventano un trattino."""
    return js_str(value) if value else "—"


def nullish_dash(value) -> str:
    """`${v ?? '—'}`: solo null diventa un trattino, lo 0 resta."""
    return "—" if value is None else js_str(value)


def ride_line(d: dict) -> str:
    watts = f", {js_str(d['avgWatts'])}W" if d["avgWatts"] else ""
    hr = f", FC {js_str(d['avgHr'])}" if d["avgHr"] else ""
    return f"- {d['data']} ({d['tipo']}): {js_str(d['durataMin'])}min, {js_str(d['distanzaKm'])}km{watts}{hr}"


def user_prompt(ctx: dict, duration: int) -> str:
    pol = ctx["polarizzazione"]
    recent = ("\n".join(ride_line(d) for d in ctx["recentDays"])
              if ctx["recentDays"] else "Nessuna attività bici negli ultimi 7 giorni.")
    return f"""STATO ATLETA:
- FTP: {js_str(ctx['ftp'])}W · LTHR: {or_dash(ctx['lthr'])} bpm · Peso: {or_dash(ctx['weight'])} kg · Tier: {ctx['tier']}
- CTL {js_str(ctx['ctl'])} · ATL {js_str(ctx['atl'])} · TSB {js_str(ctx['tsb'])}
- Polarizzazione 28gg: easy {nullish_dash(pol['easyPct'])}% / hard {nullish_dash(pol['hardPct'])}% · volume {js_str(pol['totalMin'])}min
- Volume target: {js_str(ctx['weeklyHours'])}h/sett su {js_str(ctx['weeklyDays'])} giorni

ULTIME ATTIVITÀ BICI:
{recent}

OGGI: {ctx['oggi']} · DURATA DISPONIBILE: {duration} minuti

Scegli il protocollo e restituisci SOLO il JSON."""


def retrieval_query(ctx: dict, duration: int) -> str:
    tsb, hard = ctx["tsb"], ctx["polarizzazione"]["hardPct"]
    tags = ["cycling endurance training adaptation"]
    if tsb > 10:
        tags.append("high readiness peak performance VO2max")
    elif tsb >= -5:
        tags.append("threshold sweet spot baseline training")
    elif tsb >= -15:
        tags.append("sweet spot moderate intensity aerobic")
    elif tsb >= -25:
        tags.append("aerobic endurance Z2 base recovery")
    else:
        tags.append("overreaching recovery active rest")
    if hard is not None:
        if hard > 30:
            tags.append("polarized training distribution easy volume")
        elif hard < 15:
            tags.append("high intensity interval stimulus VO2max")
        else:
            tags.append("pyramidal training intensity distribution")
    if ctx["tier"] in ("Elite volume", "High volume"):
        tags.append("trained well-trained cyclists block periodization")
    if duration >= 120:
        tags.append("long ride fatigue resistance")
    if duration <= 45:
        tags.append("short session")
    return " ".join(tags)
