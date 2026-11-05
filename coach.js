import { loadSettings, safeLoad, safeSave, escapeHtml, fmtTime, APP_CONFIG } from './strava.js';
import { resolveHr } from './training.js';
import { buildFormTrend } from './analysis.js';
import { v2_capacityTier } from './training_v2.js';

// helpers DOM (definiti localmente per evitare dipendenze cicliche con app.js)
const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.hidden = false; };

// ============================================================================
// COACH AI — RAG con Ollama locale + catalogo protocolli deterministico
//
// Architettura:
//  1. Codice JS calcola tutto il contesto (FTP, CTL/ATL/TSB, polarizzazione,
//     ultime attività).
//  2. Costruiamo embedding della "query" (stato fisico) via /api/embeddings,
//     facciamo cosine similarity contro papers_index.json e selezioniamo i
//     top-K paper rilevanti.
//  3. Passiamo al modello: catalogo protocolli + abstract recuperati + stato.
//     Il modello restituisce SOLO un JSON {protocolId, razionale, paperUsati}.
//  4. Il codice JS calcola watt, durate, struttura, render finale. Mai aritmetica
//     fatta dal modello.
//
// Riusa funzioni globali esistenti: resolveHr, loadSettings, buildFormTrend,
// v2_capacityTier.
// ============================================================================

const COACH_DEFAULT_ENDPOINT = 'http://localhost:11434';
const COACH_DEFAULT_MODEL = 'qwen2.5:7b';
const COACH_EMBED_MODEL = 'nomic-embed-text';
const COACH_SETTINGS_KEY = 'biketr_coach_settings';

function loadCoachSettings() {
  return safeLoad(COACH_SETTINGS_KEY, {}, (x) => x && typeof x === 'object' && !Array.isArray(x));
}
function saveCoachSettings(s) { safeSave(COACH_SETTINGS_KEY, s); }

function coach_dayName(d = new Date()) {
  return ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'][d.getDay()];
}

// ----------------------------------------------------------------------------
// CONTESTO ATLETA (calcolato dal codice, mai inferito dal modello)
// ----------------------------------------------------------------------------

function coach_polarization(activities, settings) {
  const profile = resolveHr(settings, activities);
  const lthr = profile.hrLthr;
  const cutoff = Date.now() - 28 * 24 * 3600e3;
  let easyMin = 0, hardMin = 0;
  for (const a of activities) {
    if (!a.type?.includes('Ride')) continue;
    if (new Date(a.start_date_local).getTime() < cutoff) continue;
    const min = a.moving_time / 60;
    const avgHr = a.average_heartrate;
    if (lthr && avgHr && avgHr >= 0.88 * lthr) hardMin += min;
    else easyMin += min;
  }
  const tot = easyMin + hardMin;
  return {
    easyPct: tot ? Math.round(100 * easyMin / tot) : null,
    hardPct: tot ? Math.round(100 * hardMin / tot) : null,
    totalMin: Math.round(tot),
  };
}

function coach_recentDays(activities) {
  const cutoff = Date.now() - 7 * 24 * 3600e3;
  return activities
    .filter(a => a.type?.includes('Ride'))
    .filter(a => new Date(a.start_date_local).getTime() >= cutoff)
    .slice(0, 10)
    .map(a => ({
      data: a.start_date_local.slice(0, 10),
      tipo: a.type,
      durataMin: Math.round(a.moving_time / 60),
      distanzaKm: Math.round(a.distance / 100) / 10,
      avgWatts: a.weighted_average_watts || a.average_watts || null,
      avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    }));
}

function buildCoachContext(activities, settings) {
  const profile = resolveHr(settings, activities);
  const form = buildFormTrend(activities, settings);
  const last = form.DAYS - 1;
  const ctl = Math.round(form.ctl[last] || 0);
  const atl = Math.round(form.atl[last] || 0);
  const tsb = Math.round(form.tsb[last] || 0);
  const tier = v2_capacityTier(settings, { ctl, tsb });
  return {
    ftp: profile.ftp || null,
    lthr: profile.hrLthr || null,
    weight: settings.weight || null,
    ctl, atl, tsb,
    tier: tier.label,
    polarizzazione: coach_polarization(activities, settings),
    weeklyHours: settings.weeklyHours || null,
    weeklyDays: settings.weeklyDays || null,
    recentDays: coach_recentDays(activities),
    oggi: coach_dayName(),
  };
}

// ----------------------------------------------------------------------------
// CATALOGO PROTOCOLLI — build deterministico
// Ogni build(ftp, durataMin) ritorna {title, targetWatt, struttura[]} oppure
// null se la durata richiesta è insufficiente per quel protocollo.
// ----------------------------------------------------------------------------

