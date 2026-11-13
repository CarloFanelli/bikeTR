import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnect, refreshLoads, session, startSession } from '../../src/app/session.ts';
import type { Activity } from '../../src/core/strava-types.ts';
import { loadAthleteData } from '../../src/data/athlete-data.ts';
import { AuthError, getAuthStatus, logout } from '../../src/data/auth.ts';
import { activityLoads, forgetCoachRides, savedActivities, savedAthlete, syncStrava } from '../../src/data/coach.ts';
import {
  applyCachedStreams, loadMesocycle, loadSettings, purgeLegacyStrava, recordFtpPoint, saveMesocycle,
} from '../../src/data/storage.ts';

vi.mock('../../src/data/auth.ts', async (original) => ({
  ...await original<typeof import('../../src/data/auth.ts')>(),
  getAuthStatus: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../src/data/coach.ts', () => ({
  forgetCoachRides: vi.fn(), syncStrava: vi.fn(), savedAthlete: vi.fn(), savedActivities: vi.fn(), activityLoads: vi.fn(),
}));
vi.mock('../../src/data/storage.ts', () => ({
  applyCachedStreams: vi.fn(), purgeLegacyStrava: vi.fn(), loadSettings: vi.fn(() => ({})),
  loadMesocycle: vi.fn(), saveMesocycle: vi.fn(async () => ({ ok: true, value: null })), loadSegmentCache: vi.fn(() => ({})),
  recordFtpPoint: vi.fn(),
}));
vi.mock('../../src/data/athlete-data.ts', () => ({ loadAthleteData: vi.fn() }));
// Nessuna richiesta del browser a Strava: se partisse, il test fallirebbe.
vi.mock('../../src/data/strava.ts', () => ({}));

const athlete = { id: 7, firstname: 'Carlo', lastname: 'Fanelli' };
const stats = { all_ride_totals: { count: 3, distance: 120000 } };
const activities = [{ id: 1, name: 'Giro' }] as Activity[];
const withLoad = (load: number) => [{ id: 1, name: 'Giro', _load: load }];
const SYNCED_AT = new Date(2026, 10, 13, 9, 30).getTime();
const ok = <T>(value: T) => ({ ok: true as const, value });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthStatus).mockResolvedValue({ missing: [], connected: true });
  vi.mocked(loadAthleteData).mockResolvedValue({ ok: true, value: null });
  vi.mocked(syncStrava).mockResolvedValue(ok({ status: 'updated' as const, syncedAt: SYNCED_AT, retryAt: null }));
  vi.mocked(savedAthlete).mockResolvedValue(ok({ athlete, stats, syncedAt: SYNCED_AT } as never));
  vi.mocked(savedActivities).mockResolvedValue(ok(activities));
  vi.mocked(activityLoads).mockResolvedValue(ok({ loads: { 1: 42 } }));
  vi.mocked(loadMesocycle).mockReturnValue(null);
  vi.mocked(loadSettings).mockReturnValue({});
  vi.mocked(recordFtpPoint).mockReset().mockResolvedValue({ ok: true, value: null });
});

