import { describe, expect, it } from 'vitest';
import { dayOffsetIso } from '../../src/core/dates.ts';
import type { HrProfile } from '../../src/core/hr.ts';
import { getWeekRoleInBlock, type Mesocycle } from '../../src/core/meso.ts';
import type { PlanInputs } from '../../src/core/plan/inputs.ts';
import type { LoadChartDay } from '../../src/core/plan/load-chart.ts';
import type { WeekPlan } from '../../src/core/plan/month.ts';
import {
  adviceRows, dailyAdvice, loadChartView, loadSourceLine, mesoBanner, modelRows, planRows, restCalendar, weekBlock,
} from '../../src/core/training-view.ts';

// Mercoledì 4 novembre 2026, ore 10.
const NOW = new Date(2026, 10, 4, 10);
const inputs: PlanInputs = { now: NOW, segmentEstimates: null, ftpHistory: [], meso: null, rainyDays: [] };

describe('consiglio del giorno', () => {
  it('oggi normale: solo il consiglio di oggi', () => {
    const advice = dailyAdvice([], {}, [], null, inputs);
    expect(advice.today.label).toBeNull();
    expect(advice.today.rec.title).toBeTruthy();
    expect(advice.next).toBeNull();
  });

  it('oggi saltato: compare l\'anteprima del prossimo allenamento', () => {
    const advice = dailyAdvice([], {}, [dayOffsetIso(0, NOW), dayOffsetIso(1, NOW)], null, inputs);
    expect(advice.next?.label).toBe('venerdì 6 nov');
    expect(advice.next?.metrics.restDays).toBeGreaterThanOrEqual(0);
  });

  it('i numeri sotto il consiglio, con gli arrotondamenti di oggi', () => {
    const metrics = { acute: 312.6, chronic: 250.4, ratio: 1.2484, hoursThisWeek: 7.25, hardsLast7: 2, restDays: 1 };
    const fatigue = { readiness: 'moderato', composite: 48, muscularFatigue: 35 };
    const meso = { blockId: 'threshold', weekInBlock: 1 } as Mesocycle;
    expect(adviceRows(metrics, fatigue, meso)).toEqual([
      ['Prontezza', '48/100'], ['Freschezza', '🟡 media'], ['Gg riposo', '1'], ['Carico 7gg', '313'], ['Media sett.', '250'],
      ['Rapporto', '1.25'], ['Ore 7gg', '7.3h'], ['Dure 7gg', '2'], ['Fatica musc.', '35/100'], ['Blocco', expect.stringMatching(/ 2\/4$/)],
    ]);
    const quiet = adviceRows({ ...metrics, ratio: null, restDays: 3 }, { ...fatigue, muscularFatigue: 20 }, null);
    expect(quiet.map(([label]) => label)).not.toContain('Fatica musc.');
    expect(quiet).toContainEqual(['Rapporto', '—']);
    expect(quiet).toContainEqual(['Freschezza', '🟢 alta']);
  });
});

describe('calendario dei prossimi 28 giorni', () => {
  const weeks = restCalendar([dayOffsetIso(1, NOW)], [dayOffsetIso(2, NOW)], NOW);

  it('quattro settimane da lunedì, con oggi, domani e i giorni passati', () => {
    expect(weeks.map((w) => w.label)).toEqual(['Settimana corrente', 'Settimana +1', 'Settimana +2', 'Settimana +3']);
    expect(weeks.every((w) => w.days.length === 7)).toBe(true);
    const [mon, tue, wed, thu, fri] = weeks[0].days;
    expect(mon).toMatchObject({ iso: '2026-11-02', past: true, today: false, state: 'normal', icon: '🚴' });
    expect(tue.past).toBe(true);
    expect(wed).toMatchObject({ iso: '2026-11-04', label: 'Oggi', today: true, past: false });
    expect(thu).toMatchObject({ label: 'Domani', state: 'skip', icon: '⏸️' });
    expect(fri).toMatchObject({ state: 'rain', icon: '🌧️' });
    expect(weeks[3].days[6].iso).toBe('2026-11-29');
  });
});

describe('grafico del carico', () => {
  const day = (iso: string, extra: Partial<LoadChartDay>): LoadChartDay =>
    ({ iso, load: 0, hard: false, long: false, hasActivity: false, nonBike: false, bike: false, ...extra });

  it('colori e testi di oggi, e la media giornaliera', () => {
    const view = loadChartView([
      day('2026-11-01', { load: 120.4, long: true, bike: true, hasActivity: true }),
      day('2026-11-02', { load: 80, hard: true, bike: true, hasActivity: true }),
      day('2026-11-03', { load: 40, bike: true, hasActivity: true }),
      day('2026-11-04', { load: 30, nonBike: true, hasActivity: true }),
      day('2026-11-05', {}),
    ]);
    expect(view.labels).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(view.colors).toEqual(['#fc5200', '#ff6b6b', '#4ade80', '#8b5cf6', '#2a2e38']);
    expect(view.tags).toEqual(['lunga', 'bici dura', 'bici easy', 'cross-training', 'riposo']);
    expect(view.loads).toEqual([120.4, 80, 40, 30, 0]);
    expect(view.average).toBeCloseTo(54.08);
  });
});