const round5 = (w) => Math.round(w / 5) * 5;

const COACH_PROTOCOLS = {
  z1_recovery: {
    name: 'Recupero attivo Z1',
    minDuration: 25,
    fontePMID: '32432383',
    build(ftp, durataMin) {
      const z1Lo = round5(ftp * 0.45);
      const z1Hi = round5(ftp * 0.55);
      const warm = 5;
      const cool = 5;
      const main = durataMin - warm - cool;
      return {
        title: 'Recupero attivo Z1',
        targetWatt: `${z1Lo}-${z1Hi}W (45-55% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': partenza fluida, cadenza 90+ rpm`,
          `Lavoro ${main}': costante ${z1Lo}-${z1Hi}W, gambe sciolte, niente sforzi`,
          `Defaticamento ${cool}': scendere progressivamente`,
        ],
      };
    },
  },
  z2_endurance: {
    name: 'Z2 Aerobico',
    minDuration: 40,
    fontePMID: '16573837',
    build(ftp, durataMin) {
      const z1 = round5(ftp * 0.55);
      const z2Lo = round5(ftp * 0.70);
      const z2Hi = round5(ftp * 0.80);
      const warm = 10, cool = 10;
      const main = durataMin - warm - cool;
      return {
        title: 'Z2 Aerobico (steady)',
        targetWatt: `${z2Lo}-${z2Hi}W (70-80% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': salita progressiva ${z1}→${z2Lo}W`,
          `Lavoro ${main}': costante ${z2Lo}-${z2Hi}W, respirazione fluida (RPE 4-5/10)`,
          `Defaticamento ${cool}': scendere gradualmente a ${z1}W`,
        ],
      };
    },
  },
  z2_long_intervals: {
    name: 'Long ride Z2 + ride-at-the-end',
    minDuration: 90,
    fontePMID: '20030780',
    build(ftp, durataMin) {
      const z1 = round5(ftp * 0.55);
      const z2Lo = round5(ftp * 0.70);
      const z2Hi = round5(ftp * 0.80);
      const w95 = round5(ftp * 0.95);
      const closer = 3 * 5 + 2 * 3 + 5;
      const warm = 10;
      const base = durataMin - warm - closer;
      return {
        title: 'Long ride Z2 + ride-at-the-end',
        targetWatt: `Base ${z2Lo}-${z2Hi}W · Intervalli ${w95}W`,
        struttura: [
          `Riscaldamento ${warm}': progressivo`,
          `Base ${base}': costante ${z2Lo}-${z2Hi}W (70-80% FTP), nutrizione 60-90g CHO/h`,
          `Finale: 3 × 5' @ ${w95}W (95% FTP), recupero 3' @ ${z1}W tra ripetute — fatigue resistance`,
          `Defaticamento 5': ${z1}W`,
        ],
      };
    },
  },
  sweet_spot_3x15: {
    name: 'Sweet Spot 3×15\'',
    minDuration: 50,
    fontePMID: null, // Coggan & Allen 2010 (libro, no PubMed)
    build(ftp, durataMin) {
      const ssLo = round5(ftp * 0.88);
      const ssHi = round5(ftp * 0.93);
      const z1 = round5(ftp * 0.55);
      const reps3time = 3 * 15 + 2 * 5;
      const reps2time = 2 * 15 + 1 * 5;
      const warm = 10;
      let reps = 3;
      let repsTime = reps3time;
      if (durataMin < warm + 5 + reps3time) {
        reps = 2;
        repsTime = reps2time;
        if (durataMin < warm + 5 + reps2time) return null;
      }
      const cool = durataMin - warm - repsTime;
      return {
        title: `Sweet Spot ${reps}×15'`,
        targetWatt: `${ssLo}-${ssHi}W (88-93% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': salita progressiva fino a soglia`,
          `${reps} × 15' @ ${ssLo}-${ssHi}W, recupero 5' @ ${z1}W tra ripetute`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  threshold_3x10: {
    name: 'Soglia 3×10\'',
    minDuration: 50,
    fontePMID: null,
    build(ftp, durataMin) {
      const tLo = round5(ftp * 0.95);
      const tHi = round5(ftp * 1.00);
      const z1 = round5(ftp * 0.55);
      const repsTime = 3 * 10 + 2 * 4;
      const warm = 12;
      if (durataMin < warm + 5 + repsTime) return null;
      const cool = durataMin - warm - repsTime;
      return {
        title: 'Soglia 3×10\'',
        targetWatt: `${tLo}-${tHi}W (95-100% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': progressivo + 2-3 spin-up da 30"`,
          `3 × 10' @ ${tLo}-${tHi}W, recupero 4' @ ${z1}W`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  seiler_4x8: {
    name: 'Seiler 4×8\' (FTP/VO2)',
    minDuration: 60,
    fontePMID: '23539309',
    build(ftp, durataMin) {
      const wLo = round5(ftp * 1.05);
      const wHi = round5(ftp * 1.10);
      const z1 = round5(ftp * 0.55);
      const repsTime = 4 * 8 + 3 * 2;
      const warm = 15;
      if (durataMin < warm + 7 + repsTime) return null;
      const cool = durataMin - warm - repsTime;
      return {
        title: 'Seiler 4×8\'',
        targetWatt: `${wLo}-${wHi}W (105-110% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': progressivo + 3 × 30" spin-up`,
          `4 × 8' @ ${wLo}-${wHi}W (regola d'oro: ultima ripetuta = prima), recupero 2' @ ${z1}W`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  seiler_4x4: {
    name: 'Seiler 4×4\' (VO2max)',
    minDuration: 50,
    fontePMID: '23539308',
    build(ftp, durataMin) {
      const wLo = round5(ftp * 1.15);
      const wHi = round5(ftp * 1.20);
      const z1 = round5(ftp * 0.55);
      const repsTime = 4 * 4 + 3 * 3;
      const warm = 15;
      if (durataMin < warm + 8 + repsTime) return null;
      const cool = durataMin - warm - repsTime;
      return {
        title: 'Seiler 4×4\' (VO2max)',
        targetWatt: `${wLo}-${wHi}W (115-120% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': progressivo + 3 × 30" all-out`,
          `4 × 4' @ ${wLo}-${wHi}W (sforzo massimale sostenuto), recupero 3' @ ${z1}W`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  ronnestad_30_15: {
    name: 'Rønnestad 30/15',
    minDuration: 55,
    fontePMID: '32432383',
    build(ftp, durataMin) {
      const w105 = round5(ftp * 1.05);
      const wEasy = round5(ftp * 0.50);
      const z1 = round5(ftp * 0.55);
      const repsTime = 3 * 9 + 2 * 3; // 3 set × 9' + 2 rec × 3'
      const warm = 15;
      if (durataMin < warm + 7 + repsTime) return null;
      const cool = durataMin - warm - repsTime;
      return {
        title: 'Rønnestad 30/15',
        targetWatt: `${w105}W on · ${wEasy}W off`,
        struttura: [
          `Riscaldamento ${warm}': progressivo`,
          `3 set × 12 × (30" @ ${w105}W / 15" @ ${wEasy}W), recupero 3' @ ${z1}W tra set`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  over_under: {
    name: 'Over-Under',
    minDuration: 60,
    fontePMID: null,
    build(ftp, durataMin) {
      const wOver = round5(ftp * 1.05);
      const wUnder = round5(ftp * 0.95);
      const z1 = round5(ftp * 0.55);
      const repsTime = 3 * 12 + 2 * 5; // 3 blocchi × 12' + 2 rec × 5'
      const warm = 12;
      if (durataMin < warm + 6 + repsTime) return null;
      const cool = durataMin - warm - repsTime;
      return {
        title: 'Over-Under 3 blocchi',
        targetWatt: `Over ${wOver}W · Under ${wUnder}W`,
        struttura: [
          `Riscaldamento ${warm}': progressivo`,
          `3 blocchi × [3 × (2' @ ${wOver}W + 2' @ ${wUnder}W)] continuo, recupero 5' @ ${z1}W tra blocchi`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  z2_cadence_drills: {
    name: 'Z2 + cadence drills',
    minDuration: 55,
    fontePMID: '23197584', // Hansen et al. 2012 - pedaling efficacy
    build(ftp, durataMin) {
      const z2Lo = round5(ftp * 0.70);
      const z2Hi = round5(ftp * 0.80);
      const z1 = round5(ftp * 0.55);
      const wDrill = round5(ftp * 0.65);
      const drills = 3 * 5 + 2 * 3; // 3×5' alta cadenza + 2 rec × 3'
      const warm = 10, cool = 5;
      const main = durataMin - warm - cool - drills;
      if (main < 10) return null;
      return {
        title: 'Z2 + cadence drills',
        targetWatt: `${z2Lo}-${z2Hi}W base · ${wDrill}W drill (cadenza 100+ rpm)`,
        struttura: [
          `Riscaldamento ${warm}': progressivo`,
          `Z2 base ${main}': ${z2Lo}-${z2Hi}W (70-80% FTP), cadenza libera 85-95 rpm`,
          `Drill 3 × 5' a cadenza alta (100-110 rpm) @ ${wDrill}W (65% FTP, mantieni potenza), rec 3' a cadenza normale`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  tempo_2x20: {
    name: 'Tempo 2×20\'',
    minDuration: 55,
    fontePMID: null,
    build(ftp, durataMin) {
      const tLo = round5(ftp * 0.83);
      const tHi = round5(ftp * 0.87);
      const z1 = round5(ftp * 0.55);
      const repsTime = 2 * 20 + 1 * 5; // 45'
      const warm = 10;
      if (durataMin < warm + 5 + repsTime) return null;
      const cool = durataMin - warm - repsTime;
      return {
        title: 'Tempo 2×20\'',
        targetWatt: `${tLo}-${tHi}W (83-87% FTP)`,
        struttura: [
          `Riscaldamento ${warm}': progressivo`,
          `2 × 20' @ ${tLo}-${tHi}W (tempo continuo, RPE 6/10), recupero 5' @ ${z1}W`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  z2_progressive: {
    name: 'Z2 progressivo',
    minDuration: 45,
    fontePMID: '20861519', // Seiler 2010 - training distribution
    build(ftp, durataMin) {
      const w65 = round5(ftp * 0.65);
      const w75 = round5(ftp * 0.75);
      const w85 = round5(ftp * 0.85);
      const z1 = round5(ftp * 0.55);
      const warm = 8, cool = 5;
      const blocks = durataMin - warm - cool;
      const blk = Math.floor(blocks / 3);
      return {
        title: 'Z2 progressivo (build-up)',
        targetWatt: `${w65}W → ${w75}W → ${w85}W`,
        struttura: [
          `Riscaldamento ${warm}': partenza fluida`,
          `Blocco 1 (${blk}'): costante ${w65}W (65% FTP, conversazionale)`,
          `Blocco 2 (${blk}'): salita a ${w75}W (75% FTP, respirazione fluida)`,
          `Blocco 3 (${blocks - 2*blk}'): finale a ${w85}W (85% FTP, stimolo sub-soglia)`,
          `Defaticamento ${cool}': ${z1}W`,
        ],
      };
    },
  },
  rest: {
    name: 'Riposo',
    minDuration: 0,
    fontePMID: null,
    build() {
      return {
        title: 'Riposo / mobilità',
        targetWatt: '—',
        struttura: [
          'Sonno + idratazione + nutrienti (recupero attivo del sistema nervoso).',
          'Mobilità leggera 15-20\' opzionale: foam rolling, hip flexor stretch, 90/90 rotation.',
          'Il fitness cresce durante il riposo, non durante l\'allenamento.',
        ],
      };
    },
  },
};

// Decisione di fallback se il modello non restituisce JSON valido.
function fallbackProtocolId(ctx, durataMin = 60) {
  if (ctx.tsb < -25) return 'rest';
  if (ctx.tsb < -15) return 'z1_recovery';
  if (durataMin >= 120) return 'z2_long_intervals';
  if (ctx.polarizzazione.hardPct != null && ctx.polarizzazione.hardPct > 30) {
    if (durataMin <= 70) return 'z2_progressive';
    return 'z2_cadence_drills';
  }
  if (ctx.polarizzazione.hardPct != null && ctx.polarizzazione.hardPct < 15) {
    if (ctx.tsb > 5) return 'seiler_4x8';
    return 'sweet_spot_3x15';
  }
  if (ctx.tsb > 10) return 'seiler_4x4';
  if (ctx.tsb > 0) return 'threshold_3x10';
  return 'sweet_spot_3x15';
}

// ----------------------------------------------------------------------------
// RAG: retrieval di paper rilevanti via embeddings
// ----------------------------------------------------------------------------

let _papersIndexCache = null;
async function loadPapersIndex() {
  if (_papersIndexCache) return _papersIndexCache;
  const res = await fetch('papers_index.json');
  if (!res.ok) throw new Error(`papers_index.json non trovato (HTTP ${res.status}). Esegui: node build_papers_index.mjs`);
  _papersIndexCache = await res.json();
  return _papersIndexCache;
}

function cosineSim(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Compone più AbortSignal in uno (fallback se AbortSignal.any non disponibile).
function _composeSignals(signals) {
  const arr = signals.filter(Boolean);
  if (!arr.length) return undefined;
  if (arr.length === 1) return arr[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(arr);
  const ctrl = new AbortController();
  for (const s of arr) {
    if (s.aborted) { ctrl.abort(s.reason); break; }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

async function ollamaEmbed(endpoint, text, signal) {
  const timeoutMs = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.ollamaTimeoutMs) || 180000;
  const res = await fetch(endpoint.replace(/\/+$/, '') + '/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: COACH_EMBED_MODEL, prompt: text }),
    signal: _composeSignals([signal, AbortSignal.timeout(timeoutMs)]),
  });
  if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

function buildRetrievalQuery(ctx, durataMin) {
  const tags = ['cycling endurance training adaptation'];
  if (ctx.tsb > 10) tags.push('high readiness peak performance VO2max');
  else if (ctx.tsb >= -5) tags.push('threshold sweet spot baseline training');
  else if (ctx.tsb >= -15) tags.push('sweet spot moderate intensity aerobic');
  else if (ctx.tsb >= -25) tags.push('aerobic endurance Z2 base recovery');
  else tags.push('overreaching recovery active rest');
  if (ctx.polarizzazione.hardPct != null) {
    if (ctx.polarizzazione.hardPct > 30) tags.push('polarized training distribution easy volume');
    else if (ctx.polarizzazione.hardPct < 15) tags.push('high intensity interval stimulus VO2max');
    else tags.push('pyramidal training intensity distribution');
  }
  if (ctx.tier === 'Elite volume' || ctx.tier === 'High volume') tags.push('trained well-trained cyclists block periodization');
  if (durataMin >= 120) tags.push('long ride fatigue resistance');
  if (durataMin <= 45) tags.push('short session');
  return tags.join(' ');
}

async function retrieveTopPapers(endpoint, queryText, k = 4, signal) {
  const idx = await loadPapersIndex();
  const qEmb = await ollamaEmbed(endpoint, queryText, signal);
  const scored = idx.papers.map(p => ({
    pmid: p.pmid, title: p.title, authors: p.authors, year: p.year,
    journal: p.journal, abstract: p.abstract,
    score: cosineSim(qEmb, p.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// ----------------------------------------------------------------------------
// Prompt + chiamata modello
// ----------------------------------------------------------------------------

function buildSystemPrompt(retrievedPapers) {
  const protocolList = Object.entries(COACH_PROTOCOLS)
    .map(([id, p]) => `- ${id}: ${p.name}`)
    .join('\n');
  const papersBlock = retrievedPapers.map(p =>
    `[PMID:${p.pmid}] ${p.authors} ${p.year}. ${p.title}\nAbstract: ${p.abstract.slice(0, 1200)}${p.abstract.length > 1200 ? '…' : ''}`
  ).join('\n\n');

  return `Sei un coach di ciclismo evidence-based. Devi scegliere UN protocollo dal catalogo basandoti sullo stato fisico dell'atleta e sui paper scientifici recuperati.

CATALOGO PROTOCOLLI (devi scegliere SOLO uno di questi id):
${protocolList}

REGOLE DI SELEZIONE (applica in ordine di priorità, la prima che matcha vince):
1. TSB < -25: SEMPRE rest.
2. TSB tra -25 e -15: z1_recovery.
3. Hard% < 15% E TSB ≥ -10: DEVI scegliere protocollo qualitativo: sweet_spot_3x15, threshold_3x10, o tempo_2x20 (alternativa più dolce di SS). Se TSB > +5 puoi salire a seiler_4x8. NON scegliere z2_endurance/z2_cadence_drills qui — l'atleta è sotto-stimolato, serve qualità.
4. Hard% > 30%: atleta già stressato — preferire z2_endurance, z2_cadence_drills (se durata ≥ 60'), o z2_progressive (se durata 45-70'). MAI seiler_4x4/ronnestad_30_15/over_under.
5. TSB > +10 e hard% tra 15 e 30%: considera seiler_4x8, seiler_4x4, ronnestad_30_15 o over_under (atleta fresco, sfrutta la forma).
6. Caso default (TSB tra -15 e +5, hard% 15-30%): sweet_spot_3x15, threshold_3x10, tempo_2x20, oppure z2_cadence_drills se vuoi giornata Z2 con stimolo neuromuscolare invece di soglia.
7. Durata ≥ 120 min: z2_long_intervals prevale come long ride.
8. Durata < 50 min: solo protocolli che entrano nella durata (z2_endurance, z2_progressive, sweet_spot_3x15 a 2 reps).

DIFFERENZE TRA PROTOCOLLI Z2 (quando vuoi un giorno facile):
- z2_endurance: piatto e costante, base pura, scelta neutra.
- z2_cadence_drills: Z2 + 3×5' cadenza alta — aggiunge stimolo neuromuscolare senza intensità cardio.
- z2_progressive: build-up 65→75→85% FTP — utile come pre-gara o per testare la base.

REGOLA NEGATIVA: z2_endurance puro è ammesso SOLO se TSB ≤ -15, hard% > 30%, o durata < 50 min. Negli altri casi scegli un protocollo qualitativo o uno dei Z2 "ricchi" (cadence_drills, progressive).

PAPER SCIENTIFICI RECUPERATI (cita SOLO questi PMID, mai altri):
${papersBlock}

OUTPUT — rispondi SOLO con un oggetto JSON valido, nessun testo extra prima o dopo, niente markdown, niente blocchi di codice:

{"protocolId":"<id_dal_catalogo>","razionale":"<2-3 frasi italiane che giustificano la scelta citando TSB, polarizzazione, e quando rilevante un paper come [PMID:xxx]>","paperUsati":["<PMID1>","<PMID2>"]}

Vincoli:
- protocolId DEVE essere uno degli id del catalogo
- paperUsati può essere [] se nessun paper recuperato è davvero rilevante; altrimenti includi solo PMID che hai effettivamente usato nel razionale
- Non inventare PMID: usa solo quelli forniti sopra`;
}

function buildUserPrompt(ctx, durataMin) {
  const recentLines = ctx.recentDays.length === 0
    ? 'Nessuna attività bici negli ultimi 7 giorni.'
    : ctx.recentDays.map(d =>
        `- ${d.data} (${d.tipo}): ${d.durataMin}min, ${d.distanzaKm}km${d.avgWatts ? ', ' + d.avgWatts + 'W' : ''}${d.avgHr ? ', FC ' + d.avgHr : ''}`
      ).join('\n');

  return `STATO ATLETA:
- FTP: ${ctx.ftp}W · LTHR: ${ctx.lthr || '—'} bpm · Peso: ${ctx.weight || '—'} kg · Tier: ${ctx.tier}
- CTL ${ctx.ctl} · ATL ${ctx.atl} · TSB ${ctx.tsb}
- Polarizzazione 28gg: easy ${ctx.polarizzazione.easyPct ?? '—'}% / hard ${ctx.polarizzazione.hardPct ?? '—'}% · volume ${ctx.polarizzazione.totalMin}min
- Volume target: ${ctx.weeklyHours}h/sett su ${ctx.weeklyDays} giorni

ULTIME ATTIVITÀ BICI:
${recentLines}

OGGI: ${ctx.oggi} · DURATA DISPONIBILE: ${durataMin} minuti

Scegli il protocollo e restituisci SOLO il JSON.`;
}

async function callOllamaChat(endpoint, model, messages, signal) {
  const timeoutMs = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.ollamaTimeoutMs) || 180000;
  const res = await fetch(endpoint.replace(/\/+$/, '') + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.2 } }),
    signal: _composeSignals([signal, AbortSignal.timeout(timeoutMs)]),
  });
  if (!res.ok) throw new Error(`Chat HTTP ${res.status}: ${await res.text().catch(() => '?')}`);
  const data = await res.json();
  return { content: data.message?.content || '', stats: data };
}

function tryParseModelJSON(text) {
  // Tenta direttamente
  try { return JSON.parse(text); } catch {}
  // Cerca primo blocco {...}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

// ----------------------------------------------------------------------------
// Render
// ----------------------------------------------------------------------------

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

function renderPaperLink(paperMeta) {
  const url = `https://pubmed.ncbi.nlm.nih.gov/${paperMeta.pmid}/`;
  const cite = `${escHtml(paperMeta.authors)} (${escHtml(paperMeta.year)}). ${escHtml(paperMeta.title)}`;
  const journal = paperMeta.journal ? ` · <i>${escHtml(paperMeta.journal)}</i>` : '';
  return `<li><a href="${url}" target="_blank" rel="noopener">${cite}</a>${journal} · <span class="muted">PMID:${paperMeta.pmid}</span></li>`;
}

function renderCoachWorkout({ proto, built, razionale, paperRefs, modelRaw, modelStats, modelDur, modelLabel, retrievedPapers, fellBack }) {
  const stepsHtml = built.struttura.map(s => `<li>${escHtml(s)}</li>`).join('');
  const paperRefsHtml = paperRefs.length
    ? `<details style="margin-top:.5rem" open>
         <summary>📚 Paper citati nel razionale (${paperRefs.length})</summary>
         <ul class="paper-list">${paperRefs.map(renderPaperLink).join('')}</ul>
       </details>`
    : '';
  const retrievedHtml = retrievedPapers.length
    ? `<details style="margin-top:.5rem">
         <summary class="muted">🔍 Top paper recuperati per il tuo stato (RAG, top ${retrievedPapers.length})</summary>
         <ul class="paper-list">${retrievedPapers.map(p => `
           <li>
             <a href="https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/" target="_blank" rel="noopener">${escHtml(p.authors)} (${escHtml(p.year)}). ${escHtml(p.title)}</a>
             <span class="muted">· score ${p.score.toFixed(3)} · PMID:${p.pmid}</span>
           </li>`).join('')}</ul>
       </details>`
    : '';
  const fallbackBadge = fellBack
    ? `<div class="coach-warn">⚠️ Il modello non ha restituito JSON valido — uso fallback deterministico in base alle regole TSB/polarizzazione.</div>`
    : '';
  return `
    ${fallbackBadge}
    <div class="coach-card">
      <div class="coach-title"><b>${escHtml(built.title)}</b></div>
      <div class="coach-watt">⚡ ${escHtml(built.targetWatt)}</div>
      <ol class="coach-steps">${stepsHtml}</ol>
      <div class="coach-rationale">
        <b>Razionale:</b> ${escHtml(razionale)}
      </div>
      ${paperRefsHtml}
      ${retrievedHtml}
    </div>
    <div class="muted" style="font-size:.75rem; margin-top:.5rem">
      ⚡ ${escHtml(modelLabel)} · ${modelDur}s · ${modelStats?.eval_count || '?'} tok
    </div>
    <details style="margin-top:.5rem">
      <summary class="muted">🛠 Output grezzo del modello</summary>
      <pre>${escHtml(modelRaw)}</pre>
    </details>
  `;
}

// ----------------------------------------------------------------------------
// Generazione end-to-end
// ----------------------------------------------------------------------------

let coachAbortCtrl = null;

async function coach_generate(activities, stats, durataMin) {
  const settings = loadSettings();
  const cs = loadCoachSettings();
  const endpoint = (cs.endpoint || COACH_DEFAULT_ENDPOINT).trim();
  const model = (cs.model || COACH_DEFAULT_MODEL).trim();
  const ctx = buildCoachContext(activities, settings);

  const out = $('coach-output');
  $('coach-context').innerHTML = '<pre>' + JSON.stringify(ctx, null, 2) + '</pre>';

  // Pre-flight: FTP obbligatorio
  if (!ctx.ftp) {
    out.innerHTML = `<div class="coach-error">
      <b>❌ FTP non disponibile</b>
      <p style="margin:.5rem 0">Il Coach AI ha bisogno della FTP per calcolare i watt target.</p>
      <p class="muted" style="font-size:.85rem">Vai sulla tab <b>🎯 Allenamento</b> → <b>Impostazioni zone / volume</b> e dichiara l'FTP, oppure registra qualche attività con power meter su Strava.</p>
    </div>`;
    return;
  }

  out.innerHTML = '<div class="muted">⏳ Recupero paper rilevanti…</div>';

  if (coachAbortCtrl) coachAbortCtrl.abort();
  coachAbortCtrl = new AbortController();

  const t0 = performance.now();
  let retrievedPapers = [];
  try {
    const query = buildRetrievalQuery(ctx, durataMin);
    retrievedPapers = await retrieveTopPapers(endpoint, query, 4, coachAbortCtrl.signal);
  } catch (e) {
    out.innerHTML = `<div class="coach-error">
      <b>❌ Errore retrieval paper</b>
      <p style="margin:.5rem 0">${escHtml(e.message)}</p>
      <p class="muted" style="font-size:.85rem">Verifica:</p>
      <ul class="muted" style="font-size:.85rem">
        <li>Indice paper costruito? Esegui da terminale: <code>node build_papers_index.mjs</code></li>
        <li>Modello embeddings scaricato? <code>ollama list</code> deve includere <b>nomic-embed-text</b></li>
        <li>Ollama attivo su <code>${escHtml(endpoint)}</code>?</li>
      </ul>
    </div>`;
    return;
  }

  out.innerHTML = '<div class="muted">⏳ Il modello sta scegliendo il protocollo…</div>';

  const messages = [
    { role: 'system', content: buildSystemPrompt(retrievedPapers) },
    { role: 'user', content: buildUserPrompt(ctx, durataMin) },
  ];

  let modelRaw = '', modelStats = {};
  try {
    const r = await callOllamaChat(endpoint, model, messages, coachAbortCtrl.signal);
    modelRaw = r.content;
    modelStats = r.stats;
  } catch (e) {
    if (e.name === 'AbortError') return;
    out.innerHTML = `<div class="coach-error">
      <b>❌ Errore chiamata modello</b>
      <p style="margin:.5rem 0">${escHtml(e.message)}</p>
    </div>`;
    return;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  // Parse JSON dal modello
  const parsed = tryParseModelJSON(modelRaw);
  let protocolId, razionale, paperUsati, fellBack = false;
  if (parsed && typeof parsed === 'object' && COACH_PROTOCOLS[parsed.protocolId]) {
    protocolId = parsed.protocolId;
    razionale = parsed.razionale || '(razionale non fornito)';
    paperUsati = Array.isArray(parsed.paperUsati) ? parsed.paperUsati : [];
  } else {
    protocolId = fallbackProtocolId(ctx, durataMin);
    razionale = `Decisione fallback: TSB ${ctx.tsb}, polarizzazione hard ${ctx.polarizzazione.hardPct ?? '—'}% → ${COACH_PROTOCOLS[protocolId].name}`;
    paperUsati = [];
    fellBack = true;
  }

  // Build workout (deterministico)
  const proto = COACH_PROTOCOLS[protocolId];
  let built = proto.build(ctx.ftp, durataMin);

  // Se durata insufficiente per quel protocollo, fallback a z2_endurance
  if (!built) {
    protocolId = 'z2_endurance';
    razionale += ` · (Durata ${durataMin}min insufficiente per il protocollo scelto, ripiego su Z2.)`;
    built = COACH_PROTOCOLS[protocolId].build(ctx.ftp, durataMin);
    fellBack = true;
  }

  // Lookup paper meta usati nel razionale
  const paperRefs = [];
  const allPapers = (await loadPapersIndex()).papers;
  for (const pmid of paperUsati) {
    const meta = allPapers.find(p => p.pmid === String(pmid));
    if (meta) paperRefs.push(meta);
  }
  // Aggiungi anche la fonte di catalogo se non già presente
  if (proto.fontePMID && !paperRefs.find(p => p.pmid === proto.fontePMID)) {
    const meta = allPapers.find(p => p.pmid === proto.fontePMID);
    if (meta) paperRefs.push(meta);
  }

  out.innerHTML = renderCoachWorkout({
    proto, built, razionale, paperRefs,
    modelRaw, modelStats, modelDur: elapsed, modelLabel: model,
    retrievedPapers, fellBack,
  });
}

// ----------------------------------------------------------------------------
// Bind UI
// ----------------------------------------------------------------------------

async function pingOllama(endpoint) {
  try {
    const res = await fetch(endpoint.replace(/\/+$/, '') + '/api/tags');
    if (!res.ok) return { ok: false, msg: 'HTTP ' + res.status };
    const j = await res.json();
    return { ok: true, models: (j.models || []).map(m => m.name) };
  } catch (e) { return { ok: false, msg: e.message }; }
}

function initCoach(activities, stats) {
  const sec = $('coach-section');
  if (!sec) return;
  const cs = loadCoachSettings();

  $('coach-endpoint').value = cs.endpoint || COACH_DEFAULT_ENDPOINT;
  $('coach-model').value = cs.model || COACH_DEFAULT_MODEL;
  $('coach-duration').value = cs.lastDuration || 60;

  $('coach-save-settings').onclick = () => {
    saveCoachSettings({
      endpoint: $('coach-endpoint').value.trim() || COACH_DEFAULT_ENDPOINT,
      model: $('coach-model').value.trim() || COACH_DEFAULT_MODEL,
      lastDuration: +$('coach-duration').value || 60,
    });
    $('coach-settings-status').textContent = '✅ Salvato';
    setTimeout(() => $('coach-settings-status').textContent = '', 1500);
  };

  $('coach-ping').onclick = async () => {
    $('coach-ping-status').textContent = '⏳ Test…';
    const ep = $('coach-endpoint').value.trim() || COACH_DEFAULT_ENDPOINT;
    const r = await pingOllama(ep);
    if (r.ok) {
      const hasChat = r.models.includes($('coach-model').value.trim() || COACH_DEFAULT_MODEL);
      const hasEmb = r.models.some(m => m.startsWith('nomic-embed-text'));
      $('coach-ping-status').innerHTML = `✅ Ollama raggiungibile · modelli: <code>${r.models.join(', ') || '(vuoto)'}</code> ${hasChat ? '' : '⚠️ chat model mancante'} ${hasEmb ? '' : '⚠️ nomic-embed-text mancante'}`;
    } else {
      $('coach-ping-status').innerHTML = `❌ ${escHtml(r.msg)}`;
    }
  };

  $('coach-generate').onclick = () => {
    const dur = +$('coach-duration').value || 60;
    saveCoachSettings({ ...loadCoachSettings(), lastDuration: dur });
    coach_generate(activities, stats, dur);
  };

  show('coach-section');
}

export { initCoach, coach_generate, pingOllama, loadCoachSettings, saveCoachSettings };
