import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildFormTrend } from '../../src/core/form.ts';
import { athleteResponseCheck, nextMesocycle } from '../../src/core/meso.ts';
import { planHr } from '../../src/core/plan/inputs.ts';
import { loadChartDays, type LoadChartDay } from '../../src/core/plan/load-chart.ts';
import { buildTrainingModel } from '../../src/core/plan/model.ts';
import { buildMonthPlan, synthFromWorkout } from '../../src/core/plan/month.ts';
import {
  computeMetrics, findNextNonSkipOffset, recommend, restStreak, synthActivityFromRec,
} from '../../src/core/plan/recommend.ts';
import { buildDoneRec, buildWeekPlan } from '../../src/core/plan/week.ts';
import {
  mesocycleOf, plan, planCase, planCases, planExpected, planInputs, settingsOf, throws,
} from './plan-reference.ts';
import { activities, displayed, rides } from './reference.ts';

// Il piano della settimana scrive in console un controllo sui giorni di pioggia.
beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

interface RecordedDay {
  offset: number;
  recommend: unknown;
  synthetic: unknown;
  metrics: unknown;
  restStreak: number;
}

// Il tipo di giorno nel titolo di ogni barra del grafico disegnato.
const barTag = (b: LoadChartDay) =>
  b.long ? 'lunga' : b.hard ? 'bici dura' : b.bike ? 'bici easy' : b.nonBike ? 'cross-training' : 'riposo';

describe.each(planCases)('piano di allenamento, caso $name', c => {
  const { inputs, settings, acts, profile, expected: exp } = planCase(c);
  const { now } = inputs;
  const hr = planHr(settings, acts, inputs);
  const plannedSet = new Set(c.plannedRests);
  const days: RecordedDay[] = exp.days;

  it.each(days)('consiglio e numeri del giorno +$offset', d => {
    const advise = () => recommend(acts, settings, c.plannedRests, d.offset, profile, inputs);
    if (throws(d.recommend)) {
      expect(advise).toThrow(TypeError);
    } else {
      const rec = advise();
      expect(displayed(rec)).toEqual(displayed(d.recommend));
      expect(displayed(synthActivityFromRec(rec, d.offset, settings, inputs))).toEqual(displayed(d.synthetic));
    }
    expect(displayed(computeMetrics(acts, hr, c.plannedRests, d.offset, now))).toEqual(displayed(d.metrics));
    expect(restStreak(acts, plannedSet, d.offset, now)).toBe(d.restStreak);
  });

  it('prossimo giorno non saltato', () => {
    expect([findNextNonSkipOffset(plannedSet, 7, now), findNextNonSkipOffset(plannedSet, 1, now)])
      .toEqual(exp.nextNonSkip);
  });

  // La registrazione ha il grafico disegnato: ogni barra ha il titolo "giorno: carico N · tipo".
  it('grafico del carico di 30 giorni', () => {
    const shown = [...(exp.loadChart as string).matchAll(/<title>(.*?)<\/title>/g)].map(m => m[1]);
    expect(loadChartDays(acts, hr, now).map(b => `${b.iso}: carico ${b.load.toFixed(0)} · ${barTag(b)}`))
      .toEqual(shown);
  });

  it('modello di allenamento e risposta al blocco', () => {
    expect(displayed(buildTrainingModel(acts, hr, now))).toEqual(displayed(exp.model));
    expect(displayed(athleteResponseCheck(buildFormTrend(acts, hr, now), inputs.meso))).toEqual(displayed(exp.response));
  });

  it('piano della settimana e delle 4 settimane', () => {
    expect(displayed(buildWeekPlan(acts, settings, c.plannedRests, profile, 0, null, null, null, inputs)))
      .toEqual(displayed(exp.weekPlan));
    expect(displayed(buildMonthPlan(acts, settings, c.plannedRests, profile, inputs))).toEqual(displayed(exp.monthPlan));
  });

  // Prima apertura, settimana nel blocco o blocco successivo; si salva solo se cambia.
  it('mesociclo aggiornato all\'apertura dell\'app', () => {
    const stored = mesocycleOf(c.mesocycle);
    if (throws(exp.mesocycle.result)) {
      expect(() => nextMesocycle(stored, acts, settings, now)).toThrow(TypeError);
      expect(exp.mesocycle.stored).toEqual(stored);
      return;
    }
    const { meso, changed } = nextMesocycle(stored, acts, settings, now);
    expect(displayed(meso)).toEqual(displayed(exp.mesocycle.result));
    expect(displayed(changed ? meso : stored)).toEqual(displayed(exp.mesocycle.stored));
  });
});

describe('giorni già svolti e attività simulate dal piano', () => {
  const inputs = planInputs(rides.now, { segments: true });

  it('giorni passati con un\'attività', () => {
    const done = activities().flatMap(a => ['declared', 'empty'].map(s => buildDoneRec(a, settingsOf(s), inputs)));
    expect(displayed(done)).toEqual(displayed(planExpected.records.done));
  });

  const synthetic: { title: string; settings: string; activity: unknown }[] = planExpected.records.synthetic;
  it.each(synthetic)('attività simulata da "$title" ($settings)', r => {
    expect(displayed(synthFromWorkout({ title: r.title }, '2026-11-10', settingsOf(r.settings), inputs)))
      .toEqual(displayed(r.activity));
  });
});

describe('nomi delle attività nel consiglio', () => {
  // Il consiglio è testo semplice: è la pagina che lo rende sicuro quando lo mostra.
  it('un nome con < & " resta com\'è', () => {
    const [yoga, ...steady] = plan.activitySets.yogaToday;
    const named = { ...yoga, name: '<b>Muro</b> & "amici"' };
    const rec = recommend([named, ...steady], settingsOf('empty'), [], 0, null, planInputs('2026-11-18T06:00:00Z'));
    expect(rec.detail).toContain('<b>Muro</b> & "amici" · 45 min');
  });
});
