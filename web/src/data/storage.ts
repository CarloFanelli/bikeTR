// Valori salvati nel browser (localStorage), con i nomi e i formati di sempre
// (README, sezione 7). Un valore illeggibile non blocca l'app: vale il default.

import { type FtpPoint, nextFtpHistory } from '../core/ftp.ts';
import type { HrProfile } from '../core/hr.ts';
import { type Mesocycle, withFtpPoint } from '../core/meso.ts';
import type { SegmentCache } from '../core/segments.ts';
import type { Settings } from '../core/settings.ts';
import type { Activity, StreamMetrics } from '../core/strava-types.ts';

// Metriche di un'attività calcolate dai suoi stream, o l'errore del download.
type StreamsCacheEntry = (StreamMetrics & { _fetched: number; _error?: undefined }) | { _error: string; _fetched: number };
type StreamsCache = Record<string, StreamsCacheEntry>;

const SETTINGS = 'biketr_settings';
const PLANNED_RESTS = 'biketr_planned_rests';
const RAINY_DAYS = 'biketr_rainy_days';
const STREAMS_CACHE = 'biketr_streams_cache';
const FTP_HISTORY = 'biketr_ftp_history';
const MESOCYCLE = 'biketr_mesocycle';
const UI = 'biketr_ui';
const SEGMENTS_CACHE = 'biketr_segments_cache_v2';
const COACH_SETTINGS = 'biketr_coach_settings';

// Chiave assente o dati del browser bloccati (alcune finestre private): `fallback`, senza log.
// JSON illeggibile o rifiutato da `validator`: copia in "<chiave>.broken", avviso in
// console e `fallback`. Non lancia mai.
export function safeLoad<T>(key: string, fallback: T, validator?: (x: unknown) => boolean): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw == null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validator && !validator(parsed)) throw new Error('validator-rejected');
    return parsed as T;
  } catch (e) {
    try { localStorage.setItem(key + '.broken', raw); } catch { /* quota */ }
    console.warn(`[storage] ${key} corrotto (${(e as Error).message}). Fallback ai default. Backup in ${key}.broken`);
    return fallback;
  }
}

