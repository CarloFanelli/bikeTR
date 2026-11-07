import { describe, expect, it } from 'vitest';
import type { HrProfile } from '../../src/core/hr.ts';
import { athleteTotals, dataPrecision, profileRows, recordRows } from '../../src/core/home.ts';
import type { buildProfile } from '../../src/core/profile.ts';
import type { Activity, AthleteStats } from '../../src/core/strava-types.ts';

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

  it('nessuna uscita: zeri e trattini, come oggi', () => {
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

  it('stessi valori e arrotondamenti di oggi', () => {
    expect(profileRows(profile)).toEqual([
      ['Forma', 'buona'], ['Km all-time', '12.346'], ['Uscite all-time', '410'], ['Km ult. 4 sett.', '301'],
      ['Ore/sett recenti', '5.5h'], ['Uscite ult. 4 sett.', '11'], ['Consistenza 8 sett.', '63%'], ['W/kg (best)', '3.12'],
    ]);
  });

  it('senza peso niente W/kg', () => {
    expect(profileRows({ ...profile, wPerKg: null }).map(([label]) => label)).not.toContain('W/kg (best)');
  });

  it('record: valori di oggi; senza uscita sopra 30 km o con Suffer Score mancano quelle righe', () => {
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