describe('piano del mese', () => {
  const profile = { ftp: 250, ftpDecl: 250, hrLthr: 170, lthrSource: 'estimated', lthrEst: 170 } as HrProfile;

  it('da dove viene il carico, come la riga di oggi', () => {
    expect(loadSourceLine(profile)).toBe('🔋 Load = TSS (potenza) · FTP dichiarata 250W · LTHR stimata 170 bpm');
    expect(loadSourceLine({ ...profile, ftp: null, ftpDecl: null, ftpSource: 'estimated', ftpEst: null, lthrSource: 'declared' }))
      .toBe('❤️ Load = hrTSS (LTHR) · FTP non usata · LTHR dichiarata 170 bpm');
  });

  it('il modello di allenamento con i testi di oggi', () => {
    const model = {
      preferredDays: [2, 6], hardDowHistorical: [2, 4, 6, 0], avgWeeklyLoad: 402.6, progressionPerWeek: 12.4,
      polarization: { easyPct: 0.78, hardPct: 0.22 }, targetWeeklyLoad: 431.2,
    };
    expect(modelRows(model as never)).toEqual([
      ['Giorni di allenamento abituali', 'Mar, Sab'], ['Giorni di qualità storici', 'Mar, Gio, Sab'],
      ['Carico medio settimanale', '403'], ['Progressione', '📈 +12/sett (crescita)'],
      ['Polarizzazione attuale', '✅ 78% easy / 22% hard'], ['Target carico prox sett.', '431'],
    ]);
    expect(modelRows({ ...model, preferredDays: [], hardDowHistorical: [], progressionPerWeek: -2, polarization: null } as never)
      .map(([, v]) => v)).toEqual(['nessun pattern regolare rilevato', '—', '403', '➡️ stabile', '—', '431']);
  });

  it('il banner del mesociclo, o del taper prima della gara', () => {
    const meso = { blockId: 'threshold', weekInBlock: 0 } as Mesocycle;
    const banner = mesoBanner(meso, getWeekRoleInBlock(meso, 0));
    expect(banner).toMatchObject({ icon: '📋', role: { role: 'build1' } });
    expect(banner?.title).toMatch(/^Mesociclo: .+ · settimana 1\/4$/);
    expect(banner?.lines[1]).toMatch(/^Prossima settimana: .+ \(loadMul 1\.08×\)\.$/);
    const taper = { role: 'taper1', label: 'Taper 1', blockPattern: 'taper', daysToRace: 17, loadMul: 0.8 };
    expect(mesoBanner(meso, taper as never)).toEqual({
      icon: '🏁', title: 'Fase Taper — 17 giorni alla gara', role: { role: 'taper1', label: 'Taper 1' },
      lines: ['Volume scalato (×0.80), intensità mantenuta. Niente nuovi stimoli, mantieni le sensazioni.'],
    });
    expect(mesoBanner(null, null)).toBeNull();
  });

  it('una settimana: titolo con le date, ruolo, diagnostica e righe del piano', () => {
    const wp = {
      days: Array.from({ length: 7 }, (_, i) => ({
        iso: `2026-11-0${i + 2}`, label: i === 0 ? 'lunedì 2 nov' : 'x', isPast: i < 2,
        rec: i === 0
          ? { title: '✅ <b>Muro</b> fatto', detail: '42 km', reason: null, _isDone: true, _activityId: 77 }
          : { title: '🔴 Soglia (Threshold)', detail: 'Risc 15\'', reason: null },
      })),
      isRecoveryWeek: false,
      weekRole: { role: 'build2', label: 'Build 2', blockPattern: 'wave', weekInBlock: 1, totalWeeks: 4, loadMul: 1.08 },
      debug: {
        targetHards: 2, baseHards: 2, lvl: 'intermediate', tsb: '-5', ratio: '1.10', polHardPct: '20%', reductionReason: null,
        dynReconciliation: null, categoryCount: { HARD: 2, EASY: 3, REST: 0, DONE: 2 },
      },
    } as unknown as WeekPlan;
    const block = weekBlock(wp, 0, 'Granfondo <X>');
    expect(block.title).toBe('Settimana 1 (2 nov → 8 nov)');
    expect(block.banner).toEqual({ role: 'build2', emoji: '🟡', label: 'Build 2', detail: '· sett. 2/4 del blocco · volume ×1.08' });
    expect(block.diag).toEqual([
      '🎯 HARD target: 2/2 · livello: intermediate · TSB: -5 · ratio: 1.10 · pol hard: 20%',
      'Composizione: HARD:2 · EASY:3 · DONE:2',
    ]);
    expect(planRows(wp.days)[0]).toEqual({
      label: 'lunedì 2 nov', icon: '✅', title: '<b>Muro</b> fatto', detail: '42 km', past: true, activityId: 77,
    });
    expect(planRows(wp.days)[3]).toMatchObject({ icon: '🔴', title: 'Soglia (Threshold)', past: false, activityId: null });

    const taper = { ...wp, weekRole: { role: 'taper2', label: 'Taper 2', blockPattern: 'taper', daysToRace: 10, loadMul: 0.6 } };
    expect(weekBlock(taper as never, 1, 'Granfondo <X>').banner?.detail).toBe('· 10 giorni alla gara (Granfondo <X>) · volume ×0.60');
    const retro = { ...wp, weekRole: null, isRecoveryWeek: true };
    expect(weekBlock(retro as never, 2, undefined).banner).toEqual({ role: null, emoji: '🔄', label: '', detail: 'Settimana di scarico (retroattivo)' });
  });
});
