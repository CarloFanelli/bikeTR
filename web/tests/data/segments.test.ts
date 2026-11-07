import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, Segment, SegmentEffort } from '../../src/core/strava-types.ts';
import { AuthError } from '../../src/data/auth.ts';
import { completeFromActivities, loadSegmentPredictions } from '../../src/data/segments.ts';
import { loadSegmentCache } from '../../src/data/storage.ts';
import { fetchActivity, fetchSegmentEfforts, fetchStarredSegments, StravaError } from '../../src/data/strava.ts';

vi.mock('../../src/data/strava.ts', async (original) => ({
  ...(await original<typeof import('../../src/data/strava.ts')>()),
  fetchActivity: vi.fn(), fetchSegmentEfforts: vi.fn(), fetchStarredSegments: vi.fn(),
}));

const NOW = new Date(2026, 10, 7, 10).getTime();
const HOUR = 3600000;
const seg = (id: number, name = `Salita ${id}`) =>
  ({ id, name, distance: 2000, average_grade: 6, elevation_high: 300, elevation_low: 180, total_elevation_gain: 125 }) as Segment;
const effort = (id: number, segment?: Segment) =>
  ({ id, elapsed_time: 400 + id, moving_time: 400, start_date: '2026-10-01T08:00:00Z', distance: 2000, segment }) as SegmentEffort;
const ride = (id: number, type = 'Ride') => ({ id, type }) as Activity;

let store: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.mocked(fetchStarredSegments).mockReset();
  vi.mocked(fetchSegmentEfforts).mockReset();
  vi.mocked(fetchActivity).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('previsioni sui segmenti preferiti', () => {
  it('usa i tentativi salvati ancora freschi e scarica gli altri', async () => {
    store.set('biketr_segments_cache_v2', JSON.stringify({
      1: { efforts: [effort(1)], _fetched: NOW - 23 * HOUR },
      2: { efforts: [], _fetched: NOW - 3 * HOUR },
      3: { efforts: [], _fetched: NOW - 1 * HOUR },
    }));
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1), seg(2), seg(3), seg(4)]);
    vi.mocked(fetchSegmentEfforts).mockImplementation(async (id) => (id === 2 ? [effort(20), effort(21)] : []));
    const progress: string[] = [];
    const run = loadSegmentPredictions((d, t, e) => progress.push(`${d}/${t}/${e}`));
    await vi.runAllTimersAsync();
    const { list, diag } = await run;
    expect(vi.mocked(fetchSegmentEfforts).mock.calls.map(([id]) => id)).toEqual([2, 4]);
    expect(list.map((e) => [e.segment.id, e.efforts.length])).toEqual([[1, 1], [2, 2]]);
    expect(diag).toEqual({ totalStarred: 4, withEfforts: 2, noEfforts: 2, errors: [], fromCache: 2, fetched: 2 });
    expect(progress).toEqual(['1/4/0', '2/4/0', '3/4/0', '4/4/0']);
    expect(loadSegmentCache()[2]).toMatchObject({
      _fetched: NOW, efforts: [{ id: 20 }, { id: 21 }],
      _segment: { average_grade: 6, elevation_difference: 120, total_elevation_gain: 125, distance: 2000 },
    });
  });

  it('un segmento che fallisce finisce nella lista degli errori col suo nome e si riprova la volta dopo', async () => {
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1, '<b>Muro</b> & "co"'), seg(2)]);
    vi.mocked(fetchSegmentEfforts).mockRejectedValueOnce(new StravaError('API x: 500', 500)).mockResolvedValue([effort(5)]);
    const run = loadSegmentPredictions();
    await vi.runAllTimersAsync();
    const { list, diag } = await run;
    expect(diag.errors).toEqual([{ name: '<b>Muro</b> & "co"', id: 1, msg: 'API x: 500' }]);
    expect(list.map((e) => e.segment.id)).toEqual([2]);
    expect(Object.keys(loadSegmentCache())).toEqual(['2']);
  });

  it('troppe richieste: aspetta 10 secondi prima del segmento dopo', async () => {
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1), seg(2)]);
    vi.mocked(fetchSegmentEfforts).mockRejectedValueOnce(new StravaError('API x: 429', 429)).mockResolvedValue([]);
    const run = loadSegmentPredictions();
    await vi.advanceTimersByTimeAsync(9000);
    expect(fetchSegmentEfforts).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSegmentEfforts).toHaveBeenCalledTimes(2);
    await run;
  });

  it('senza accesso a Strava si ferma, salva quanto scaricato e lancia l\'errore', async () => {
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1), seg(2), seg(3)]);
    vi.mocked(fetchSegmentEfforts).mockResolvedValueOnce([effort(1)]).mockRejectedValueOnce(new AuthError('not_connected'));
    const run = loadSegmentPredictions();
    const failed = expect(run).rejects.toBeInstanceOf(AuthError);
    await vi.runAllTimersAsync();
    await failed;
    expect(Object.keys(loadSegmentCache())).toEqual(['1']);
    expect(fetchSegmentEfforts).toHaveBeenCalledTimes(2);
  });
});

