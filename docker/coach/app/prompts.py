"""Prompt del Coach e query per la ricerca dei paper, carattere per carattere come
li scriveva il browser, tranne i protocolli e la regola di selezione, che sono solo quelli ammessi oggi
e vengono da selection_rules, i protocolli ammessi in fondo alla query, e i paper in fondo, che danno i
passaggi e chiedono di citarli per etichetta: i test li confrontano con il vecchio codice."""

import hashlib
import json

from app.jscompat import js_str
from app.protocols import PROTOCOLS
from app.selection_rules import RULES, select

# Le differenze tra i giorni Z2, una riga per protocollo: il prompt mostra solo quelle dei Z2 ammessi oggi.
Z2_DIFFERENCES = {
    "z2_endurance": "piatto e costante, base pura, scelta neutra.",
    "z2_cadence_drills": "Z2 + 3×5' cadenza alta — aggiunge stimolo neuromuscolare senza intensità cardio.",
    "z2_progressive": "build-up 65→75→85% FTP — utile come pre-gara o per testare la base.",
}

# Testo fisso del prompt di sistema; i segnaposto si sostituiscono con .replace
# (con un f-string le graffe dell'esempio JSON andrebbero raddoppiate).
SYSTEM_TEMPLATE = """Sei un coach di ciclismo evidence-based. Devi scegliere UN protocollo dal catalogo basandoti sullo stato fisico dell'atleta e sui paper scientifici recuperati.

CATALOGO PROTOCOLLI AMMESSI OGGI (devi scegliere SOLO uno di questi id):
<PROTOCOL_LIST>

REGOLA DI SELEZIONE DI OGGI (vale per la forma, la quota dura e la durata disponibile dell'atleta; i protocolli che non entrano nella durata sono già tolti). Tra parentesi quadre la fonte della regola: il paper che ne dà il numero, o [pratica] quando nessun paper lo dà. È solo un'informazione: nel razionale cita solo i passaggi dei paper recuperati qui sotto.
<SELECTION_RULES>
<Z2_DIFFERENCES>
PAPER SCIENTIFICI RECUPERATI (cita SOLO questi passaggi, con la loro etichetta, mai altri):
<PAPERS_BLOCK>

OUTPUT — rispondi SOLO con un oggetto JSON valido, nessun testo extra prima o dopo, niente markdown, niente blocchi di codice:

{"protocolId":"<id_dal_catalogo>","razionale":"<2-3 frasi italiane che giustificano la scelta citando TSB, polarizzazione, e quando rilevante il passaggio su cui ti basi con la sua etichetta, come [PMID:xxx §n]>","passaggiUsati":["PMID:xxx §n"]}

Vincoli:
- protocolId DEVE essere uno degli id del catalogo
- passaggiUsati può essere [] se nessun passaggio recuperato è davvero rilevante; altrimenti includi solo le etichette dei passaggi che hai citato nel razionale
- Non inventare etichette: usa solo quelle dei passaggi forniti sopra"""


# Con COACH_SEARCH_MODE=model il prompt non ha i paper: il modello li cerca con lo strumento search_papers.
# Tre frasi del testo fisso cambiano; il resto è lo stesso, carattere per carattere.
MAX_SEARCHES = 3
MAX_SEARCH_TEXT = 300
# I giri del modello che una bozza può fare: ogni giro che chiede strumenti consuma una delle
# MAX_SEARCHES ricerche o uno degli altrettanti rifiuti, dopo i quali la bozza finisce.
MAX_TURNS = 2 * MAX_SEARCHES
MODEL_SEARCH_CHANGES = (
    ("dei paper recuperati qui sotto", "dei paper che trovi con lo strumento search_papers"),
    ("PAPER SCIENTIFICI RECUPERATI (cita SOLO questi passaggi, con la loro etichetta, mai altri):\n<PAPERS_BLOCK>",
     "PAPER SCIENTIFICI: non sono in questo messaggio. Per trovarli usa lo strumento search_papers con un testo di "
     f"ricerca in inglese, la lingua dei paper; puoi cercare fino a {MAX_SEARCHES} volte. Cita SOLO i passaggi che le "
     "ricerche ti restituiscono, con la loro etichetta, mai altri; se non cerchi, non citare nulla."),
    ("usa solo quelle dei passaggi forniti sopra", "usa solo quelle dei passaggi che le ricerche ti hanno restituito"),
)
MODEL_SEARCH_TEMPLATE = SYSTEM_TEMPLATE
for fixed_text, model_text in MODEL_SEARCH_CHANGES:
    assert fixed_text in MODEL_SEARCH_TEMPLATE, fixed_text
    MODEL_SEARCH_TEMPLATE = MODEL_SEARCH_TEMPLATE.replace(fixed_text, model_text)

