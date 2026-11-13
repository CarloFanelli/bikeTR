import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../src/core/strava-types.ts';
import {
  applyCachedStreams, clearSegmentCache, cycleDayState, loadCoachSettings, loadPlannedRests, loadRainyDays,
  loadSegmentCache, loadSettings, loadStreamsCache, purgeLegacyStrava, recordFtpPoint, safeLoad,
  safeSave,
  saveCoachSettings, saveSegmentCache, saveSettings, loadThemeChoice, saveThemeChoice,
  loadActivitiesView, loadAnalysisTab, saveActivitiesView, saveAnalysisTab,
} from '../../src/data/storage.ts';
import { athleteServer } from './athlete-server.ts';

// localStorage simulato, ispezionabile dal test.
let store: Map<string, string>;

beforeEach(async () => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await athleteServer();
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

  it('i dati dell\'atleta vengono dal server, gli stream dal browser con la chiave di sempre', async () => {
    await athleteServer({
      settings: { hrMax: 190, weeklyHours: 8, lthrSource: 'declared', availableDays: [1, 3, 6] },
      plannedRests: ['2026-11-06'], rainyDays: ['2026-11-07'],
    });
    store.set('biketr_streams_cache', '{"123":{"NP":210,"TSS":80,"_fetched":1},"124":{"_error":"x","_fetched":2}}');
    expect(loadSettings()).toEqual({ hrMax: 190, weeklyHours: 8, lthrSource: 'declared', availableDays: [1, 3, 6] });
    expect(loadPlannedRests()).toEqual(['2026-11-06']);
    expect(loadRainyDays()).toEqual(['2026-11-07']);
    expect(loadStreamsCache()).toEqual({ 123: { NP: 210, TSS: 80, _fetched: 1 }, 124: { _error: 'x', _fetched: 2 } });
  });

  it('un salvataggio va al server e si legge subito', async () => {
    const server = await athleteServer();
    expect(await saveSettings({ hrMax: 185, weeklyDays: 4 })).toEqual({ ok: true, value: null });
    expect(server.saved.get('settings')).toEqual({ hrMax: 185, weeklyDays: 4 });
    expect(loadSettings()).toEqual({ hrMax: 185, weeklyDays: 4 });
    expect(store.has('biketr_settings')).toBe(false);
  });

  it('un salvataggio che il server non prende lo dice e lascia il valore di prima', async () => {
    const server = await athleteServer({ settings: { hrMax: 190 } });
    server.failSaves = 503;
    const answer = await saveSettings({ hrMax: 150 });
    expect(answer).toMatchObject({ ok: false, msg: 'Salvataggio rifiutato' });
    expect(loadSettings()).toEqual({ hrMax: 190 });
    server.failSaves = 0;
    expect(await saveSettings({ hrMax: 150 })).toMatchObject({ ok: false, msg: expect.stringContaining('Coach non raggiungibile') });
    expect(loadSettings()).toEqual({ hrMax: 190 });
  });

  it('due salvataggi rifiutati di fila: resta il valore che il server ha davvero', async () => {
    const server = await athleteServer({ settings: { weight: 70 } });
    server.failSaves = 503;
    await Promise.all([saveSettings({ weight: 71 }), saveSettings({ weight: 72 })]);
    expect(loadSettings()).toEqual({ weight: 70 });
  });

  it('cambiare un valore letto non cambia quello salvato finché non si salva', async () => {
    await athleteServer({ plannedRests: ['2026-11-06'] });
    loadPlannedRests().push('2026-11-08');
    expect(loadPlannedRests()).toEqual(['2026-11-06']);
  });

  it('un valore dal server di una forma inattesa dà il default; uno stream rovinato lascia la copia .broken', async () => {
    await athleteServer({ settings: ['non', 'un oggetto'], plannedRests: { non: 'una lista' } });
    expect(loadSettings()).toEqual({});
    expect(loadPlannedRests()).toEqual([]);
    store.set('biketr_streams_cache', '{"1":');
    expect(loadStreamsCache()).toEqual({});
    expect(store.get('biketr_streams_cache.broken')).toBe('{"1":');
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

  it('un giorno passa da normale a saltato a pioggia e torna normale, salvato sul server', async () => {
    const server = await athleteServer();
    await cycleDayState('2026-11-06');
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([['2026-11-06'], []]);
    await cycleDayState('2026-11-06');
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([[], ['2026-11-06']]);
    expect([server.saved.get('plannedRests'), server.saved.get('rainyDays')]).toEqual([[], ['2026-11-06']]);
    await cycleDayState('2026-11-06');
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([[], []]);
  });

  it('un giorno non salvato lo dice e il calendario resta com\'era', async () => {
    const server = await athleteServer();
    server.failSaves = 500;
    expect((await cycleDayState('2026-11-06')).ok).toBe(false);
    expect(loadPlannedRests()).toEqual([]);
  });

  it('da saltato a pioggia, se il server prende solo uno dei due: il giorno resta saltato', async () => {
    const server = await athleteServer({ plannedRests: ['2026-11-06'] });
    server.failKey = 'rainyDays';
    expect((await cycleDayState('2026-11-06')).ok).toBe(false);
    expect([loadPlannedRests(), loadRainyDays()]).toEqual([['2026-11-06'], []]);
    expect(server.saved.get('plannedRests')).toEqual(['2026-11-06']);
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
  it('salvare la durata la ricorda per la prossima volta, sul server', async () => {
    const server = await athleteServer();
    await saveCoachSettings({ lastDuration: 90 });
    expect(server.saved.get('coachSettings')).toEqual({ lastDuration: 90 });
    expect(loadCoachSettings()).toEqual({ lastDuration: 90 });
  });
});

describe('segmenti preferiti già scaricati', () => {
  it('si leggono, si salvano e si svuotano sul server', async () => {
    const server = await athleteServer();
    expect(loadSegmentCache()).toEqual({});
    await saveSegmentCache({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } as never } });
    expect(server.saved.get('segmentCache')).toEqual({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } } });
    expect(loadSegmentCache()).toEqual({ 12: { efforts: [], _fetched: 1, _segment: { distance: 1200 } } });
    await clearSegmentCache();
    expect(server.saved.get('segmentCache')).toEqual({});
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

  it('si aggiunge allo storico e in fondo agli ultimi 20 del mesociclo', async () => {
    const server = await athleteServer({
      ftpHistory: [{ date: '2026-10-30', ftp: 245, source: 'declared' }],
      mesocycle: { blockId: 'base', ftpHistory: [{ date: '2026-10-30', ftp: 245 }] },
    });
    await recordFtpPoint(profile, now);
    expect(server.saved.get('ftpHistory')).toEqual([
      { date: '2026-10-30', ftp: 245, source: 'declared' }, { date: '2026-11-07', ftp: 250, source: 'declared' },
    ]);
    expect((server.saved.get('mesocycle') as { ftpHistory: unknown }).ftpHistory).toEqual([
      { date: '2026-10-30', ftp: 245 }, { date: '2026-11-07', ftp: 250 },
    ]);
  });

  it('meno di 5 giorni dall\'ultimo punto: non si salva niente', async () => {
    const server = await athleteServer({ ftpHistory: [{ date: '2026-11-04', ftp: 245, source: 'declared' }] });
    await recordFtpPoint(profile, now);
    expect(server.requests).toEqual([]);
  });
});
