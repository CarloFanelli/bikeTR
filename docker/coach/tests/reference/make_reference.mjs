// Valori di riferimento per i test del servizio Coach: esegue il codice del
// browser sulle attività inventate di fixtures/rides.json e sui casi di
// fixtures/coach_cases.json, e scrive i risultati in fixtures/metrics_expected.json
// e fixtures/coach_expected.json. I test Python controllano che il servizio ottenga
// gli stessi numeri, gli stessi prompt e lo stesso workout.
//
// Il Coach del browser non esiste più: al posto di coach.js si usa la sua copia
// coach_before_move.js. I moduli che importa (strava.js, training.js, analysis.js,
// training_v2.js) sono sostituiti da file che danno gli stessi nomi ai calcoli
// TypeScript di oggi in web/src/.
//
// Uso, dalla cartella del progetto (vedi README, sezione Tests):
//   docker run --rm -v "${PWD}:/src:ro" -v "${PWD}/docker/coach/tests:/tests" node:22-alpine node /tests/reference/make_reference.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const TESTS = path.resolve(path.dirname(SCRIPT), '..');
const PROJECT = '/src';
const BROWSER_SRC = path.join(PROJECT, 'web');
const fixture = (name) => path.join(TESTS, 'fixtures', name);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rides = readJson(fixture('rides.json'));
const coachCases = readJson(fixture('coach_cases.json'));

// I moduli che coach_before_move.js importa, con i nomi di prima, sui calcoli di web/src/.
// Il profilo atleta delle fixtures (globalThis.__profile) sostituisce le stime di resolveHr.
const SHIMS = {
  'strava.js': `
export { loadSettings, safeLoad, safeSave } from './src/data/storage.ts';
export { fmtTime } from './src/core/format.ts';
export { computeStreamsMetrics } from './src/core/streams.ts';
// Il Coach di prima leggeva solo APP_CONFIG.ollamaTimeoutMs, che l'app non ha mai impostato.
export const APP_CONFIG = {};
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
`,
  'training.js': `
import { resolveHr as resolveHrFrom } from './src/core/hr.ts';
export { activityLoad } from './src/core/load.ts';
export function resolveHr(settings, activities) {
  if (globalThis.__profile) return globalThis.__profile;
  return resolveHrFrom(settings, activities, null, new Date());
}
`,
  'analysis.js': `
import { buildFormTrend as formTrendFrom } from './src/core/form.ts';
import { resolveHr } from './training.js';
export const buildFormTrend = (activities, settings) => formTrendFrom(activities, resolveHr(settings, activities), new Date());
`,
  'training_v2.js': `
export { v2_capacityTier } from './src/core/training-v2.ts';
`,
};

// In una cartella temporanea: i calcoli di web/src/, i moduli qui sopra e il Coach di
// prima, con le funzioni interne esportate e gli argomenti del disegno del workout registrati.
async function loadBrowserModules() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biketr-'));
  fs.cpSync(path.join(BROWSER_SRC, 'src'), path.join(dir, 'src'), { recursive: true });
  for (const [file, code] of Object.entries(SHIMS)) fs.writeFileSync(path.join(dir, file), code.trimStart());
  fs.copyFileSync(path.join(path.dirname(SCRIPT), 'coach_before_move.js'), path.join(dir, 'coach.js'));
  const patch = (file, find, replace) => {
    const p = path.join(dir, file);
    const src = fs.readFileSync(p, 'utf8');
    if (!src.includes(find)) throw new Error(`${file}: non trovo "${find}", aggiorna make_reference.mjs`);
    fs.writeFileSync(p, src.replace(find, replace));
  };
  patch('coach.js', 'function renderCoachWorkout(',
    'function renderCoachWorkout(args) { globalThis.__rendered = args; return renderCoachWorkoutHtml(args); }\nfunction renderCoachWorkoutHtml(');
  fs.appendFileSync(path.join(dir, 'coach.js'),
    '\nexport { buildCoachContext, COACH_PROTOCOLS, fallbackProtocolId };\n');
  const load = (f) => import(pathToFileURL(path.join(dir, f)).href);
  return { ...(await load('strava.js')), ...(await load('training.js')), ...(await load('analysis.js')),
    ...(await load('training_v2.js')), ...(await load('coach.js')) };
}

const expand = (blocks) => blocks.flatMap(([value, seconds]) => Array(seconds).fill(value));
const streamsOf = (s) => Object.fromEntries(Object.entries(s).map(([k, blocks]) => [k, { data: expand(blocks) }]));

// Browser simulato: localStorage, pagina e orologio fermo all'istante delle fixtures.
const store = new Map();
let elements = {};
function simulateBrowser() {
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.document = { getElementById: (id) => (elements[id] ??= { innerHTML: '', value: '', textContent: '' }) };
  const NOW = Date.parse(rides.now);
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
}

// Profilo, impostazioni e attività di uno scenario; le metriche degli stream finiscono
// in a._metrics come fa applyCachedStreams.
function prepare(m, sc) {
  const p = rides.profiles[sc.profile];
  globalThis.__profile = { ftp: p.ftp, hrLthr: p.lthr, hrMax: p.hrMax };
  const settings = { weight: p.weight, weeklyHours: p.weeklyHours, weeklyDays: p.weeklyDays };
  store.set('biketr_settings', JSON.stringify(settings));
  const acts = sc.noActivities ? [] : structuredClone(rides.activities);
  const streamMetrics = {};
  for (const [id, s] of Object.entries(rides.streams)) {
    streamMetrics[id] = m.computeStreamsMetrics(streamsOf(s), p.ftp, p.lthr);
    const act = acts.find(a => String(a.id) === id);
    if (act) act._metrics = streamMetrics[id];
  }
  return { p, settings, acts, streamMetrics };
}