describe('Completa da dettagli attività', () => {
  it('prende i tentativi sui preferiti dai dettagli delle uscite in bici, senza doppioni', async () => {
    store.set('biketr_segments_cache_v2', JSON.stringify({ 1: { efforts: [effort(10)], _fetched: 1 } }));
    const starred = seg(1), other = seg(9);
    vi.mocked(fetchActivity).mockImplementation(async (id) => ({
      ...ride(Number(id)),
      segment_efforts: id === 100 ? [effort(10, starred), effort(11, starred), effort(12, other)] : [effort(13, seg(2))],
    }) as never);
    const acts = [ride(100), ride(101, 'Run'), ride(102, 'VirtualRide'), ride(103)];
    const progress: string[] = [];
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1), seg(2)]);
    const run = completeFromActivities(acts, 30, (d, t) => progress.push(`${d}/${t}`));
    await vi.runAllTimersAsync();
    expect(await run).toEqual({ fetched: 3, addedEfforts: 2 });
    expect(vi.mocked(fetchActivity).mock.calls.map(([id]) => id)).toEqual([100, 102, 103]);
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    const cache = loadSegmentCache();
    expect(cache[1].efforts?.map((e) => e.id)).toEqual([10, 11]);
    expect(cache[1]._fetched).toBe(NOW);
    expect(cache[2]).toMatchObject({ efforts: [{ id: 13 }], _segment: { average_grade: 6, elevation_difference: 120 } });
    expect(cache[9]).toBeUndefined();
    expect(acts.map((a) => a._detailFetched)).toEqual([true, undefined, true, true]);
  });

  it('le uscite già lette in questa sessione non si scaricano di nuovo', async () => {
    vi.mocked(fetchActivity).mockResolvedValue({ segment_efforts: [] } as never);
    const acts = [{ ...ride(1), _detailFetched: true }, ride(2)];
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1)]);
    const run = completeFromActivities(acts, 30);
    await vi.runAllTimersAsync();
    expect(await run).toEqual({ fetched: 1, addedEfforts: 0 });
    expect(vi.mocked(fetchActivity).mock.calls.map(([id]) => id)).toEqual([2]);
  });

  it('Strava che fallisce su un\'uscita: si passa alla successiva e si tiene quanto scaricato', async () => {
    vi.mocked(fetchActivity)
      .mockRejectedValueOnce(new StravaError('API x: 429', 429))
      .mockResolvedValue({ segment_efforts: [effort(7, seg(1))] } as never);
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1)]);
    const run = completeFromActivities([ride(1), ride(2)], 30);
    await vi.runAllTimersAsync();
    expect(await run).toEqual({ fetched: 1, addedEfforts: 1 });
    expect(loadSegmentCache()[1].efforts?.map((e) => e.id)).toEqual([7]);
  });

  it('senza accesso a Strava si ferma, salva quanto scaricato e lancia l\'errore', async () => {
    vi.mocked(fetchActivity)
      .mockResolvedValueOnce({ segment_efforts: [effort(7, seg(1))] } as never)
      .mockRejectedValueOnce(new AuthError('not_connected'));
    vi.mocked(fetchStarredSegments).mockResolvedValue([seg(1)]);
    const run = completeFromActivities([ride(1), ride(2), ride(3)], 30);
    const failed = expect(run).rejects.toBeInstanceOf(AuthError);
    await vi.runAllTimersAsync();
    await failed;
    expect(loadSegmentCache()[1].efforts?.map((e) => e.id)).toEqual([7]);
    expect(fetchActivity).toHaveBeenCalledTimes(2);
  });
});
