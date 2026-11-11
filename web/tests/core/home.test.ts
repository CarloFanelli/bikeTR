import { describe, expect, it } from 'vitest';
import type { HrProfile } from '../../src/core/hr.ts';
import { athleteTotals, dataPrecision, lastRide, profileRows, recordRows, weekTiles } from '../../src/core/home.ts';
import { activityLoad } from '../../src/core/load.ts';
import type { buildProfile } from '../../src/core/profile.ts';
import type { Activity, AthleteStats } from '../../src/core/strava-types.ts';
// I giorni dipendono dal fuso orario: i test girano in quello della registrazione.
import './reference.ts';

const noProfile: HrProfile = {
  hrMax: undefined, hrLthr: null, ftp: null, lthrDecl: null, lthrEst: null, lthrSource: null,
  lthrEstFromActivities: null, lthrEstFromSegments: null, ftpDecl: null, ftpEst: null, ftpSource: null,
  ftpEstFromActivities: null, ftpEstFromSegments: null,
};
const ride = (id: number, extra: Partial<Activity> = {}) => ({ id, type: 'Ride', ...extra }) as Activity;

describe('Precisione dati', () => {
  it('FTP dichiarata senza stream: TSS approssimato', () => {
    const p = dataPrecision({ ...noProfile, ftp: 250, ftpDecl: 250 }, [ride(1, { weighted_average_watts: 200 })], 40);
    expect(p.mode).toEqual({ icon: '🔋', label: 'TSS approssimato', detail: '(Weighted Avg summary)' });
    expect(p.ftp).toEqual({ value: '250 W', note: '(dichiarata)' });
  });

  it('con gli stream scaricati il carico viene da lì', () => {
    const acts = [ride(1, { _metrics: { TSS: 80 } }), ride(2, { _metrics: { TSS: 60 } }), ride(3)];
    expect(dataPrecision({ ...noProfile, ftp: 250, ftpDecl: 250 }, acts, 40).mode)
      .toEqual({ icon: '🔋', label: 'TSS da streams', detail: '(2 attività) + TSS approssimato' });
    expect(dataPrecision({ ...noProfile, hrLthr: 170, lthrDecl: 170 }, acts, 40).mode)
      .toEqual({ icon: '❤️', label: 'hrTSS da streams', detail: '(2 attività) + hrTSS approssimato' });
  });

  it('senza FTP: hrTSS da LTHR, altrimenti la stima da FC max', () => {
    expect(dataPrecision({ ...noProfile, hrLthr: 170 }, [], 40).mode)
      .toEqual({ icon: '❤️', label: 'hrTSS approssimato', detail: '' });
    expect(dataPrecision(noProfile, [], 40).mode)
      .toEqual({ icon: '⚠️', label: 'Proxy HR-max', detail: '(meno preciso, imposta LTHR per upgrade)' });
  });

  it('stime con il dettaglio delle fonti', () => {
    const p = dataPrecision({
      ...noProfile, ftp: 240, ftpEst: 240, ftpEstFromActivities: 230, ftpEstFromSegments: 240,
      hrLthr: 168, lthrEst: 168, lthrSource: 'estimated', lthrEstFromActivities: 168,
    }, [], 40);
    expect(p.ftp).toEqual({ value: '240 W', note: '(230W da attività / 240W da segmenti)' });
    expect(p.lthr).toEqual({ value: '168 bpm', note: '(168 da attività)' });
  });

  it('LTHR dichiarata solo se scelta come sorgente', () => {
    const declared = { ...noProfile, lthrDecl: 172, lthrEst: 165, lthrSource: 'declared' };
    expect(dataPrecision(declared, [], 40).lthr).toEqual({ value: '172 bpm', note: '(dichiarata)' });
    expect(dataPrecision({ ...declared, lthrSource: 'estimated' }, [], 40).lthr).toEqual({ value: '165 bpm', note: '' });
  });

  it('conta solo le uscite in bici; gli stream sono al massimo quelli scaricabili', () => {
    const acts = [
      ride(1, { average_watts: 180, has_heartrate: true, _metrics: { NP: 200 } }),
      ride(2, { has_heartrate: true, _metrics: { _error: 'x' } as never }),
      ride(3, { type: 'VirtualRide', weighted_average_watts: 210 }),
      ride(4, { type: 'Run', average_watts: 300, has_heartrate: true }),
    ];
    expect(dataPrecision(noProfile, acts, 40)).toMatchObject({ withPower: '2/3', withHr: '2/3', streams: '1/3' });
    expect(dataPrecision(noProfile, acts, 2).streams).toBe('1/2');
  });

  it('nessuna uscita: zeri e trattini', () => {
    expect(dataPrecision(noProfile, [], 40)).toEqual({
      mode: { icon: '⚠️', label: 'Proxy HR-max', detail: '(meno preciso, imposta LTHR per upgrade)' },
      ftp: { value: '—', note: '' }, lthr: { value: '—', note: '' },
      withPower: '0/0', withHr: '0/0', streams: '0/0',
    });
  });
});

