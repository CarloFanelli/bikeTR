// Risultati di riferimento del piano di allenamento (tab Allenamento e Training v2) sui
// casi di tests/fixtures/plan-cases.json, scritti da record.ts in plan-expected.json.
// record.ts simula il browser: qui si sceglie l'istante e i valori salvati di ogni caso.

import { caseActivities, profileOf } from './plan-inputs.ts';

// I moduli JavaScript di oggi non hanno tipi: i loro valori sono `any`.
interface Recorder {
  m: any;
  store: Map<string, string>;
  setNow: (iso: string) => void;
  activities: () => any[];
  rides: any;
  plan: any;
}

// Un calcolo che lancia un errore nel codice di oggi deve lanciarlo anche dopo.
function attempt<T>(fn: () => T): T | { throws: true } {
  try {
    return fn();
  } catch {
    return { throws: true };
  }
}

export function planReference({ m, store, setNow, activities, rides, plan }: Recorder) {
  const stored = (key: string) => JSON.parse(store.get(key) ?? 'null');

  // Valori salvati nel browser: segmenti, storico FTP, mesociclo e giorni di pioggia.
  function prepareStorage(c: { now: string; segments?: boolean; ftpHistory?: string | null; mesocycle?: string | null; rainyDays?: string[] }) {
    setNow(c.now);
    store.clear();
    if (c.segments) store.set('biketr_segments_cache_v2', JSON.stringify(rides.segmentCache));
    if (c.ftpHistory) store.set('biketr_ftp_history', JSON.stringify(rides.ftpHistories[c.ftpHistory]));
    if (c.mesocycle) store.set('biketr_mesocycle', JSON.stringify(plan.mesocycles[c.mesocycle]));
    if (c.rainyDays) store.set('biketr_rainy_days', JSON.stringify(c.rainyDays));
  }

  function caseReference(c: any) {
    prepareStorage(c);
    const settings = plan.settings[c.settings];
    const acts = caseActivities(c.activities, activities(), c.now, plan.activitySets);
    const profile = profileOf(c.level);
    const rests: string[] = c.plannedRests;
    const plannedSet = new Set(rests);
    const days = plan.dayOffsets.map((offset: number) => {
      const rec = attempt(() => m.recommend(acts, settings, rests, offset, profile));
      return {
        offset,
        recommend: rec,
        synthetic: 'throws' in rec ? null : m.synthActivityFromRec(rec, offset, settings),
        metrics: m.computeMetrics(acts, settings, rests, offset),
        restStreak: m.restStreak(acts, plannedSet, offset),
      };
    });
    const result = {
      days,
      nextNonSkip: [m.findNextNonSkipOffset(plannedSet), m.findNextNonSkipOffset(plannedSet, 1)],
      loadChart: m.renderLoadChart(acts, settings),
      model: m.buildTrainingModel(acts, settings),
      response: m.athleteResponseCheck(acts, settings),
      weekPlan: m.buildWeekPlan(acts, settings, rests, profile),
      monthPlan: m.buildMonthPlan(acts, settings, rests, profile),
    };
    // Per ultimo: aggiorna il mesociclo salvato.
    const init = attempt(() => m.initMesocycle(acts, settings));
    return { ...result, mesocycle: { result: init, stored: stored('biketr_mesocycle') } };
  }

  // Il workout di ogni categoria, con e senza FTP e soglia, a vari stati di forma.
  function workoutReference() {
    const w = plan.workout;
    prepareStorage({ now: rides.now, segments: true });
    const pairs = w.settings.map((s: string, i: number) => ({ settings: s, profile: w.profiles[i] }));
    const categories = w.categories.flatMap((cat: string) => pairs.flatMap(({ settings, profile }: any) =>
      w.variants.map((v: any) => ({
        cat, settings, profile, ...v,
        workout: m.workoutForCategory(cat, plan.settings[settings], profile, v.hardIndex, v.formCtx,
          v.isRecoveryWeek, v.totalHardsInWeek),
      }))));
    const hard = w.hard.mesocycles.flatMap((meso: string | null) => {
      prepareStorage({ now: rides.now, segments: true, mesocycle: meso });
      return w.hard.formCtx.flatMap((formCtx: unknown) => w.hard.totalHardsInWeek.flatMap((total: number) =>
        w.hard.hardIndex.map((hardIndex: number) => ({
          meso, formCtx, totalHardsInWeek: total, hardIndex,
          workout: m.workoutForCategory('HARD', plan.settings.declared, null, hardIndex, formCtx, false, total),
        }))));
    });
    const tierOf = (t: [number, number] | null) => t && m.v2_capacityTier({ weeklyHours: t[0] }, { ctl: t[1] });
    const athlete = { hrLthr: 166, ftp: 255 };
    const vo2 = w.vo2.variants.flatMap((variant: string) => w.vo2.volMul.flatMap((volMul: number) =>
      w.vo2.tiers.map((tier: [number, number] | null) => ({
        variant, volMul, tier,
        workout: m.v2_vo2Workout(variant, athlete, volMul, ' · scarico', ' · nota', tierOf(tier), '\nstrumenti'),
      }))));
    const others = w.vo2.volMul.flatMap((volMul: number) => w.vo2.tiers.map((tier: [number, number] | null) => ({
      volMul, tier,
      aerobic: m.v2_aerobicCapacityWorkout(athlete, volMul, '', '', tierOf(tier)),
      sprints: m.v2_strengthSprintsWorkout({}, volMul, ' · scarico', ' · nota', tierOf(tier), '\nstrumenti'),
    })));
    return {
      categories, hard, vo2, others,
      tiers: w.tiers.map(([weeklyHours, ctl]: [number | null, number]) =>
        m.v2_capacityTier(weeklyHours == null ? {} : { weeklyHours }, { ctl })),
      circuits: w.strengthLevels.map((level: number | null) => m.v2_strengthCircuits(level)),
      reducedVolume: w.reducedVolume.map((v: number) => m._isReducedVolume(v)),
    };
  }

  function mesoReference() {
    const p = plan.meso;
    prepareStorage({ now: rides.now });
    const meso = (blockId: string, weekInBlock: number | null) =>
      (weekInBlock == null ? { blockId } : { blockId, weekInBlock });
    const inits = p.initNows.flatMap((now: string) => [null, ...Object.keys(plan.mesocycles)].flatMap(name =>
      ['declared', 'empty'].map(s => {
        prepareStorage({ now, mesocycle: name });
        const result = attempt(() => m.initMesocycle(activities(), plan.settings[s]));
        return { now, mesocycle: name, settings: s, result, stored: stored('biketr_mesocycle') };
      })));
    return {
      taper: p.taper.raceDates.flatMap((race: string | null) =>
        p.taper.weekStarts.map((week: string | null) => ({ race, week, phase: m.getTaperPhase(race, week) }))),
      weekRoles: [null, ...p.weekRoles.blocks].flatMap((blockId: string | null) =>
        p.weekRoles.weekInBlock.flatMap((w: number | null) => p.weekRoles.weekOffsets.map((offset: number) =>
          ({ blockId, weekInBlock: w, offset, role: m.getWeekRoleInBlock(blockId && meso(blockId, w), offset) })))),
      deficits: p.deficits.map((d: string | null) => m.deficitToBlock(d)),
      nextBlock: p.nextBlock.blocks.flatMap((blockId: string) => p.nextBlock.deficits.map((area: string | null) =>
        m.chooseNextBlock({ blockId }, area ? { primaryDeficit: { area } } : null))),
      phases: p.weekRoles.blocks.flatMap((blockId: string) =>
        [0, 1, 3, 5].map(w => m.mesoPhaseForWeek(meso(blockId, w)))),
      inits,
    };
  }

  // Attività già svolte nel piano e attività simulate dai workout proposti.
  function recordsReference(monthTitles: string[]) {
    prepareStorage({ now: rides.now, segments: true });
    return {
      done: activities().flatMap(a => ['declared', 'empty'].map(s => m.buildDoneRec(a, plan.settings[s]))),
      synthetic: monthTitles.flatMap(title => ['declared', 'empty'].map(s =>
        ({ title, settings: s, activity: m.synthFromWorkout({ title }, '2026-11-10', plan.settings[s]) }))),
    };
  }

  const cases = Object.fromEntries(plan.cases.map((c: any) => [c.name, caseReference(c)]));
  const titles = [...new Set(Object.values(cases).flatMap((c: any) =>
    [...c.weekPlan.days, ...c.monthPlan.flatMap((w: any) => w.days)].map((d: any) => d.rec.title)))].sort();
  return {
    cases,
    workouts: workoutReference(),
    meso: mesoReference(),
    records: recordsReference([...titles, 'Senza titolo', '😴 Riposo', '🟢 Riattivazione']),
  };
}
