import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnect, session, startSession } from '../../src/app/session.ts';
import type { Activity } from '../../src/core/strava-types.ts';
import { AuthError, getAuthStatus, logout } from '../../src/data/auth.ts';
import { forgetCoachRides } from '../../src/data/coach.ts';
import { applyCachedStreams, purgeLegacyStrava } from '../../src/data/storage.ts';
import { fetchActivities, fetchAthlete, fetchAthleteStats } from '../../src/data/strava.ts';

vi.mock('../../src/data/auth.ts', async (original) => ({
  ...await original<typeof import('../../src/data/auth.ts')>(),
  getAuthStatus: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../src/data/coach.ts', () => ({ forgetCoachRides: vi.fn() }));
vi.mock('../../src/data/storage.ts', () => ({ applyCachedStreams: vi.fn(), purgeLegacyStrava: vi.fn() }));
vi.mock('../../src/data/strava.ts', () => ({
  fetchActivities: vi.fn(), fetchAthlete: vi.fn(), fetchAthleteStats: vi.fn(),
}));

const athlete = { id: 7, firstname: 'Carlo', lastname: 'Fanelli' };
const stats = { all_ride_totals: { count: 3, distance: 120000 } };
const activities = [{ id: 1, name: 'Giro' }] as Activity[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthStatus).mockResolvedValue({ missing: [], connected: true });
  vi.mocked(fetchAthlete).mockResolvedValue(athlete as never);
  vi.mocked(fetchAthleteStats).mockResolvedValue(stats as never);
  vi.mocked(fetchActivities).mockResolvedValue(activities);
});

describe('apertura della nuova app', () => {
  it('collegato: atleta, statistiche e 60 attività con le metriche già scaricate', async () => {
    await startSession();
    expect(session.phase).toBe('ready');
    expect([session.athlete, session.stats, session.activities]).toEqual([athlete, stats, activities]);
    expect(fetchAthleteStats).toHaveBeenCalledWith(7);
    expect(fetchActivities).toHaveBeenCalledWith(60);
    expect(applyCachedStreams).toHaveBeenCalledWith(activities);
    expect(purgeLegacyStrava).toHaveBeenCalled();
  });

  it('non collegato: solo "Collega Strava"', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue({ missing: [], connected: false });
    await startSession();
    expect([session.phase, session.missing]).toEqual(['connect', []]);
    expect(fetchAthlete).not.toHaveBeenCalled();
  });

  it('credenziali mancanti nel .env: "Collega Strava" dice quali', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue({ missing: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'], connected: false });
    await startSession();
    expect([session.phase, session.missing]).toEqual(['connect', ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET']]);
  });

  it('scollegato mentre carica: "Collega Strava", non un errore', async () => {
    vi.mocked(fetchAthlete).mockRejectedValue(new AuthError('not_connected'));
    await startSession();
    expect([session.phase, session.missing, session.error]).toEqual(['connect', [], null]);
  });

  it('Strava non raggiungibile: il messaggio di oggi', async () => {
    vi.mocked(fetchActivities).mockRejectedValue(new Error('API /athlete/activities: 503'));
    await startSession();
    expect([session.phase, session.error]).toEqual(['error', 'API /athlete/activities: 503']);
  });

  it('server di autenticazione spento: il suo messaggio', async () => {
    vi.mocked(getAuthStatus).mockRejectedValue(new AuthError('unreachable'));
    await startSession();
    expect(session.phase).toBe('error');
    expect(session.error).toContain('docker compose logs auth');
  });
});

describe('Disconnetti da Strava', () => {
  it('cancella i token, fa dimenticare le corse al Coach e torna a "Collega Strava"', async () => {
    await startSession();
    vi.mocked(getAuthStatus).mockResolvedValue({ missing: [], connected: false });
    await disconnect();
    expect(logout).toHaveBeenCalled();
    expect(forgetCoachRides).toHaveBeenCalled();
    expect([session.phase, session.athlete, session.stats, session.activities]).toEqual(['connect', null, null, []]);
  });
});