describe('Profilo atleta', () => {
  const profile = {
    allKm: 12345.6, allCount: 410, recentKm: 301.4, recentHours: 22, recentCount: 11,
    level: { key: 'intermediate', label: 'Intermedio', note: '' }, consistency: 0.625, wPerKg: '3.12',
    form: 'buona', weeklyRecent: 5.55,
  } as ReturnType<typeof buildProfile>;

  it('valori del profilo, arrotondati', () => {
    expect(profileRows(profile)).toEqual([
      ['Forma', 'buona'], ['Km all-time', '12.346'], ['Uscite all-time', '410'], ['Km ult. 4 sett.', '301'],
      ['Ore/sett recenti', '5.5h'], ['Uscite ult. 4 sett.', '11'], ['Consistenza 8 sett.', '63%'], ['W/kg (best)', '3.12'],
    ]);
  });

  it('senza peso niente W/kg', () => {
    expect(profileRows({ ...profile, wPerKg: null }).map(([label]) => label)).not.toContain('W/kg (best)');
  });

  it('record: valori arrotondati; senza uscita sopra 30 km o con Suffer Score mancano quelle righe', () => {
    const longest = ride(1, { moving_time: 15000, distance: 120400 });
    const mostClimb = ride(2, { total_elevation_gain: 1834.6 });
    expect(recordRows({ longest, mostClimb, fastest: ride(3, { average_speed: 8.47 }), mostSuffer: null })).toEqual([
      { label: 'Più lunga', activity: longest, value: '4h 10m · 120.4 km' },
      { label: 'Più dislivello', activity: mostClimb, value: '↑1835 m' },
      { label: 'Più veloce (>30km)', activity: expect.objectContaining({ id: 3 }), value: '30.5 km/h' },
    ]);
    expect(recordRows(null)).toEqual([]);
  });
});

describe('Atleta', () => {
  it('totali all-time solo degli sport praticati', () => {
    const stats = {
      all_ride_totals: { count: 410, distance: 12345600 },
      all_run_totals: { count: 0, distance: 0 },
      all_swim_totals: { count: 3, distance: 4500 },
    } as AthleteStats;
    expect(athleteTotals(stats)).toEqual([
      { label: '🚴 Bici (all-time)', distance: '12345.6 km', count: 410 },
      { label: '🏊 Nuoto (all-time)', distance: '4.5 km', count: 3 },
    ]);
    expect(athleteTotals(null)).toEqual([]);
  });
});