export function safeSave(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[storage] saveSet failed for ${key}: ${(e as Error).message}`);
    return false;
  }
}

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);

export const loadSettings = (): Settings => safeLoad<Settings>(SETTINGS, {}, isPlainObject);
export const saveSettings = (s: Settings): boolean => safeSave(SETTINGS, s);

export const loadPlannedRests = (): string[] => safeLoad<string[]>(PLANNED_RESTS, [], Array.isArray);
const savePlannedRests = (days: string[]): boolean => safeSave(PLANNED_RESTS, days);

export const loadRainyDays = (): string[] => safeLoad<string[]>(RAINY_DAYS, [], Array.isArray);
const saveRainyDays = (days: string[]): boolean => safeSave(RAINY_DAYS, days);

// Stato di un giorno del calendario: normale → saltato → pioggia → normale.
export function cycleDayState(iso: string): void {
  const skips = loadPlannedRests();
  const rainy = loadRainyDays();
  const si = skips.indexOf(iso);
  const ri = rainy.indexOf(iso);
  if (si < 0 && ri < 0) {
    skips.push(iso);
    savePlannedRests(skips);
  } else if (si >= 0) {
    skips.splice(si, 1);
    savePlannedRests(skips);
    rainy.push(iso);
    saveRainyDays(rainy);
  } else {
    rainy.splice(ri, 1);
    saveRainyDays(rainy);
  }
}

export const loadStreamsCache = (): StreamsCache => safeLoad<StreamsCache>(STREAMS_CACHE, {}, isPlainObject);
export const saveStreamsCache = (cache: StreamsCache): boolean => safeSave(STREAMS_CACHE, cache);

// Rimette sulle attività le metriche degli stream già scaricati (di default quelli salvati);
// i download falliti restano fuori.
export function applyCachedStreams(activities: Activity[], cache: StreamsCache = loadStreamsCache()): void {
  for (const a of activities) {
    const entry = cache[a.id];
    if (entry && !entry._error) a._metrics = entry as StreamMetrics;
  }
}

// Segmenti preferiti con i tentativi già scaricati, per segmento.
export const loadSegmentCache = (): SegmentCache => safeLoad<SegmentCache>(SEGMENTS_CACHE, {}, isPlainObject);
export const saveSegmentCache = (cache: SegmentCache): boolean => safeSave(SEGMENTS_CACHE, cache);
export const clearSegmentCache = (): void => localStorage.removeItem(SEGMENTS_CACHE);

// Durata dell'ultimo workout chiesto al Coach.
interface CoachSettings {
  lastDuration?: number;
}

export function loadCoachSettings(): CoachSettings {
  const s = safeLoad<CoachSettings & { endpoint?: unknown; model?: unknown }>(COACH_SETTINGS, {}, isPlainObject);
  // Le versioni precedenti salvavano anche l'indirizzo di Ollama e il modello: ora li
  // sceglie il .env del servizio Coach, e un nome rimasto qui non deve comparire da nessuna parte.
  if ('endpoint' in s || 'model' in s) {
    delete s.endpoint;
    delete s.model;
    safeSave(COACH_SETTINGS, s);
  }
  return s;
}

// Aggiorna solo i valori passati, senza cancellare gli altri.
export const saveCoachSettings = (changes: CoachSettings): boolean =>
  safeSave(COACH_SETTINGS, { ...loadCoachSettings(), ...changes });

// Le scelte dell'interfaccia (tema, scheda di Analisi) stanno insieme sotto biketr_ui:
// ogni salvataggio cambia solo la sua voce e tiene le altre.
const loadUi = () => safeLoad<Record<string, unknown>>(UI, {}, isPlainObject);
const saveUi = (changes: Record<string, unknown>): boolean => safeSave(UI, { ...loadUi(), ...changes });

// Tema scelto dall'atleta; "system" segue il chiaro o scuro del computer. Un valore
// senza tema (quello della vecchia barra laterale) o sconosciuto vale "system".
export type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_CHOICES: readonly string[] = ['system', 'light', 'dark'];

export function loadThemeChoice(): ThemeChoice {
  const { theme } = loadUi();
  return typeof theme === 'string' && THEME_CHOICES.includes(theme) ? theme as ThemeChoice : 'system';
}
export const saveThemeChoice = (theme: ThemeChoice): boolean => saveUi({ theme });

// La scheda di Analisi aperta per ultima; senza una scelta leggibile, Forma e carico.
export type AnalysisTab = 'forma' | 'potenza' | 'soglie' | 'segmenti' | 'profilo';
const ANALYSIS_TABS: readonly string[] = ['forma', 'potenza', 'soglie', 'segmenti', 'profilo'];

export function loadAnalysisTab(): AnalysisTab {
  const { analysisTab } = loadUi();
  return typeof analysisTab === 'string' && ANALYSIS_TABS.includes(analysisTab) ? analysisTab as AnalysisTab : 'forma';
}
export const saveAnalysisTab = (tab: AnalysisTab): boolean => saveUi({ analysisTab: tab });

// La vista di Attività scelta per ultima, card o tabella; senza una scelta leggibile, le card.
export type ActivitiesView = 'cards' | 'table';

export function loadActivitiesView(): ActivitiesView {
  const { activitiesView } = loadUi();
  return activitiesView === 'table' ? 'table' : 'cards';
}
export const saveActivitiesView = (view: ActivitiesView): boolean => saveUi({ activitiesView: view });

// Un punto alla settimana, al massimo 52 (vedi nextFtpHistory).
export const loadFtpHistory = (): FtpPoint[] => safeLoad<FtpPoint[]>(FTP_HISTORY, [], Array.isArray);
const saveFtpHistory = (history: FtpPoint[]): boolean => safeSave(FTP_HISTORY, history);

// Il mesociclo in corso (vedi nextMesocycle); null prima della prima apertura dell'app.
export const loadMesocycle = (): Mesocycle | null =>
  safeLoad<Mesocycle | null>(MESOCYCLE, null, (x) => x === null || (typeof x === 'object' && !Array.isArray(x)));
export const saveMesocycle = (meso: Mesocycle): boolean => safeSave(MESOCYCLE, meso);

// Il punto FTP di oggi, dato FTP e soglia di adesso: nello storico (al massimo uno ogni
// 5 giorni) e, se c'è un mesociclo, in fondo ai suoi ultimi 20.
export function recordFtpPoint(profile: HrProfile, now: Date): void {
  const history = nextFtpHistory(loadFtpHistory(), profile, now);
  if (!history) return;
  saveFtpHistory(history);
  const meso = loadMesocycle();
  if (meso) {
    const { date, ftp } = history[history.length - 1];
    saveMesocycle(withFtpPoint(meso, date, ftp));
  }
}

// Le versioni prima di Docker salvavano nel browser client secret e token Strava
// (e, se il JSON era rotto, una copia ".broken"): vanno cancellati.
export function purgeLegacyStrava(): void {
  localStorage.removeItem('biketr_strava');
  localStorage.removeItem('biketr_strava.broken');
}