describe('apertura dell\'app', () => {
  it('collegato: il servizio sincronizza, poi atleta, statistiche e 60 attività salvati', async () => {
    await startSession();
    expect(session.phase).toBe('ready');
    expect([session.athlete, session.stats, session.activities, session.syncNotice])
      .toEqual([athlete, stats, withLoad(42), null]);
    expect(syncStrava).toHaveBeenCalledWith();
    expect(vi.mocked(loadAthleteData).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(syncStrava).mock.invocationCallOrder[0]);
    expect(savedActivities).toHaveBeenCalledWith(60);
    expect(applyCachedStreams).toHaveBeenCalledWith(activities);
    expect(purgeLegacyStrava).toHaveBeenCalled();
  });

  it('mesociclo: alla prima apertura si sceglie e si salva, poi solo quando cambia', async () => {
    await startSession();
    expect(saveMesocycle).toHaveBeenCalledWith(expect.objectContaining({ weekInBlock: 0, blockIndex: 0 }));

    vi.mocked(saveMesocycle).mockClear();
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(loadMesocycle).mockReturnValue({
      startDate: today, blockIndex: 0, blockId: 'base', weekInBlock: 0, blockHistory: [], ftpHistory: [],
    });
    await startSession();
    expect(saveMesocycle).not.toHaveBeenCalled();
    expect(session.phase).toBe('ready');
  });

  it('registra il punto FTP di oggi con FTP e soglia di adesso, dopo il mesociclo', async () => {
    vi.mocked(loadSettings).mockReturnValue({ ftpDeclared: 250 });
    await startSession();
    expect(recordFtpPoint).toHaveBeenCalledWith(expect.objectContaining({ ftp: 250, ftpDecl: 250 }), expect.any(Date));
    expect(vi.mocked(recordFtpPoint).mock.invocationCallOrder[0])
      .toBeGreaterThan(vi.mocked(saveMesocycle).mock.invocationCallOrder[0]);
  });

  it('un punto FTP che non si salva non blocca l\'apertura', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(recordFtpPoint).mockImplementation(() => { throw new Error('storico rovinato'); });
    await startSession();
    expect(session.phase).toBe('ready');
    expect(console.warn).toHaveBeenCalled();
  });

  it('un mesociclo salvato rovinato non blocca l\'apertura', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(loadMesocycle).mockReturnValue({ startDate: '2020-01-01', blockId: 'base' } as never);
    await startSession();
    expect(session.phase).toBe('ready');
    expect(console.warn).toHaveBeenCalled();
  });

  it('non collegato: solo "Collega Strava"', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue({ missing: [], connected: false });
    await startSession();
    expect([session.phase, session.missing]).toEqual(['connect', []]);
    expect(syncStrava).not.toHaveBeenCalled();
  });

  it('credenziali mancanti nel .env: "Collega Strava" dice quali', async () => {
    vi.mocked(getAuthStatus).mockResolvedValue({ missing: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'], connected: false });
    await startSession();
    expect([session.phase, session.missing]).toEqual(['connect', ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET']]);
  });

  it.each(['not_connected', 'disconnected'])('il servizio risponde %s: "Collega Strava", non un errore', async (code) => {
    vi.mocked(syncStrava).mockResolvedValue({ ok: false, msg: 'Non connesso', code });
    await startSession();
    expect([session.phase, session.missing, session.error]).toEqual(['connect', [], null]);
  });

  it('Strava non raggiungibile: i dati salvati, con l\'ora dell\'ultimo aggiornamento', async () => {
    vi.mocked(syncStrava).mockResolvedValue(ok({ status: 'unreachable' as const, syncedAt: SYNCED_AT, retryAt: null }));
    await startSession();
    expect(session.phase).toBe('ready');
    expect(session.syncNotice).toMatch(/^Dati aggiornati (il 13\/11 )?alle 09:30: Strava non raggiungibile$/);
  });

  it('Strava chiede una pausa: i dati salvati e quando si riprova', async () => {
    const retryAt = new Date(2026, 10, 13, 9, 45).getTime();
    vi.mocked(syncStrava).mockResolvedValue(ok({ status: 'paused' as const, syncedAt: SYNCED_AT, retryAt }));
    await startSession();
    expect(session.syncNotice).toMatch(/^Strava ha chiesto una pausa: riprovo (il 13\/11 )?alle 09:45$/);
  });

  it('Strava non raggiungibile e nulla salvato: un errore che lo dice', async () => {
    vi.mocked(syncStrava).mockResolvedValue(ok({ status: 'unreachable' as const, syncedAt: null, retryAt: null }));
    vi.mocked(savedAthlete).mockResolvedValue(ok({ athlete: null, stats: null, syncedAt: null }));
    await startSession();
    expect([session.phase, session.error]).toEqual(['error', 'Strava non raggiungibile']);
  });

  it('i dati dell\'atleta non si leggono: un errore, prima di chiedere a Strava', async () => {
    vi.mocked(loadAthleteData).mockResolvedValue({ ok: false, msg: 'Coach non raggiungibile' });
    await startSession();
    expect([session.phase, session.error]).toEqual(['error', 'Coach non raggiungibile']);
    expect(syncStrava).not.toHaveBeenCalled();
  });

  it('database spento: un errore con Riprova, niente scritto nel browser', async () => {
    const msg = 'Database non raggiungibile. Controlla i log con: docker compose logs db';
    vi.mocked(savedAthlete).mockResolvedValue({ ok: false, msg, code: 'database_unreachable' });
    await startSession();
    expect([session.phase, session.error]).toEqual(['error', msg]);
    expect(saveMesocycle).not.toHaveBeenCalled();
    expect(recordFtpPoint).not.toHaveBeenCalled();
  });

  it('server di autenticazione spento: il suo messaggio', async () => {
    vi.mocked(getAuthStatus).mockRejectedValue(new AuthError('unreachable'));
    await startSession();
    expect(session.phase).toBe('error');
    expect(session.error).toContain('docker compose logs auth');
  });
});

describe('carico delle attività dal servizio Coach', () => {
  it('all\'apertura ogni attività ha il carico calcolato dal servizio con le soglie di adesso', async () => {
    vi.mocked(loadSettings).mockReturnValue({ ftpDeclared: 250, hrLthr: 165, hrMax: 185 });
    await startSession();
    expect(activityLoads).toHaveBeenCalledWith({ ftp: 250, lthr: 165, hrMax: 185 }, [1]);
    expect(session.activities).toEqual(withLoad(42));
  });

  it('senza soglie il servizio riceve null, e calcola come faceva il browser', async () => {
    await startSession();
    expect(activityLoads).toHaveBeenCalledWith({ ftp: null, lthr: null, hrMax: null }, [1]);
  });

  it('il servizio non dà i carichi: un errore all\'apertura, nessun carico calcolato nel browser', async () => {
    vi.mocked(activityLoads).mockResolvedValue({ ok: false, msg: 'Coach non raggiungibile' });
    await startSession();
    expect([session.phase, session.error]).toEqual(['error', 'Coach non raggiungibile']);
  });

  it('nuova FTP salvata: il servizio ricalcola; soglie uguali: nessuna richiesta', async () => {
    await startSession();
    vi.mocked(activityLoads).mockClear();
    await refreshLoads();
    expect(activityLoads).not.toHaveBeenCalled();

    vi.mocked(loadSettings).mockReturnValue({ ftpDeclared: 280 });
    vi.mocked(activityLoads).mockResolvedValue(ok({ loads: { 1: 37 } }));
    await refreshLoads();
    expect(activityLoads).toHaveBeenCalledWith(expect.objectContaining({ ftp: 280 }), [1]);
    expect(session.activities).toEqual(withLoad(37));
  });

  it('il ricalcolo fallisce: restano i carichi di prima, con un avviso, e si riprova alla prossima occasione', async () => {
    await startSession();
    vi.mocked(loadSettings).mockReturnValue({ ftpDeclared: 280 });
    vi.mocked(activityLoads).mockResolvedValue({ ok: false, msg: 'Coach non raggiungibile' });
    await refreshLoads();
    expect(session.activities).toEqual(withLoad(42));
    expect(session.syncNotice).toBe('Carico delle attività non ricalcolato con le nuove soglie: Coach non raggiungibile');

    vi.mocked(activityLoads).mockResolvedValue(ok({ loads: { 1: 37 } }));
    await refreshLoads();
    expect(session.activities).toEqual(withLoad(37));
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
