// Risultati di riferimento dei calcoli: esegue il codice JavaScript delle pagine di oggi
// (web/*.js) sulle uscite inventate di tests/fixtures/rides.json e scrive i risultati in
// tests/fixtures/load-expected.json; per il piano di allenamento, sui casi di
// tests/fixtures/plan-cases.json, in tests/fixtures/plan-expected.json (record-plan.ts).
// I test di tests/core controllano che i calcoli TypeScript di src/core diano gli stessi
// risultati.
//
// I file sono stati scritti la prima volta dal codice di prima della conversione. Le pagine
// di oggi usano ancora gli stessi nomi (ora presi da src/core): rieseguirlo deve lasciare
// i file identici, e `git diff --exit-code tests/fixtures` lo conferma.
//
// Uso, dalla cartella del progetto:
//   docker compose run --rm --no-deps app node tests/reference/record.ts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planReference } from './record-plan.ts';
import { replacer } from './serialize.ts';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const WEB = path.resolve(FIXTURES, '..', '..');
const readFixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const rides = readFixture('rides.json');
const plan = readFixture('plan-cases.json');

// I giorni dipendono dal fuso orario, come nel browser: tutto gira in quello delle fixtures.
process.env.TZ = rides.timeZone;

// Browser simulato: localStorage, pagina e orologio fermo all'istante delle fixtures
// (i casi del piano lo spostano).
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: unknown) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  },
  document: { getElementById: () => ({ innerHTML: '', value: '', textContent: '' }) },
});
let now = Date.parse(rides.now);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args: ConstructorParameters<DateConstructor> | []) {
    super(...((args.length ? args : [now]) as [number]));
  }

  static now() { return now; }
} as DateConstructor;

const load = (file: string) => import(pathToFileURL(path.join(WEB, file)).href);
const m = { ...(await load('strava.js')), ...(await load('training.js')), ...(await load('analysis.js')),
  ...(await load('predictions.js')), ...(await load('training_v2.js')) };

// Serie degli stream nel formato di Strava, da blocchi [valore, secondi].
const expand = (blocks: [number, number][]) => blocks.flatMap(([v, s]) => Array<number>(s).fill(v));
const streamsOf = (s: Record<string, [number, number][]>) =>
  Object.fromEntries(Object.entries(s).map(([k, blocks]) => [k, { data: expand(blocks) }]));

// Le attività con gli stream già scaricati, come le prepara applyCachedStreams.
function activities() {
  const acts = structuredClone(rides.activities);
  for (const [id, s] of Object.entries(rides.streams.byActivity)) {
    const act = acts.find((a: { id: number }) => String(a.id) === id);
    act._metrics = m.computeStreamsMetrics(streamsOf(s as Record<string, [number, number][]>), 250, 165);
  }
  return acts;
}

// Valori salvati nel browser per uno scenario.
function prepareStorage(sc: { segments?: boolean; ftpHistory?: string; mesocycle?: string }) {
  store.clear();
  if (sc.segments) store.set('biketr_segments_cache_v2', JSON.stringify(rides.segmentCache));
  if (sc.ftpHistory) store.set('biketr_ftp_history', JSON.stringify(rides.ftpHistories[sc.ftpHistory]));
  if (sc.mesocycle) store.set('biketr_mesocycle', JSON.stringify(rides.mesocycles[sc.mesocycle]));
}
const stored = (key: string) => JSON.parse(store.get(key) ?? 'null');

function scenarioReference(sc: any) {
  prepareStorage(sc);
  const settings = sc.settings;
  const acts = sc.noActivities ? [] : activities();
  const profile = m.resolveHr(settings, acts);
  const form = m.buildFormTrend(acts, settings);
  const meso = m.loadMesocycle();
  const block = meso && m.MESO_BLOCKS.find((b: { id: string }) => b.id === meso.blockId);
  return {
    profile,
    // Le card Forma e Zone FC chiamano resolveHr senza attività: contano dichiarate e segmenti.
    profileWithoutActivities: m.resolveHr(settings),
    ftpFromActivities: m.estimateFTP(acts),
    lthrFromActivities: m.estimateLTHR(acts),
    segmentEstimates: m.estimatesFromSegments(),
    activities: Object.fromEntries(acts.map((a: { id: number }) => [a.id, {
      typeWeight: m.typeWeight(a),
      load: m.activityLoad(a, profile.hrMax, profile.hrLthr, profile.ftp),
      hard: m.isHard(a, profile.hrLthr, profile.ftp),
    }])),
    muscularFatigue: { 7: m.muscularFatigueScore(acts, 7), 14: m.muscularFatigueScore(acts, 14) },
    consistency: m.consistencyScore(acts),
    athleteProfile: m.buildProfile(rides.stats[sc.stats], acts, settings),
    records: m.personalRecords(acts),
    form,
    // Ingressi di formInsights che vengono dal mesociclo (spostato con il piano di allenamento).
    insightContext: {
      response: m.athleteResponseCheck(acts, settings),
      meso: block ? { label: block.label, weeks: block.weeks, description: block.description,
        weekInBlock: meso.weekInBlock } : null,
    },
    formInsights: m.formInsights(form, acts, settings),
    compositeFatigue: m.compositeFatigueScore(acts, settings),
    crossTraining: m.crossTrainingInsights(acts, settings),
    hrZones: m.buildHrZones(acts, settings),
    powerCurve: m.buildPowerCurve(acts, settings.weight),
    powerProfile: m.buildPowerProfile(acts, settings.weight),
    ftpTrend: m.buildFtpTrend(),
    ftpBreakdown: m.buildFtpBreakdown(acts),
    lthrBreakdown: m.buildLthrBreakdown(acts),
  };
}