describe('ultima uscita in bici', () => {
  const at = (id: number, date: string, extra: Partial<Activity> = {}) =>
    ride(id, { start_date: date, start_date_local: date, distance: 42_000, moving_time: 5400, name: `Giro ${id}`, ...extra });

  it('la più recente per data, anche se la lista non è in ordine', () => {
    const view = lastRide([at(1, '2026-11-01T08:00:00Z'), at(2, '2026-11-09T08:00:00Z'), at(3, '2026-11-05T08:00:00Z')]);
    expect(view.ride).toMatchObject({ id: 2, name: 'Giro 2', distance: '42.0 km', time: '1h 30m' });
  });

  it('corse e nuotate non contano', () => {
    const view = lastRide([at(1, '2026-11-01T08:00:00Z'), at(2, '2026-11-09T08:00:00Z', { type: 'Run' })]);
    expect(view.ride?.id).toBe(1);
  });

  it('un\'uscita senza nome usa il nome di riserva', () => {
    expect(lastRide([at(7, '2026-11-01T08:00:00Z', { name: '' })]).ride?.name).toBe('#7');
  });

  it('nessuna attività: nessuna uscita ancora', () => {
    expect(lastRide([])).toEqual({ ride: null, empty: 'Nessuna uscita ancora' });
  });

  it('solo corse fra quelle caricate: lo dice, senza dire che non sei mai uscito in bici', () => {
    const runs = Array.from({ length: 60 }, (_, i) => at(i, '2026-11-01T08:00:00Z', { type: 'Run' }));
    expect(lastRide(runs)).toEqual({ ride: null, empty: 'Nessuna uscita in bici tra le ultime 60 attività' });
  });
});

describe('la settimana in corso', () => {
  // Mercoledì 11 novembre 2026: questa settimana va da lunedì 9, quella prima da lunedì 2 a mercoledì 4.
  const now = new Date(2026, 10, 11, 18);
  const hr = { ...noProfile, hrMax: 190, hrLthr: 170 };
  const act = (id: number, day: string, km: number, minutes: number) => ride(id, {
    start_date_local: `${day}T09:00:00Z`, distance: km * 1000, moving_time: minutes * 60, average_heartrate: 140,
  });

  it('km, ore e carico da lunedì a oggi, con la differenza dagli stessi giorni della settimana prima', () => {
    const thisWeek = [act(1, '2026-11-09', 40, 90), act(2, '2026-11-11', 20, 60)];
    // Giovedì 5 è dopo il mercoledì della settimana prima: non conta.
    const lastWeek = [act(3, '2026-11-03', 30, 60), act(4, '2026-11-05', 100, 240)];
    const load = (acts: Activity[]) => Math.round(acts.reduce((s, a) => s + activityLoad(a, 190, 170, null), 0));
    const delta = load(thisWeek) - load(lastWeek.slice(0, 1));
    expect(weekTiles([...thisWeek, ...lastWeek], hr, now)).toEqual([
      { label: 'Km', value: '60.0 km', change: '+30.0 km' },
      { label: 'Ore', value: '2h 30m', change: '+1h 30m' },
      { label: 'Carico', value: String(load(thisWeek)), change: `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}` },
    ]);
  });

  it('nessuna attività questa settimana: zero, con la differenza in meno', () => {
    expect(weekTiles([act(3, '2026-11-03', 30, 60)], hr, now).slice(0, 2)).toEqual([
      { label: 'Km', value: '0.0 km', change: '−30.0 km' },
      { label: 'Ore', value: '0m', change: '−1h 0m' },
    ]);
  });

  it('una differenza che arrotondata è zero ha il più, mai "−0.0 km" o "−0m"', () => {
    const tiles = weekTiles([act(1, '2026-11-10', 10.02, 60), act(3, '2026-11-03', 10.05, 60.25)], hr, now);
    expect(tiles.slice(0, 2).map(t => t.change)).toEqual(['+0.0 km', '+0m']);
  });

  it('niente negli stessi giorni della settimana prima: la differenza è tutto il valore, con il più', () => {
    expect(weekTiles([act(1, '2026-11-10', 25, 45)], hr, now)[0]).toEqual({ label: 'Km', value: '25.0 km', change: '+25.0 km' });
  });
});
