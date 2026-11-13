import { describe, expect, it } from 'vitest';
import {
  activityRow, detailMetrics, displayName, firstWeeks, nameMatches, segmentRows, sportGroup, splitRows, weekGroups,
} from '../../src/core/activity-view.ts';
import { fmtDate } from '../../src/core/format.ts';
import type { Activity, ActivityDetail, SegmentEffort, Split } from '../../src/core/strava-types.ts';
// Le settimane dipendono dal fuso orario: i test girano in quello della registrazione.
import './reference.ts';

const base = {
  id: 9, name: 'Giro del lago', type: 'Ride', start_date_local: '2026-11-05T08:00:00Z',
  distance: 42195, moving_time: 5025, elapsed_time: 5400, total_elevation_gain: 512.5,
} as Activity;

describe('ricerca per nome', () => {
  it('trova una parte del nome senza badare a maiuscole e accenti', () => {
    expect(nameMatches('Giro del lago', 1, 'giro')).toBe(true);
    expect(nameMatches('GIRÒ', 1, 'giro')).toBe(true);
    expect(nameMatches('Giro del lago', 1, 'LÀGO')).toBe(true);
    expect(nameMatches('Salita al Ghisallo', 1, 'giro')).toBe(false);
  });

  it('vuota o fatta di spazi tiene tutto', () => {
    expect(nameMatches('Giro del lago', 1, '')).toBe(true);
    expect(nameMatches('Giro del lago', 1, '   ')).toBe(true);
  });

  it('cerca nel nome mostrato: senza nome, il numero', () => {
    expect(nameMatches(undefined, 77, '#77')).toBe(true);
    expect(nameMatches('«Muro» "Salita"', 1, '«muro»')).toBe(true);
  });
});

describe('nomi da Strava', () => {
  it('così come sono scritti; vuoto diventa il numero', () => {
    expect(displayName('<b>Muro</b> & "Salita" 🚀', 1)).toBe('<b>Muro</b> & "Salita" 🚀');
    expect(displayName('', 77)).toBe('#77');
    expect(displayName(undefined, 77)).toBe('#77');
  });
});

describe('lista attività', () => {
  it('una riga con icona dello sport, nome, data, distanza, tempo, dislivello e percorso', () => {
    expect(activityRow({ ...base, map: { summary_polyline: '_p~iF~ps|U_ulLnnqC' } })).toEqual({
      id: 9, icon: 'ride', name: 'Giro del lago', date: fmtDate(base.start_date_local),
      distance: '42.2 km', time: '1h 23m', climb: '↑513 m', route: '_p~iF~ps|U_ulLnnqC',
    });
  });

  it('icona per ogni sport noto, quella generica per gli altri; senza nome il numero', () => {
    expect(['Run', 'Swim', 'Walk', 'Hike', 'Workout', 'GravelRide'].map(type => activityRow({ ...base, type }).icon))
      .toEqual(['run', 'swim', 'walk', 'hike', 'strength', 'ride']);
    expect(activityRow({ ...base, type: 'Yoga', name: '' })).toMatchObject({ icon: 'activity', name: '#9' });
  });

  it('senza distanza, dislivello o percorso: un trattino e nessuna mappa', () => {
    expect(activityRow({ ...base, type: 'Workout', distance: 0, total_elevation_gain: 0, map: { summary_polyline: '' } }))
      .toMatchObject({ distance: '—', time: '1h 23m', climb: '—', route: null });
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

describe('filtro per sport', () => {
  it('ogni variante di bici è Bici, ogni corsa è Corsa, il resto Altro', () => {
    expect(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'].map(sportGroup)).toEqual(Array(5).fill('bike'));
    expect(['Run', 'TrailRun', 'VirtualRun'].map(sportGroup)).toEqual(['run', 'run', 'run']);
    expect(['Walk', 'Swim', 'Workout', 'Yoga', ''].map(sportGroup)).toEqual(Array(5).fill('other'));
  });
});

describe('settimane della lista', () => {
  const at = (id: number, day: string, km: number, climb = 0) =>
    ({ ...base, id, start_date_local: `${day}T09:00:00Z`, distance: km * 1000, moving_time: 3600, total_elevation_gain: climb }) as Activity;
  // Mercoledì 11 novembre 2026.
  const now = new Date(2026, 10, 11, 18);

  it('da lunedì a domenica, dalla più recente, con i totali delle attività della settimana', () => {
    const groups = weekGroups([at(3, '2026-11-10', 30, 200), at(2, '2026-11-09', 20), at(1, '2026-11-08', 50, 900)], now);
    expect(groups.map(g => g.activities.map(a => a.id))).toEqual([[3, 2], [1]]);
    expect(groups[1]).toMatchObject({ label: '2 nov – 8 nov', distance: '50.0 km', time: '1h 0m', climb: '↑900 m' });
  });

  it('la settimana in corso arriva fino a oggi', () => {
    const [week] = weekGroups([at(3, '2026-11-10', 30, 200), at(2, '2026-11-09', 20)], now);
    expect(week).toMatchObject({ label: '9 nov – 11 nov', distance: '50.0 km', time: '2h 0m', climb: '↑200 m' });
  });

  it('di lunedì la settimana in corso mostra una data sola', () => {
    const [week] = weekGroups([at(2, '2026-11-09', 20)], new Date(2026, 10, 9, 18));
    expect(week.label).toBe('9 nov');
  });

  it('senza dislivello un trattino; nessuna attività, nessuna settimana', () => {
    expect(weekGroups([at(2, '2026-11-09', 20)], now)[0].climb).toBe('—');
    expect(weekGroups([], now)).toEqual([]);
  });

  it('il giorno di un\'attività è quello locale, come nel resto dell\'app', () => {
    // Domenica sera o lunedì: decide il giorno che il resto dell'app le assegna.
    const late = { ...at(1, '2026-11-08', 10), start_date_local: '2026-11-08T23:59:00Z' } as Activity;
    const [week] = weekGroups([late], now);
    const day = new Date(late.start_date_local);
    expect(week.label.startsWith(day.getDay() === 1 ? '9 nov' : '2 nov')).toBe(true);
  });
});

describe('Attività a pagine', () => {
  const week = (n: number) => ({ activities: Array(n).fill(0) });

  it('settimane intere fino ad almeno 60 attività, poi tutte', () => {
    const weeks = [week(25), week(25), week(25), week(25)];
    expect(firstWeeks(weeks, 60)).toHaveLength(3);
    expect(firstWeeks(weeks, 120)).toHaveLength(4);
  });

  it('meno di 60 attività: tutte', () => {
    expect(firstWeeks([week(3), week(2)], 60)).toHaveLength(2);
    expect(firstWeeks([], 60)).toEqual([]);
  });
});
