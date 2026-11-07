import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../src/core/strava-types.ts';
import {
  applyCachedStreams, clearSegmentCache, cycleDayState, loadCoachSettings, loadPlannedRests, loadRainyDays,
  loadSegmentCache, loadSettings, loadSidebarCollapsed, loadStreamsCache, purgeLegacyStrava, recordFtpPoint, safeLoad,
  safeSave,
  saveCoachSettings, saveSegmentCache, saveSettings, saveSidebarCollapsed,
} from '../../src/data/storage.ts';

// localStorage simulato, ispezionabile dal test.
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('valori salvati nel browser', () => {
  it('primo uso, nessun valore salvato: i default di oggi', () => {
    expect(loadSettings()).toEqual({});
    expect(loadPlannedRests()).toEqual([]);
    expect(loadRainyDays()).toEqual([]);
    expect(loadStreamsCache()).toEqual({});
    expect(store.size).toBe(0);
  });

  it('legge i valori scritti dalla versione di oggi, con le stesse chiavi', () => {
    store.set('biketr_settings', '{"hrMax":190,"weeklyHours":8,"lthrSource":"declared","availableDays":[1,3,6]}');
    store.set('biketr_planned_rests', '["2026-11-06"]');
    store.set('biketr_rainy_days', '["2026-11-07"]');
    store.set('biketr_streams_cache', '{"123":{"NP":210,"TSS":80,"_fetched":1},"124":{"_error":"x","_fetched":2}}');
    expect(loadSettings()).toEqual({ hrMax: 190, weeklyHours: 8, lthrSource: 'declared', availableDays: [1, 3, 6] });
    expect(loadPlannedRests()).toEqual(['2026-11-06']);
    expect(loadRainyDays()).toEqual(['2026-11-07']);
    expect(loadStreamsCache()).toEqual({ 123: { NP: 210, TSS: 80, _fetched: 1 }, 124: { _error: 'x', _fetched: 2 } });
  });

  it('scrive JSON sotto le chiavi di oggi', () => {
    saveSettings({ hrMax: 185, weeklyDays: 4 });
    expect(store.get('biketr_settings')).toBe('{"hrMax":185,"weeklyDays":4}');
  });

  it('un valore rovinato lascia una copia .broken e dà il default', () => {
    store.set('biketr_settings', '{"hrMax":19');
    expect(loadSettings()).toEqual({});
    expect(store.get('biketr_settings.broken')).toBe('{"hrMax":19');

    store.set('biketr_planned_rests', '{"non":"una lista"}');
    expect(loadPlannedRests()).toEqual([]);
    expect(store.get('biketr_planned_rests.broken')).toBe('{"non":"una lista"}');
  });

  it('safeLoad e safeSave accettano chiavi e controlli qualsiasi', () => {
    expect(safeSave('biketr_x', { a: 1 })).toBe(true);
    expect(safeLoad('biketr_x', null, (x) => typeof x === 'object')).toEqual({ a: 1 });
    expect(safeLoad('biketr_y', 'default')).toBe('default');
  });

  it('safeSave senza spazio restituisce false invece di lanciare', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(safeSave('biketr_x', 1)).toBe(false);
  });

  it('un giorno passa da normale a saltato a pioggia e torna normale', () => {
    cycleDayState('2026-11-06');
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([['2026-11-06'], []]);
    cycleDayState('2026-11-06');
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([[], ['2026-11-06']]);
    cycleDayState('2026-11-06');
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([[], []]);
  });

  it('la pulizia toglie solo le credenziali Strava salvate dalle versioni vecchie', () => {
    store.set('biketr_strava', '{"client_secret":"x"}');
    store.set('biketr_strava.broken', '{');
    store.set('biketr_settings', '{}');
    purgeLegacyStrava();
    expect([...store.keys()]).toEqual(['biketr_settings']);
  });

  it('le metriche degli stream già scaricati tornano sulle attività, gli errori no', () => {
    store.set('biketr_streams_cache', '{"1":{"NP":210,"TSS":80,"_fetched":1},"2":{"_error":"x","_fetched":2}}');
    const acts = [{ id: 1 }, { id: 2 }, { id: 3 }] as Activity[];
    applyCachedStreams(acts);
    expect(acts).toEqual([{ id: 1, _metrics: { NP: 210, TSS: 80, _fetched: 1 } }, { id: 2 }, { id: 3 }]);
  });
});

