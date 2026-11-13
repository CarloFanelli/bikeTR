import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAthleteData, readAthleteData } from '../../src/data/athlete-data.ts';
import { athleteServer } from './athlete-server.ts';

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('prima apertura dopo l\'aggiornamento', () => {
  it('server vuoto: il browser manda i suoi dati, poi cancella le sue copie; tema e viste restano', async () => {
    store.set('biketr_settings', '{"hrMax":190,"vecchio":true}');
    store.set('biketr_rainy_days', '["2026-11-07"]');
    store.set('biketr_mesocycle', '{"startDate":');
    store.set('biketr_mesocycle.broken', '{"rotto"');
    store.set('biketr_ui', '{"theme":"dark"}');
    const server = await athleteServer();
    expect(Object.fromEntries(server.saved)).toEqual({ settings: { hrMax: 190 }, rainyDays: ['2026-11-07'] });
    expect(readAthleteData('settings')).toEqual({ hrMax: 190 });
    expect([...store.keys()]).toEqual(['biketr_ui']);
  });

  it('server già pieno: le copie del browser si cancellano senza mandarle', async () => {
    store.set('biketr_settings', '{"hrMax":150}');
    const server = await athleteServer({ settings: { hrMax: 190 } });
    expect(server.saved.get('settings')).toEqual({ hrMax: 190 });
    expect(readAthleteData('settings')).toEqual({ hrMax: 190 });
    expect(store.size).toBe(0);
  });

  it('un altro browser arriva prima: si comporta come con il server pieno', async () => {
    const server = await athleteServer();
    store.set('biketr_settings', '{"hrMax":150}');
    const fetchServer = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      // L'altro browser importa fra la lettura e l'import di questo.
      if (url === '/coach/athlete-data/import') server.saved.set('settings', { hrMax: 190 });
      return fetchServer(url, init);
    });
    expect(await loadAthleteData()).toEqual({ ok: true, value: null });
    expect(readAthleteData('settings')).toEqual({ hrMax: 190 });
    expect(store.size).toBe(0);
  });

  it('servizio non raggiungibile: le copie restano per la prossima apertura', async () => {
    store.set('biketr_settings', '{"hrMax":150}');
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    expect((await loadAthleteData()).ok).toBe(false);
    expect(store.get('biketr_settings')).toBe('{"hrMax":150}');
  });
});
