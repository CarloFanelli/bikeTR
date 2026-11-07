import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSegmentsAndReload, completeSegments, loadSegments, segmentsJob } from '../../src/app/jobs.ts';
import { session } from '../../src/app/session.ts';
import type { Activity } from '../../src/core/strava-types.ts';
import { AuthError } from '../../src/data/auth.ts';
import { completeFromActivities, loadSegmentPredictions } from '../../src/data/segments.ts';
import { clearSegmentCache } from '../../src/data/storage.ts';

vi.mock('../../src/data/segments.ts', async (original) => ({
  ...await original<typeof import('../../src/data/segments.ts')>(),
  loadSegmentPredictions: vi.fn(), completeFromActivities: vi.fn(),
}));
vi.mock('../../src/data/storage.ts', async (original) => ({
  ...await original<typeof import('../../src/data/storage.ts')>(),
  clearSegmentCache: vi.fn(),
}));

const diag = { totalStarred: 1, withEfforts: 1, noEfforts: 0, errors: [], fromCache: 0, fetched: 1 };
const loaded = { list: [{ segment: { id: 1, name: 'Muro' }, efforts: [] }], diag } as never;

// Una promessa che si risolve quando lo decide il test.
function pending<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { phase: 'ready', activities: [{ id: 1, type: 'Ride' }] as Activity[] });
  Object.assign(segmentsJob, {
    loading: false, progress: 'Carico segmenti…', list: null, diag: null, error: '', completing: false, completeProgress: '',
  });
  vi.mocked(loadSegmentPredictions).mockResolvedValue(loaded);
});

describe('previsioni sui segmenti', () => {
  it('mostra l\'avanzamento, poi i segmenti', async () => {
    vi.mocked(loadSegmentPredictions).mockImplementation(async (onProgress) => {
      onProgress?.(2, 5, 1);
      expect(segmentsJob.progress).toBe('Carico segmenti 2/5 (errori: 1)…');
      onProgress?.(3, 5, 0);
      expect(segmentsJob.progress).toBe('Carico segmenti 3/5…');
      return loaded;
    });
    await loadSegments();
    expect([segmentsJob.loading, segmentsJob.list?.length, segmentsJob.diag]).toEqual([false, 1, diag]);
  });

  it('Strava che fallisce: il messaggio che lo spiega', async () => {
    vi.mocked(loadSegmentPredictions).mockRejectedValue(new Error('API /segments/starred: 503'));
    await loadSegments();
    expect(segmentsJob.error).toBe('Errore caricamento segmenti: API /segments/starred: 503');
  });

  it('scollegati nel frattempo: "Collega Strava"', async () => {
    vi.mocked(loadSegmentPredictions).mockRejectedValue(new AuthError('not_connected'));
    await loadSegments();
    expect([session.phase, segmentsJob.error]).toEqual(['connect', '']);
  });

  it('"Svuota cache e ricarica" svuota e scarica di nuovo, non mentre carica', async () => {
    clearSegmentsAndReload();
    await vi.waitFor(() => expect(segmentsJob.loading).toBe(false));
    expect(clearSegmentCache).toHaveBeenCalledTimes(1);
    expect(loadSegmentPredictions).toHaveBeenCalledTimes(1);

    const slow = pending<never>();
    vi.mocked(loadSegmentPredictions).mockReturnValue(slow.promise);
    const run = loadSegments();
    clearSegmentsAndReload();
    expect(clearSegmentCache).toHaveBeenCalledTimes(1);
    slow.resolve(loaded);
    await run;
  });
});

describe('Completa da dettagli attività', () => {
  it('scarica, dice quanto ha aggiunto e ricarica le previsioni', async () => {
    vi.mocked(completeFromActivities).mockImplementation(async (_acts, max, onProgress) => {
      expect(max).toBe(30);
      onProgress?.(4, 30);
      expect(segmentsJob.completeProgress).toBe('Attività 4/30…');
      return { fetched: 12, addedEfforts: 7 };
    });
    const reload = pending<never>();
    vi.mocked(loadSegmentPredictions).mockReturnValue(reload.promise);
    const run = completeSegments();
    await vi.waitFor(() => expect(segmentsJob.completeProgress).toBe('✅ Scaricate 12 attività, aggiunti 7 efforts. Ricarico…'));
    expect(segmentsJob.completing).toBe(true);
    reload.resolve(loaded);
    await run;
    expect(vi.mocked(completeFromActivities).mock.calls[0][0]).toBe(session.activities);
    expect([segmentsJob.completing, segmentsJob.completeProgress]).toEqual([false, '✅ Scaricate 12 attività, aggiunti 7 efforts.']);
  });

  it('un secondo clic mentre scarica non fa niente, e nemmeno mentre le previsioni caricano', async () => {
    const slow = pending<{ fetched: number; addedEfforts: number }>();
    vi.mocked(completeFromActivities).mockReturnValue(slow.promise);
    const run = completeSegments();
    await completeSegments();
    expect(completeFromActivities).toHaveBeenCalledTimes(1);
    slow.resolve({ fetched: 0, addedEfforts: 0 });
    await run;

    segmentsJob.loading = true;
    await completeSegments();
    expect(completeFromActivities).toHaveBeenCalledTimes(1);
  });

  it('Strava che fallisce: il messaggio che lo spiega, e si può riprovare', async () => {
    vi.mocked(completeFromActivities).mockRejectedValue(new Error('API /segments/starred: 500'));
    await completeSegments();
    expect([segmentsJob.completing, segmentsJob.completeProgress]).toEqual([false, '❌ API /segments/starred: 500']);
  });
});