// Storico FTP e mesociclo salvati dopo un caricamento della pagina Allenamento.
function ftpPointReference(c: { scenario: string; ftpHistory: string; mesocycle?: string }) {
  const sc = rides.scenarios.find((s: { name: string }) => s.name === c.scenario);
  prepareStorage({ ...sc, ftpHistory: c.ftpHistory, mesocycle: c.mesocycle });
  m.recordFtpPoint(sc.settings, sc.noActivities ? [] : activities());
  return { ...c, ftpHistory: stored('biketr_ftp_history'), mesocycle: stored('biketr_mesocycle') };
}

function dateReference(offset: number) {
  const { ref, ago, refIso } = m.buildDateHelpers(offset);
  return {
    offset,
    ref: ref.toISOString(),
    ago: Object.fromEntries(rides.activities.map((a: { start_date_local: string }) =>
      [a.start_date_local, ago(a.start_date_local)])),
    refIso: Object.fromEntries([-1, 0, 1, 7].map(n => [n, refIso(n)])),
  };
}

function segmentReference() {
  store.clear();
  const entries: any[] = rides.predictions;
  const efforts = entries.flatMap(e => e.efforts);
  return {
    suitable: [...Object.values(rides.segmentCache).map((c: any) => c._segment || {}),
      ...entries.map(e => e.segment)].map(s => m.isSegmentFTPSuitable(s)),
    decay: efforts.map(e => m.effortDecay(e.start_date)),
    regression: rides.regressionPoints.map((p: unknown) => m.linearRegression(p)),
    adjusted: rides.adjustCases.flatMap(([base, best]: [number, number]) =>
      rides.formContexts.map((ctx: unknown) => m.formAdjustedTime(base, best, ctx))),
    predictions: entries.map(e => rides.formContexts.map((ctx: unknown) => m.computePrediction(e, ctx))),
    targeted: entries.map(e => [m.segmentTargetedWorkout(e, 250, 165), m.segmentTargetedWorkout(e, null, null)]),
    generated: [m.generateSegmentWorkouts(entries, 250, 165), m.generateSegmentWorkouts([], 250, 165)],
  };
}

const reference = {
  streams: Object.entries(rides.streams.byActivity).flatMap(([id, s]) =>
    rides.streams.profiles.map(({ ftp, lthr }: { ftp: number | null; lthr: number | null }) => ({
      activity: Number(id), ftp, lthr,
      metrics: m.computeStreamsMetrics(streamsOf(s as Record<string, [number, number][]>), ftp, lthr),
    }))),
  levels: rides.levelKm.map((km: number) => m.levelFromKm(km)),
  typeWeights: ['Ride', 'Hike', 'Sconosciuto', null].map(t => m.typeWeight(t)),
  hikeLoads: rides.activities.filter((a: { type: string }) => a.type === 'Hike' || a.type === 'Walk')
    .flatMap((a: unknown) => [[186, 166], [190, null], [null, null]].map(([hrMax, hrLthr]) =>
      ({ hrMax, hrLthr, load: m.hikeSpecificLoad(a, hrMax, hrLthr) }))),
  dates: rides.dateOffsets.map(dateReference),
  ftpTrends: Object.fromEntries(Object.keys(rides.ftpHistories).map(name => {
    prepareStorage({ ftpHistory: name });
    return [name, m.buildFtpTrend()];
  })),
  ftpPoints: rides.ftpPointCases.map(ftpPointReference),
  segments: segmentReference(),
  scenarios: Object.fromEntries(rides.scenarios.map((sc: { name: string }) => [sc.name, scenarioReference(sc)])),
};

const planned = planReference({
  m, store, rides, plan, activities, setNow: (iso: string) => { now = Date.parse(iso); },
});

// Il container gira come root: i file restano del proprietario della cartella.
const { uid, gid } = fs.statSync(FIXTURES);
function write(name: string, data: unknown) {
  const out = path.join(FIXTURES, name);
  fs.writeFileSync(out, JSON.stringify(data, replacer, 1) + '\n');
  fs.chownSync(out, uid, gid);
  console.log(`Scritto tests/fixtures/${name}`);
}
write('load-expected.json', reference);
write('plan-expected.json', planned);
