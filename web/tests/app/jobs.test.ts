import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { countForExport, exportJob, refreshStreams, runExport, streamsJob } from '../../src/app/jobs.ts';
import { hrProfile, session } from '../../src/app/session.ts';
import { dataPrecision } from '../../src/core/home.ts';
import type { Activity, ActivityDetail } from '../../src/core/strava-types.ts';
import { AuthError } from '../../src/data/auth.ts';
import { downloadJson } from '../../src/data/export.ts';
import { MAX_STREAMS_FETCH } from '../../src/data/streams.ts';
import { fetchActivities, fetchActivity, fetchActivityStreams } from '../../src/data/strava.ts';

vi.mock('../../src/data/strava.ts', () => ({
  fetchActivities: vi.fn(), fetchActivity: vi.fn(), fetchActivityStreams: vi.fn(),
}));
// Il file scaricato dal browser: qui ne conta solo il contenuto (e la dimensione, 1234 byte).
vi.mock('../../src/data/export.ts', async (original) => ({
  ...await original<typeof import('../../src/data/export.ts')>(),
  downloadJson: vi.fn(() => 1234),
}));

const hour = { watts: { data: Array(3600).fill(250) } };
const ride = (id: number, extra: Partial<Activity> = {}) => ({
  id, type: 'Ride', start_date_local: '2026-11-01T08:00:00Z', ...extra,
}) as Activity;

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.clearAllMocks();
  vi.mocked(fetchActivityStreams).mockResolvedValue(hour);
  vi.mocked(fetchActivity).mockImplementation(async (id) => ({ id }) as ActivityDetail);
  Object.assign(session, { phase: 'ready', athlete: { id: 7, firstname: 'Carlo', lastname: 'F' }, stats: null, activities: [] });
  Object.assign(streamsJob, { running: false, progress: '' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Aggiorna con streams', () => {
  it('a fine scaricamento Home ricalcola: il carico viene dagli stream', async () => {
    store.set('biketr_settings', '{"ftpDeclared":250}');
    session.activities = [ride(1, { weighted_average_watts: 200 })];
    const loadSource = computed(() => dataPrecision(hrProfile(), session.activities, MAX_STREAMS_FETCH).mode.label);
    expect(loadSource.value).toBe('TSS approssimato');
    await refreshStreams();
    expect(loadSource.value).toBe('TSS da streams');
    expect(streamsJob).toEqual({ running: false, progress: '✅ Cache aggiornata. Ricalcolo…' });
  });

  it('un secondo clic mentre scarica non fa niente', async () => {
    session.activities = [ride(1)];
    let release = () => {};
    vi.mocked(fetchActivityStreams).mockImplementation(() => new Promise((resolve) => { release = () => resolve(hour); }));
    const first = refreshStreams();
    expect(streamsJob).toEqual({ running: true, progress: 'Avvio…' });
    await refreshStreams();
    release();
    await first;
    expect(fetchActivityStreams).toHaveBeenCalledTimes(1);
    expect(streamsJob.running).toBe(false);
  });

  it('server di autenticazione spento: il messaggio di oggi', async () => {
    session.activities = [ride(1)];
    vi.mocked(fetchActivityStreams).mockRejectedValue(new AuthError('unreachable'));
    await refreshStreams();
    expect(streamsJob.progress).toBe('❌ Server di autenticazione non raggiungibile. Controlla i log con: docker compose logs auth');
    expect(session.phase).toBe('ready');
  });

  it('scollegati nel frattempo: "Collega Strava"', async () => {
    session.activities = [ride(1)];
    vi.mocked(fetchActivityStreams).mockRejectedValue(new AuthError('not_connected'));
    await refreshStreams();
    expect([session.phase, streamsJob.running]).toEqual(['connect', false]);
  });
});

describe('Esporta allenamenti', () => {
  it('continua anche fuori da Home, con l\'avanzamento al ritorno; un secondo clic non fa niente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
    vi.mocked(fetchActivities).mockResolvedValue([ride(1), ride(2), ride(3, { type: 'Run' })]);
    await countForExport();
    expect(exportJob.all).toHaveLength(3);

    const choice = { mode: 'detailed' as const, from: '', to: '', onlyRides: true };
    const running = runExport(choice);
    await vi.advanceTimersByTimeAsync(0);
    expect(exportJob).toMatchObject({ running: true, progress: 'Dettagli 1/2 (throttle 10s/req)…', pct: 25 });

    await runExport(choice);
    await countForExport();
    expect([fetchActivity, fetchActivities].map((f) => vi.mocked(f).mock.calls.length)).toEqual([1, 1]);
    expect(exportJob.all).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(10000);
    await running;
    expect(exportJob).toMatchObject({
      running: false, pct: 100, error: '',
      done: { fname: 'biketr-export-detailed-2026-11-07.json', size: '1.2 KB', count: 2 },
    });
    expect(downloadJson).toHaveBeenCalledWith(
      expect.objectContaining({ athlete: expect.objectContaining({ id: 7 }) }), 'biketr-export-detailed-2026-11-07.json',
    );
  });

  it('Strava non risponde mentre conta: il messaggio di oggi', async () => {
    vi.mocked(fetchActivities).mockRejectedValue(new Error('API /athlete/activities?per_page=200&page=1: 503'));
    await countForExport();
    expect(exportJob).toMatchObject({
      counting: false, all: null, countError: 'Errore: API /athlete/activities?per_page=200&page=1: 503',
    });
  });
});