describe('impostazioni del Coach', () => {
  it('salvare il modello tiene l\'ultima durata scelta', () => {
    store.set('biketr_coach_settings', '{"model":"qwen2.5:7b","lastDuration":90}');
    saveCoachSettings({ model: 'llama3.1:8b' });
    expect(store.get('biketr_coach_settings')).toBe('{"model":"llama3.1:8b","lastDuration":90}');
    expect(loadCoachSettings()).toEqual({ model: 'llama3.1:8b', lastDuration: 90 });
  });

  it('l\'indirizzo di Ollama salvato dalle versioni vecchie sparisce alla lettura', () => {
    store.set('biketr_coach_settings', '{"endpoint":"http://localhost:11434","model":"qwen2.5:7b"}');
    expect(loadCoachSettings()).toEqual({ model: 'qwen2.5:7b' });
    expect(store.get('biketr_coach_settings')).toBe('{"model":"qwen2.5:7b"}');
  });
});

describe('segmenti preferiti già scaricati', () => {
  it('si leggono, si salvano e si svuotano sotto la chiave di oggi', () => {
    expect(loadSegmentCache()).toEqual({});
    saveSegmentCache({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } } });
    expect(store.get('biketr_segments_cache_v2')).toBe('{"12":{"efforts":[],"_fetched":1,"_segment":{"distance":1200}}}');
    expect(loadSegmentCache()).toEqual({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } } });
    clearSegmentCache();
    expect(store.has('biketr_segments_cache_v2')).toBe(false);
  });
});

describe('barra laterale ridotta a icone', () => {
  it('senza scelta salvata è espansa', () => {
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it('la scelta si salva sotto biketr_ui e vale alla ricarica', () => {
    saveSidebarCollapsed(true);
    expect(store.get('biketr_ui')).toBe('{"sidebarCollapsed":true}');
    expect(loadSidebarCollapsed()).toBe(true);
    saveSidebarCollapsed(false);
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it('una scelta illeggibile apre la barra espansa', () => {
    store.set('biketr_ui', '{"sidebarCollapsed":tr');
    expect(loadSidebarCollapsed()).toBe(false);
    expect(store.get('biketr_ui.broken')).toBe('{"sidebarCollapsed":tr');
    store.set('biketr_ui', '[true]');
    expect(loadSidebarCollapsed()).toBe(false);
    store.set('biketr_ui', '{"sidebarCollapsed":"sì"}');
    expect(loadSidebarCollapsed()).toBe(false);
  });
});

describe('punto FTP di oggi', () => {
  const now = new Date(2026, 10, 7, 10);
  const profile = { ftp: 250, ftpDecl: 250, ftpEst: 240, ftpSource: 'declared' } as never;

  it('si aggiunge allo storico e in fondo agli ultimi 20 del mesociclo', () => {
    store.set('biketr_ftp_history', JSON.stringify([{ date: '2026-10-30', ftp: 245, source: 'declared' }]));
    store.set('biketr_mesocycle', JSON.stringify({ blockId: 'base', ftpHistory: [{ date: '2026-10-30', ftp: 245 }] }));
    recordFtpPoint(profile, now);
    expect(JSON.parse(store.get('biketr_ftp_history')!)).toEqual([
      { date: '2026-10-30', ftp: 245, source: 'declared' }, { date: '2026-11-07', ftp: 250, source: 'declared' },
    ]);
    expect(JSON.parse(store.get('biketr_mesocycle')!).ftpHistory).toEqual([
      { date: '2026-10-30', ftp: 245 }, { date: '2026-11-07', ftp: 250 },
    ]);
  });

  it('meno di 5 giorni dall\'ultimo punto: non si salva niente', () => {
    store.set('biketr_ftp_history', JSON.stringify([{ date: '2026-11-04', ftp: 245, source: 'declared' }]));
    recordFtpPoint(profile, now);
    expect(JSON.parse(store.get('biketr_ftp_history')!)).toHaveLength(1);
    expect(store.has('biketr_mesocycle')).toBe(false);
  });
});