# Lo strumento offerto al modello, nel formato che Ollama e il provider cloud accettano.
SEARCH_TOOL = {"type": "function", "function": {
    "name": "search_papers",
    "description": "Cerca nell'indice dei paper scientifici i passaggi più vicini al testo dato. Restituisce i "
                   "paper trovati, ognuno con i suoi passaggi e la loro etichetta da citare.",
    "parameters": {"type": "object", "required": ["text"], "properties": {
        "text": {"type": "string", "description": "Il testo da cercare, in inglese, al massimo "
                                                  f"{MAX_SEARCH_TEXT} caratteri."}}}}}
# Le risposte dello strumento quando non cerca, o non trova nulla.
SEARCH_LIMIT = f"Limite raggiunto: hai già fatto {MAX_SEARCHES} ricerche, rispondi ora con il solo JSON."
SEARCH_EMPTY = "Ricerca vuota: scrivi nel campo text il testo da cercare."
SEARCH_BAD = "Ricerca non valida: lo strumento vuole un solo campo, text, con il testo da cercare."
SEARCH_UNKNOWN_TOOL = "Strumento sconosciuto: l'unico strumento è search_papers."
SEARCH_NOTHING = "Nessun paper trovato per questo testo."


# Un paper, una situazione e una durata d'esempio fissi: con loro anche la forma della sezione dei paper
# entra nella versione del prompt. Quota dura sconosciuta: la regola della ripresa, con i tre giorni Z2.
VERSION_SAMPLE = {"pmid": "1", "authors": "Autori", "year": "2000", "title": "Titolo.",
                  "passages": [{"label": "PMID:1 §1", "text": "Passaggio."}]}
VERSION_CONTEXT, VERSION_MINUTES = {"tsb": 0, "polarizzazione": {"hardPct": None}}, 60


def paper_entry(p: dict) -> str:
    """Il paper una volta sola, poi i suoi passaggi, ognuno con la sua etichetta."""
    passages = "\n".join(f"[{s['label']}] {s['text']}" for s in p["passages"])
    return f"[PMID:{p['pmid']}] {js_str(p['authors'])} {js_str(p['year'])}. {js_str(p['title'])}\n{passages}"


def system_prompt(papers: list, ctx: dict, duration: int, search_mode: str = "fixed") -> str:
    """Il prompt di sistema per la situazione di oggi: solo i protocolli che la regola di selezione
    ammette nei minuti, la regola con la sua fonte, le differenze tra i Z2 ammessi, e i paper; con il
    modo model, al posto dei paper, come cercarli."""
    rule, allowed = select(ctx, duration)
    protocol_list = "\n".join(f"- {pid}: {PROTOCOLS[pid].name}" for pid in allowed)
    z2 = [f"- {pid}: {Z2_DIFFERENCES[pid]}" for pid in allowed if pid in Z2_DIFFERENCES]
    z2_block = ("\nDIFFERENZE TRA PROTOCOLLI Z2 (quando vuoi un giorno facile):\n" + "\n".join(z2) + "\n") if z2 else ""
    papers_block = "\n\n".join(paper_entry(p) for p in papers)
    # I paper vanno inseriti per ultimi: un passaggio potrebbe contenere "<PROTOCOL_LIST>".
    template = MODEL_SEARCH_TEMPLATE if search_mode == "model" else SYSTEM_TEMPLATE
    return (template.replace("<PROTOCOL_LIST>", protocol_list)
            .replace("<SELECTION_RULES>", rule.sentence(allowed)).replace("<Z2_DIFFERENCES>", z2_block)
            .replace("<PAPERS_BLOCK>", papers_block))


def prompt_version(search_mode: str = "fixed") -> str:
    """Le prime 8 cifre dell'impronta SHA-256 del prompt di sistema d'esempio, di ogni regola di
    selezione e del nome di ogni protocollo: il prompt d'esempio ne mostra solo uno, ma ognuno può
    finire in un prompt. Lo stesso testo dà sempre la stessa versione, due testi diversi mai la stessa
    (salvo una coincidenza su quattro miliardi). Così i risultati di due prompt non si confondono.
    Con il modo model entrano anche lo strumento e le sue risposte, e il prompt è un altro."""
    tool = [json.dumps(SEARCH_TOOL, ensure_ascii=False, sort_keys=True), SEARCH_LIMIT, SEARCH_EMPTY, SEARCH_BAD,
            SEARCH_UNKNOWN_TOOL, SEARCH_NOTHING] if search_mode == "model" else []
    text = "\n".join([system_prompt([VERSION_SAMPLE], VERSION_CONTEXT, VERSION_MINUTES, search_mode),
                      *(rule.sentence() for rule in RULES), *(f"{pid}: {p.name}" for pid, p in PROTOCOLS.items()),
                      *tool])
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


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
    """Il testo della ricerca dei paper: forma, quota dura e minuti con le parole del browser, poi i
    nomi dei protocolli che le regole di selezione ammettono oggi, perché la ricerca trovi le prove
    sulle scelte che l'atleta ha davvero."""
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
    tags.extend(PROTOCOLS[pid].name for pid in select(ctx, duration)[1])
    return " ".join(tags)
