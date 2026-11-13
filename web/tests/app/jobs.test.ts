import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countForExport, exportJob, refreshFromStrava, retryExport, runExport, syncJob,
} from '../../src/app/jobs.ts';
import { session } from '../../src/app/session.ts';
import type { Activity, ActivityDetail } from '../../src/core/strava-types.ts';
import { savedActivities, savedAthlete, syncStrava } from '../../src/data/coach.ts';
import { downloadJson } from '../../src/data/export.ts';
import { fetchActivities, fetchActivity, fetchActivityStreams } from '../../src/data/strava.ts';

vi.mock('../../src/data/strava.ts', async (original) => ({
  ...(await original<typeof import('../../src/data/strava.ts')>()),
  fetchActivities: vi.fn(), fetchActivity: vi.fn(), fetchActivityStreams: vi.fn(),
}));
vi.mock('../../src/data/coach.ts', async (original) => ({
  ...(await original<typeof import('../../src/data/coach.ts')>()),
  syncStrava: vi.fn(), savedAthlete: vi.fn(), savedActivities: vi.fn(),
  activityLoads: vi.fn(async () => ({ ok: true, value: { loads: {} } })),
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Aggiorna da Strava', () => {
  const synced = (status: 'updated' | 'unreachable', syncedAt: number) =>
    ({ ok: true as const, value: { status, syncedAt, retryAt: null } });

  beforeEach(() => {
    Object.assign(syncJob, { running: false, result: '', error: false });
    vi.mocked(savedAthlete).mockResolvedValue({ ok: true, value: { athlete: session.athlete, stats: null, syncedAt: 1 } });
    vi.mocked(savedActivities).mockResolvedValue({ ok: true, value: [ride(2), ride(1)] });
  });

  it('sincronizza subito e mostra la corsa nuova senza ricaricare la pagina', async () => {
    session.activities = [ride(1)];
    vi.mocked(syncStrava).mockResolvedValue(synced('updated', new Date().setHours(14, 32)));
    await refreshFromStrava();
    expect(syncStrava).toHaveBeenCalledWith(true);
    expect(session.activities.map(a => a.id)).toEqual([2, 1]);
    expect(syncJob).toEqual({ running: false, result: 'Aggiornato alle 14:32', error: false });
  });

  it('un secondo clic mentre aggiorna non fa niente', async () => {
    let release = () => {};
    vi.mocked(syncStrava).mockImplementation(() => new Promise((resolve) => {
      release = () => resolve(synced('updated', Date.now()));
    }));
    const first = refreshFromStrava();
    expect(syncJob.running).toBe(true);
    await refreshFromStrava();
    release();
    await first;
    expect(syncStrava).toHaveBeenCalledTimes(1);
    expect(syncJob.running).toBe(false);
  });

  it('Strava non raggiungibile: lo dice, e i dati salvati restano', async () => {
    vi.mocked(syncStrava).mockResolvedValue(synced('unreachable', new Date().setHours(9, 5)));
    await refreshFromStrava();
    expect(syncJob.result).toBe('Dati aggiornati alle 09:05: Strava non raggiungibile');
    expect(session.phase).toBe('ready');
  });

  it('scollegato durante l\'aggiornamento: "Collega Strava"', async () => {
    vi.mocked(syncStrava).mockResolvedValue({ ok: false, msg: 'Strava scollegato', code: 'disconnected' });
    await refreshFromStrava();
    expect([session.phase, syncJob.running, syncJob.error]).toEqual(['connect', false, false]);
  });

  it('servizio spento: l\'errore sotto la voce del menu', async () => {
    vi.mocked(syncStrava).mockResolvedValue({ ok: false, msg: 'Coach non raggiungibile' });
    await refreshFromStrava();
    expect(syncJob).toEqual({ running: false, result: 'Coach non raggiungibile', error: true });
    expect(session.phase).toBe('ready');
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

  it('Riprova rifà lo stesso export già confermato; senza un export prima non fa niente', async () => {
    vi.mocked(fetchActivities).mockResolvedValue([ride(1), ride(2)]);
    await countForExport();
    exportJob.lastChoice = null;
    await retryExport();
    expect(downloadJson).not.toHaveBeenCalled();

    vi.mocked(downloadJson).mockImplementationOnce(() => { throw new Error('disco pieno'); });
    await runExport({ mode: 'compact', from: '', to: '', onlyRides: true });
    expect(exportJob.error).toBe('❌ disco pieno');

    await retryExport();
    expect(exportJob).toMatchObject({ error: '', done: { count: 2 } });
    expect(vi.mocked(downloadJson).mock.calls.map(c => c[1])).toEqual([
      expect.stringContaining('compact'), expect.stringContaining('compact'),
    ]);
  });

  it('Strava non risponde mentre conta: il messaggio che lo spiega', async () => {
    vi.mocked(fetchActivities).mockRejectedValue(new Error('API /athlete/activities?per_page=200&page=1: 503'));
    await countForExport();
    expect(exportJob).toMatchObject({
      counting: false, all: null, countError: 'Errore: API /athlete/activities?per_page=200&page=1: 503',
    });
  });
});
