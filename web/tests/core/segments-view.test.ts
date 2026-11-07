import { describe, expect, it } from 'vitest';
import type { SegmentEntry, SegmentWorkout } from '../../src/core/segments.ts';
import { diagLine, errorLines, formLine, predictionCards, sparkline, workoutCards } from '../../src/core/segments-view.ts';
import type { Segment, SegmentEffort } from '../../src/core/strava-types.ts';

const seg = (id: number, name: string, extra: Partial<Segment> = {}) =>
  ({ id, name, distance: 2346, average_grade: 6.04, total_elevation_gain: 141.6, ...extra }) as Segment;
const effort = (day: number, time: number) =>
  ({ id: day, elapsed_time: time, moving_time: time, start_date: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`, distance: 2345 }) as SegmentEffort;

describe('previsioni sui segmenti', () => {
  // Più veloce di 1 s al giorno: −7 s a settimana.
  const faster: SegmentEntry = {
    segment: seg(1, '<b>Muro</b> & "co" 🚴'), efforts: [effort(1, 601), effort(2, 600), effort(3, 599), effort(4, 598)],
  };
  const steady: SegmentEntry = {
    segment: seg(2, 'Piano', { average_grade: null as never }), efforts: [effort(1, 300), effort(8, 300), effort(15, 300)],
  };
  // Più lento di 2 s a settimana.
  const slower: SegmentEntry = { segment: seg(3, 'Strappo'), efforts: [effort(1, 300), effort(8, 302)] };

  it('una card per segmento, dal più provato, col nome com\'è scritto', () => {
    const cards = predictionCards([slower, steady, faster], null);
    expect(cards.map(c => c.name)).toEqual(['<b>Muro</b> & "co" 🚴', 'Piano', 'Strappo']);
    expect(cards[0]).toMatchObject({
      id: 1, meta: '2.35 km · 142m · 6.0%', pr: '9m', last: '9m', attempts: 4,
      trend: { kind: 'good', text: '−7.0 s/sett' }, predicted: '9m', vsBest: 'possibile nuovo PR 🔥', formAdj: null, best: 598,
    });
    expect(cards[1]).toMatchObject({ meta: '2.35 km · 142m · —', trend: { kind: 'neutral', text: '→ stabile' } });
    expect(cards[2]).toMatchObject({ trend: { kind: 'bad', text: '+2.0 s/sett' }, vsBest: '+6s da PR' });
  });

  it('la forma di oggi sposta la previsione: lo dice in secondi', () => {
    const [fresh] = predictionCards([steady], { ctl: 60, tsb: 15 });
    const [tired] = predictionCards([steady], { ctl: 60, tsb: -25 });
    expect(fresh.formAdj).toMatchObject({ good: true });
    expect(tired.formAdj).toMatchObject({ good: false });
    expect(tired.formAdj?.text).toMatch(/^forma: \+\d+s$/);
    expect(formLine({ ctl: 59.6, tsb: 4.4 })).toBe('Previsioni adattate al tuo stato attuale — CTL 60, TSB +4.');
    expect(formLine({ ctl: 59.6, tsb: -4.6 })).toBe('Previsioni adattate al tuo stato attuale — CTL 60, TSB -5.');
  });

  it('riepilogo e righe di errore, con i nomi come sono', () => {
    const diag = {
      totalStarred: 3, withEfforts: 1, noEfforts: 1, fromCache: 1, fetched: 1,
      errors: [{ name: '<b>Muro</b>', msg: 'API x: 500' }],
    };
    expect(diagLine(diag)).toBe('📊 3 segmenti preferiti · 1 con tentativi · 1 senza tentativi · 1 errori · 1 da cache / 1 scaricati ora');
    expect(errorLines(diag)).toBe('<b>Muro</b>: API x: 500');
    expect(errorLines({ ...diag, errors: Array.from({ length: 25 }, (_, i) => ({ name: `s${i}`, msg: 'e' })) }).split('\n')).toHaveLength(20);
  });
});

describe('workout mirati', () => {
  it('titolo con PR e obiettivo, numeri arrotondati; i watt solo se ci sono', () => {
    const workout = {
      title: 't', detail: 'd', reason: 'r',
      segmentStats: { name: 'x', prTime: 600, targetTime: 590, bestWatts: 280, targetWatts: null, distance: 2346, grade: 6.04, attempts: 4, recentTrend: -2 },
    } as SegmentWorkout;
    expect(workoutCards([{ segment: seg(1, '<i>Salita</i>'), workout }])).toEqual([{
      id: 1, name: '<i>Salita</i>', target: 'PR 10m → target 9m', detail: 'd', reason: 'r',
      rows: [['Distanza', '2.35 km'], ['Pendenza', '6.0%'], ['Tentativi', '4'], ['Trend', '📈 in miglioramento'], ['Best W', '280W']],
    }]);
  });
});

describe('sparkline dei tempi', () => {
  it('punti nel riquadro e la riga del PR; nessun punto, niente linea', () => {
    expect(sparkline([{ x: 0, y: 610 }, { x: 10, y: 600 }], 600)).toEqual({
      path: 'M4.0 4.0 L116.0 36.0', dots: [{ x: 4, y: 4 }, { x: 116, y: 36 }], bestY: 36,
    });
    expect(sparkline([], 600)).toBeNull();
  });
});
