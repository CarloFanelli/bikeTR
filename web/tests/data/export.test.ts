import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, ActivityDetail } from '../../src/core/strava-types.ts';
import { AuthError } from '../../src/data/auth.ts';
import {
  buildExport, estimate, exportRange, fetchAllActivities, filterForExport, formatBytes,
} from '../../src/data/export.ts';
import { loadStreamsCache } from '../../src/data/storage.ts';
import { fetchActivities, fetchActivity, fetchActivityStreams } from '../../src/data/strava.ts';

vi.mock('../../src/data/strava.ts', () => ({
  fetchActivities: vi.fn(), fetchActivity: vi.fn(), fetchActivityStreams: vi.fn(),
}));

const ride = (id: number, extra: Partial<Activity> = {}) => ({
  id, name: `Giro ${id}`, type: 'Ride', start_date_local: '2026-11-01T08:00:00Z', distance: 40123,
  moving_time: 4000, average_speed: 10.03, ...extra,
}) as Activity;

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  vi.mocked(fetchActivity).mockReset().mockImplementation(async (id) => ({ id, description: 'd' + id }) as ActivityDetail);
  vi.mocked(fetchActivityStreams).mockReset().mockResolvedValue({ watts: { data: Array(3600).fill(250) } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('storico per l\'export', () => {
  it('legge pagine da 200 fino a una pagina incompleta', async () => {
    vi.mocked(fetchActivities).mockReset()
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => ride(i)))
      .mockResolvedValueOnce([ride(500), ride(501)]);
    const progress: [number, number][] = [];
    expect(await fetchAllActivities((n, page) => progress.push([n, page]))).toHaveLength(202);
    expect(vi.mocked(fetchActivities).mock.calls).toEqual([[200, 1], [200, 2]]);
    expect(progress).toEqual([[200, 1], [202, 2]]);
  });

  it('il periodo comprende tutto l\'ultimo giorno; "Solo bici" toglie gli altri sport', () => {
    const all = [
      ride(1, { start_date_local: '2026-10-31T23:00:00' }),
      ride(2, { start_date_local: '2026-11-01T07:00:00' }),
      ride(3, { start_date_local: '2026-11-03T21:00:00', type: 'Run' }),
      ride(4, { start_date_local: '2026-11-04T07:00:00', type: 'GravelRide' }),
    ];
    const ids = (acts: Activity[]) => acts.map((a) => a.id);
    expect(ids(filterForExport(all, { from: '2026-11-01', to: '2026-11-03', onlyRides: false }))).toEqual([2, 3]);
    expect(ids(filterForExport(all, { from: '', to: '', onlyRides: true }))).toEqual([1, 2, 4]);
    expect(exportRange(all)).toEqual({ first: '2026-10-31', last: '2026-11-04' });
    expect(exportRange([])).toEqual({ first: '—', last: '—' });
  });

  it('stima di chiamate e minuti, e dimensione del file', () => {
    expect([estimate('compact', 90), estimate('detailed', 90), estimate('max', 90)])
      .toEqual([{ calls: 0, minutes: 0 }, { calls: 90, minutes: 15 }, { calls: 180, minutes: 30 }]);
    expect([formatBytes(900), formatBytes(2048), formatBytes(5 * 1024 * 1024)]).toEqual(['900 B', '2.0 KB', '5.0 MB']);
  });
});

describe('contenuto dell\'export', () => {
  it('Compatto: nessuna richiesta, metriche già scaricate e nome del file con la data', async () => {
    store.set('biketr_streams_cache', '{"1":{"NP":210,"TSS":80,"_fetched":1}}');
    const progress: string[] = [];
    const { payload, fname } = await buildExport({
      mode: 'compact', activities: [ride(1), ride(2)], athlete: null, stats: null, settings: { hrMax: 190 },
    }, (text) => progress.push(text));
    expect(fetchActivity).not.toHaveBeenCalled();
    expect(progress).toEqual([]);
    expect(fname).toBe('biketr-export-compact-2026-11-07.json');
    expect(payload.biketr_export).toEqual({
      version: 'compact', generated_at: '2026-11-07T10:00:00.000Z', generator: 'BikeTR v2 export',
      schema: 'biketr-export-v1', activity_count: 2,
    });
    expect(payload.settings_biketr).toEqual({ hrMax: 190 });
    expect(payload.activities[0]).toMatchObject({
      id: 1, name: 'Giro 1', distance_km: 40.123, average_speed_kmh: 36.11,
      computed_metrics: { np_watts: 210, intensity_factor: null, tss: 80, hr_tss: null, hr_zones_seconds: null, source: 'streams_cache' },
    });
    expect(payload.activities[1].computed_metrics).toBeNull();
  });

  it('Dettagliato: una richiesta ogni 10 secondi, con l\'avanzamento', async () => {
    const progress: [string, number][] = [];
    const done = buildExport({
      mode: 'detailed', activities: [ride(1), ride(2)], athlete: null, stats: null, settings: {},
    }, (text, pct) => progress.push([text, pct]));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchActivity).toHaveBeenCalledTimes(1);
    expect(fetchActivity).toHaveBeenCalledWith(1, { allEfforts: true });
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchActivity).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const { payload } = await done;
    expect(fetchActivity).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([
      ['Scarico dettagli (2)…', 0],
      ['Dettagli 1/2 (throttle 10s/req)…', 25],
      ['Dettagli 2/2 (throttle 10s/req)…', 50],
    ]);
    expect(payload.activities[1].detail).toMatchObject({ description: 'd2', segment_efforts: [] });
  });

  it('limite di richieste di Strava: aspetta un minuto, segna l\'errore e va avanti', async () => {
    vi.mocked(fetchActivity).mockRejectedValueOnce(new Error('API /activities/1: 429'));
    const progress: string[] = [];
    const done = buildExport({
      mode: 'detailed', activities: [ride(1), ride(2)], athlete: null, stats: null, settings: {},
    }, (text) => progress.push(text));
    await vi.advanceTimersByTimeAsync(60000);
    expect(progress).toContain('Dettagli 1/2 · rate-limit hit, attendo 60s…');
    const { payload } = await done;
    expect([payload.activities[0].detail, payload.activities[1].detail?.description]).toEqual([undefined, 'd2']);
  });

  it('Massimo: stream completi nel file e metriche salvate per la prossima volta', async () => {
    const done = buildExport({
      mode: 'max', activities: [ride(1)], athlete: null, stats: null, settings: { ftpDeclared: 250 },
    }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    const { payload } = await done;
    expect(fetchActivityStreams).toHaveBeenCalledWith(1, 'time,heartrate,watts,cadence,velocity_smooth,altitude,distance,temp,grade_smooth');
    expect(payload.activities[0].streams).toEqual({ watts: Array(3600).fill(250) });
    expect(payload.activities[0].computed_metrics).toMatchObject({ np_watts: 250, tss: 100 });
    expect(loadStreamsCache()[1]).toMatchObject({ NP: 250, TSS: 100 });
  });

  it('senza accesso a Strava l\'export si ferma con l\'errore', async () => {
    vi.mocked(fetchActivity).mockRejectedValueOnce(new AuthError('not_connected'));
    await expect(buildExport({
      mode: 'detailed', activities: [ride(1), ride(2)], athlete: null, stats: null, settings: {},
    }, () => {})).rejects.toMatchObject({ code: 'not_connected' });
    expect(fetchActivity).toHaveBeenCalledTimes(1);
  });
});
