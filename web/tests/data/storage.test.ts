import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../src/core/strava-types.ts';
import {
  applyCachedStreams, clearSegmentCache, cycleDayState, loadCoachSettings, loadPlannedRests, loadRainyDays,
  loadSegmentCache, loadSettings, loadStreamsCache, purgeLegacyStrava, recordFtpPoint, safeLoad,
  safeSave,
  saveCoachSettings, saveSegmentCache, saveSettings, loadThemeChoice, saveThemeChoice,
  loadActivitiesView, loadAnalysisTab, saveActivitiesView, saveAnalysisTab,
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
  it('primo uso, nessun valore salvato: i default', () => {
    expect(loadSettings()).toEqual({});
    expect(loadPlannedRests()).toEqual([]);
    expect(loadRainyDays()).toEqual([]);
    expect(loadStreamsCache()).toEqual({});
    expect(store.size).toBe(0);
  });

  it('legge i valori scritti dalla versione JavaScript di prima, con le stesse chiavi', () => {
    store.set('biketr_settings', '{"hrMax":190,"weeklyHours":8,"lthrSource":"declared","availableDays":[1,3,6]}');
    store.set('biketr_planned_rests', '["2026-11-06"]');
    store.set('biketr_rainy_days', '["2026-11-07"]');
    store.set('biketr_streams_cache', '{"123":{"NP":210,"TSS":80,"_fetched":1},"124":{"_error":"x","_fetched":2}}');
    expect(loadSettings()).toEqual({ hrMax: 190, weeklyHours: 8, lthrSource: 'declared', availableDays: [1, 3, 6] });
    expect(loadPlannedRests()).toEqual(['2026-11-06']);
    expect(loadRainyDays()).toEqual(['2026-11-07']);
    expect(loadStreamsCache()).toEqual({ 123: { NP: 210, TSS: 80, _fetched: 1 }, 124: { _error: 'x', _fetched: 2 } });
  });

  it('scrive JSON sotto le stesse chiavi', () => {
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
  it('salvare la durata la ricorda per la prossima volta', () => {
    saveCoachSettings({ lastDuration: 90 });
    expect(store.get('biketr_coach_settings')).toBe('{"lastDuration":90}');
    expect(loadCoachSettings()).toEqual({ lastDuration: 90 });
  });

  it('indirizzo di Ollama e modello salvati dalle versioni vecchie spariscono alla lettura: li sceglie .env', () => {
    store.set('biketr_coach_settings', '{"endpoint":"http://localhost:11434","model":"llama3.1:8b","lastDuration":90}');
    expect(loadCoachSettings()).toEqual({ lastDuration: 90 });
    expect(store.get('biketr_coach_settings')).toBe('{"lastDuration":90}');
  });
});

describe('segmenti preferiti già scaricati', () => {
  it('si leggono, si salvano e si svuotano sotto la loro chiave', () => {
    expect(loadSegmentCache()).toEqual({});
    saveSegmentCache({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } } });
    expect(store.get('biketr_segments_cache_v2')).toBe('{"12":{"efforts":[],"_fetched":1,"_segment":{"distance":1200}}}');
    expect(loadSegmentCache()).toEqual({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } } });
    clearSegmentCache();
    expect(store.has('biketr_segments_cache_v2')).toBe(false);
  });
});

describe('tema scelto', () => {
  it('senza scelta salvata segue il computer', () => {
    expect(loadThemeChoice()).toBe('system');
  });

  it('la scelta si salva sotto biketr_ui e vale alla ricarica', () => {
    saveThemeChoice('dark');
    expect(store.get('biketr_ui')).toBe('{"theme":"dark"}');
    expect(loadThemeChoice()).toBe('dark');
    saveThemeChoice('light');
    expect(loadThemeChoice()).toBe('light');
  });

  it('il valore della vecchia barra laterale vale come "segue il computer", senza copia .broken', () => {
    store.set('biketr_ui', '{"sidebarCollapsed":true}');
    expect(loadThemeChoice()).toBe('system');
    expect(store.has('biketr_ui.broken')).toBe(false);
  });

  it('con i dati del browser bloccati segue il computer, e salvare non si interrompe', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => {},
    });
    expect(loadThemeChoice()).toBe('system');
    expect(saveThemeChoice('dark')).toBe(false);
  });

  it('un tema sconosciuto o illeggibile vale come "segue il computer"', () => {
    store.set('biketr_ui', '{"theme":"blu"}');
    expect(loadThemeChoice()).toBe('system');
    store.set('biketr_ui', '{"theme":"da');
    expect(loadThemeChoice()).toBe('system');
  });
});

describe('scheda di Analisi', () => {
  it('senza scelta salvata apre Forma e carico', () => {
    expect(loadAnalysisTab()).toBe('forma');
  });

  it('la scheda scelta vale alla ricarica', () => {
    saveAnalysisTab('soglie');
    expect(loadAnalysisTab()).toBe('soglie');
  });

  it('tema e scheda stanno insieme sotto biketr_ui: salvare uno non cancella l\'altro', () => {
    saveThemeChoice('dark');
    saveAnalysisTab('potenza');
    expect(loadThemeChoice()).toBe('dark');
    saveThemeChoice('light');
    expect(loadAnalysisTab()).toBe('potenza');
  });

  it('Profilo e dati vale alla ricarica come le altre schede', () => {
    saveThemeChoice('dark');
    saveActivitiesView('table');
    saveAnalysisTab('profilo');
    expect([loadThemeChoice(), loadAnalysisTab(), loadActivitiesView()]).toEqual(['dark', 'profilo', 'table']);
  });

  it('una scheda sconosciuta, illeggibile o i dati bloccati aprono Forma e carico', () => {
    store.set('biketr_ui', '{"analysisTab":"meteo"}');
    expect(loadAnalysisTab()).toBe('forma');
    store.set('biketr_ui', '{"analysisTab":"so');
    expect(loadAnalysisTab()).toBe('forma');
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => {},
    });
    expect(loadAnalysisTab()).toBe('forma');
    expect(saveAnalysisTab('segmenti')).toBe(false);
  });
});

describe('vista di Attività', () => {
  it('senza scelta salvata apre le card; la scelta vale alla ricarica', () => {
    expect(loadActivitiesView()).toBe('cards');
    saveActivitiesView('table');
    expect(loadActivitiesView()).toBe('table');
  });

  it('tema, scheda di Analisi e vista stanno insieme: salvarne una non cancella le altre', () => {
    saveThemeChoice('dark');
    saveAnalysisTab('soglie');
    saveActivitiesView('table');
    expect([loadThemeChoice(), loadAnalysisTab(), loadActivitiesView()]).toEqual(['dark', 'soglie', 'table']);
  });

  it('una vista sconosciuta, illeggibile o i dati bloccati aprono le card', () => {
    store.set('biketr_ui', '{"activitiesView":"mappa"}');
    expect(loadActivitiesView()).toBe('cards');
    store.set('biketr_ui', '{"activitiesView":"ta');
    expect(loadActivitiesView()).toBe('cards');
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => {},
    });
    expect(loadActivitiesView()).toBe('cards');
    expect(saveActivitiesView('table')).toBe(false);
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
