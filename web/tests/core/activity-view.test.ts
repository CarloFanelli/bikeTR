import { describe, expect, it } from 'vitest';
import {
  activityRow, detailMetrics, displayName, segmentRows, splitRows,
} from '../../src/core/activity-view.ts';
import { fmtDate } from '../../src/core/format.ts';
import type { Activity, ActivityDetail, SegmentEffort, Split } from '../../src/core/strava-types.ts';

const base = {
  id: 9, name: 'Giro del lago', type: 'Ride', start_date_local: '2026-11-05T08:00:00Z',
  distance: 42195, moving_time: 5025, elapsed_time: 5400, total_elevation_gain: 512.5,
} as Activity;

describe('nomi da Strava', () => {
  it('così come sono scritti; vuoto diventa il numero', () => {
    expect(displayName('<b>Muro</b> & "Salita" 🚀', 1)).toBe('<b>Muro</b> & "Salita" 🚀');
    expect(displayName('', 77)).toBe('#77');
    expect(displayName(undefined, 77)).toBe('#77');
  });
});

describe('lista attività', () => {
  it('una riga con icona, data, tipo, FC e numeri', () => {
    expect(activityRow({ ...base, average_heartrate: 141.6 })).toEqual({
      title: '🚴 Giro del lago', meta: `${fmtDate(base.start_date_local)} · Ride · FC 142`,
      distance: '42.2 km', sub: '1h 23m · ↑513m',
    });
    expect(activityRow({ ...base, type: 'Kitesurf', name: '' }).title).toBe('• #9');
    expect(activityRow(base).meta).toBe(`${fmtDate(base.start_date_local)} · Ride`);
  });
});

describe('dettaglio attività', () => {
  it('metriche di base, e FC, potenza, energia e Suffer Score solo se ci sono', () => {
    const a = { ...base, average_speed: 8.397, max_speed: 15.2 } as ActivityDetail;
    expect(detailMetrics(a)).toEqual([
      ['Distanza', '42.2 km'], ['Tempo mov.', '1h 23m'], ['Tempo tot.', '1h 30m'], ['Dislivello', '↑513 m'],
      ['Vel. media', '30.2 km/h'], ['Vel. max', '54.7 km/h'],
    ]);
    const full = {
      ...a, has_heartrate: true, average_heartrate: 140.4, max_heartrate: 178, average_watts: 187.5,
      kilojoules: 941.2, suffer_score: 87,
    } as ActivityDetail;
    expect(detailMetrics(full).slice(6)).toEqual([
      ['FC media', '140 bpm'], ['FC max', '178 bpm'], ['Potenza media', '188 W'], ['Energia', '941 kJ'], ['Suffer Score', '87'],
    ]);
  });

  it('split per km: la barra più lunga è il km più lento', () => {
    const splits = [
      { moving_time: 120, average_speed: 8.33, average_heartrate: 150.2 },
      { moving_time: 240 },
    ] as Split[];
    expect(splitRows(splits)).toEqual([
      { km: 'km 1', pct: 50, value: '2:00 · 30.0 km/h · 150 bpm' },
      { km: 'km 2', pct: 100, value: '4:00 · — km/h' },
    ]);
  });

  it('segmenti dal più lungo, con KOM e PR, nomi come sono scritti', () => {
    const efforts = [
      { id: 1, name: 'Breve', distance: 800, moving_time: 95, elapsed_time: 100 },
      { id: 2, name: '<b>Muro</b>', distance: 2150, moving_time: 0, elapsed_time: 610, kom_rank: 3, pr_rank: 1,
        average_heartrate: 171.5, average_watts: 289.4 },
      { id: 3, name: '', distance: 500, moving_time: 60, elapsed_time: 60, segment: { id: 444 } },
    ] as SegmentEffort[];
    expect(segmentRows(efforts)).toEqual([
      { id: 2, name: '<b>Muro</b>', kom: 3, pr: 1, meta: '2.15 km · 172 bpm · 289 W', time: '10:10' },
      { id: 1, name: 'Breve', kom: null, pr: null, meta: '0.80 km', time: '1:35' },
      { id: 3, name: '#444', kom: null, pr: null, meta: '0.50 km', time: '1:00' },
    ]);
  });
});