function metricsReference(m) {
  const scenarios = {};
  for (const sc of rides.scenarios) {
    const { p, settings, acts, streamMetrics } = prepare(m, sc);
    const form = m.buildFormTrend(acts, settings);
    const last = form.DAYS - 1;
    scenarios[sc.name] = {
      rides: Object.fromEntries(Object.entries(streamMetrics).map(([id, x]) =>
        [id, { NP: x.NP ?? null, TSS: x.TSS ?? null, hrTSS: x.hrTSS ?? null }])),
      loads: Object.fromEntries(acts.map(a => [a.id, m.activityLoad(a, p.hrMax, p.lthr, p.ftp)])),
      daily: form.daily,
      last: { ctl: form.ctl[last], atl: form.atl[last], tsb: form.tsb[last] },
      context: m.buildCoachContext(acts, settings),
    };
  }
  const tiers = rides.tiers.map(([weeklyHours, ctl]) => m.v2_capacityTier({ weeklyHours }, { ctl }).label);
  return { scenarios, tiers };
}

// Ogni protocollo a più FTP, alle durate dei casi e attorno alla sua durata minima.
function catalogReference(m) {
  const catalog = {};
  for (const [id, proto] of Object.entries(m.COACH_PROTOCOLS)) {
    let min = 0;
    while (min <= 300 && !proto.build(250, min)) min++;
    const durations = [...new Set([...coachCases.catalogDurations, min - 1, min])]
      .filter(d => d >= 0).sort((a, b) => a - b);
    catalog[id] = {
      name: proto.name,
      fontePMID: proto.fontePMID,
      builds: coachCases.catalogFtps.flatMap(ftp => durations.map(duration =>
        ({ ftp, duration, built: proto.build(ftp, duration) }))),
    };
  }
  const { tsb, hardPct, durations } = coachCases.fallback;
  const fallback = tsb.flatMap(t => hardPct.flatMap(h => durations.map(d =>
    m.fallbackProtocolId({ tsb: t, polarizzazione: { hardPct: h } }, d))));
  return { catalog, fallback };
}

// Il Coach del browser completo (coach_generate), con Ollama e indice dei paper simulati.
async function casesReference(m, tz) {
  const index = readJson(fixture('papers_index.json'));
  const results = {};
  for (const c of coachCases.cases.filter(c => c.timeZone === tz)) {
    const { acts } = prepare(m, rides.scenarios.find(s => s.name === c.scenario));
    store.set('biketr_coach_settings', JSON.stringify({ model: coachCases.model }));
    const seen = { fetches: 0 };
    globalThis.fetch = async (url, opts) => {
      seen.fetches++;
      if (url === 'papers_index.json') return Response.json(index);
      const body = JSON.parse(opts.body);
      if (url.endsWith('/api/embeddings')) {
        seen.query = body.prompt;
        return Response.json({ embedding: coachCases.queries[c.query] });
      }
      if (url.endsWith('/api/chat')) {
        seen.chat = body;
        return Response.json({ message: { content: c.answer }, eval_count: 42 });
      }
      throw new Error(`richiesta inattesa: ${url}`);
    };
    elements = {};
    globalThis.__rendered = null;
    await m.coach_generate(acts, {}, c.duration);
    const r = globalThis.__rendered;
    results[c.name] = r ? {
      query: seen.query,
      model: seen.chat.model,
      messages: seen.chat.messages,
      built: r.built,
      razionale: r.razionale,
      paperRefs: r.paperRefs.map(p => p.pmid),
      retrieved: r.retrievedPapers.map(p => ({ pmid: p.pmid, score: p.score })),
      fellBack: r.fellBack,
    } : {
      noFtp: elements['coach-output'].innerHTML.includes('FTP non disponibile'),
      fetches: seen.fetches,
    };
  }
  return results;
}

if (process.env.REFERENCE_TZ) {
  simulateBrowser();
  const m = await loadBrowserModules();
  process.stdout.write(JSON.stringify({
    metrics: metricsReference(m),
    coach: { ...catalogReference(m), cases: await casesReference(m, process.env.REFERENCE_TZ) },
  }));
} else {
  // Il container gira come root: i file restano del proprietario della cartella.
  const { uid, gid } = fs.statSync(TESTS);
  const write = (name, data) => {
    fs.writeFileSync(fixture(name), JSON.stringify(data, null, 1) + '\n');
    fs.chownSync(fixture(name), uid, gid);
    console.log(`Scritto fixtures/${name}`);
  };

  // Indice dei paper dei test: i paper veri, con embedding inventati (vettori unitari).
  const real = readJson(path.join(PROJECT, 'papers_index.json'));
  write('papers_index.json', {
    model: real.model,
    papers: real.papers.map(({ embedding, ...meta }, i) =>
      ({ ...meta, embedding: real.papers.map((_, j) => (i === j ? 1 : 0)) })),
  });

  // Il fuso orario di Date si fissa all'avvio del processo: un processo per fuso.
  const metrics = {};
  const coach = { cases: {} };
  for (const tz of rides.timeZones) {
    const run = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, TZ: tz, REFERENCE_TZ: tz }, encoding: 'utf8', maxBuffer: 64 << 20,
    });
    if (run.status !== 0) {
      process.stderr.write(run.stderr);
      process.exit(1);
    }
    const result = JSON.parse(run.stdout);
    metrics[tz] = result.metrics;
    Object.assign(coach, { catalog: result.coach.catalog, fallback: result.coach.fallback });
    Object.assign(coach.cases, result.coach.cases);
  }
  write('metrics_expected.json', metrics);
  write('coach_expected.json', coach);
}
