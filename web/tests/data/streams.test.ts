import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../src/core/strava-types.ts';
import { AuthError } from '../../src/data/auth.ts';
import { loadStreamsCache } from '../../src/data/storage.ts';
import { hydrateWithStreams } from '../../src/data/streams.ts';
import { fetchActivityStreams } from '../../src/data/strava.ts';

vi.mock('../../src/data/strava.ts', () => ({ fetchActivityStreams: vi.fn() }));

// Un'ora a 250 W costanti: con FTP 250 fa NP 250, IF 1, TSS 100.
const hour = { watts: { data: Array(3600).fill(250) } };
const ride = (id: number, type = 'Ride') => ({ id, type }) as Activity;

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.mocked(fetchActivityStreams).mockReset().mockResolvedValue(hour);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Aggiorna con streams', () => {
  it('scarica solo le uscite in bici non ancora scaricate o fallite, fino al massimo', async () => {
    store.set('biketr_streams_cache', '{"1":{"TSS":50,"_fetched":1},"2":{"_error":"x","_fetched":1}}');
    const acts = [ride(1), ride(2), ride(3, 'Run'), ride(4, 'VirtualRide'), ride(5)];
    const progress: [number, number][] = [];
    const result = await hydrateWithStreams(acts, 250, null, 3, (d, t) => progress.push([d, t]));
    expect(vi.mocked(fetchActivityStreams).mock.calls.map(([id]) => id)).toEqual([2, 4]);
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toEqual({ fetched: 2, totalCached: 3 });
    expect(acts.map((a) => a._metrics?.TSS)).toEqual([50, 100, undefined, 100, undefined]);
  });

  it('un errore di Strava su un\'uscita la segna e passa alla successiva', async () => {
    vi.mocked(fetchActivityStreams).mockRejectedValueOnce(new Error('streams 1: 429'));
    const acts = [ride(1), ride(2)];
    await hydrateWithStreams(acts, 250, null, 40);
    expect(loadStreamsCache()[1]).toMatchObject({ _error: 'streams 1: 429' });
    expect([acts[0]._metrics, acts[1]._metrics?.TSS]).toEqual([undefined, 100]);
  });

  it('senza accesso a Strava si ferma, tiene quanto scaricato e lancia l\'errore', async () => {
    vi.mocked(fetchActivityStreams)
      .mockResolvedValueOnce(hour)
      .mockRejectedValueOnce(new AuthError('not_connected'));
    await expect(hydrateWithStreams([ride(1), ride(2), ride(3)], 250, null, 40)).rejects.toMatchObject({ code: 'not_connected' });
    expect(Object.keys(loadStreamsCache())).toEqual(['1']);
    expect(fetchActivityStreams).toHaveBeenCalledTimes(2);
  });
});
