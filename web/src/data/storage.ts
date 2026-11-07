// Valori salvati nel browser (localStorage), con i nomi e i formati di sempre
// (README, sezione 7). Un valore illeggibile non blocca l'app: vale il default.

import type { FtpPoint } from '../core/ftp.ts';
import type { Mesocycle } from '../core/meso.ts';
import type { Settings } from '../core/settings.ts';
import type { Activity, StreamMetrics } from '../core/strava-types.ts';

export type { Settings };

// Metriche di un'attività calcolate dai suoi stream, o l'errore del download.
export type StreamsCacheEntry = (StreamMetrics & { _fetched: number; _error?: undefined }) | { _error: string; _fetched: number };
export type StreamsCache = Record<string, StreamsCacheEntry>;

const SETTINGS = 'biketr_settings';
const PLANNED_RESTS = 'biketr_planned_rests';
const RAINY_DAYS = 'biketr_rainy_days';
const STREAMS_CACHE = 'biketr_streams_cache';
const FTP_HISTORY = 'biketr_ftp_history';
const MESOCYCLE = 'biketr_mesocycle';
const UI = 'biketr_ui';

// Chiave assente: `fallback`, senza log. JSON illeggibile o rifiutato da `validator`:
// copia in "<chiave>.broken", avviso in console e `fallback`. Non lancia mai.
export function safeLoad<T>(key: string, fallback: T, validator?: (x: unknown) => boolean): T {
  const raw = localStorage.getItem(key);
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

export const isPlainObject = (x: unknown): x is Record<string, unknown> =>
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

// Rimette sulle attività le metriche degli stream già scaricati; i download falliti restano fuori.
export function applyCachedStreams(activities: Activity[]): void {
  const cache = loadStreamsCache();
  for (const a of activities) {
    const entry = cache[a.id];
    if (entry && !entry._error) a._metrics = entry as StreamMetrics;
  }
}

// Barra laterale della nuova app ridotta a icone; senza una scelta leggibile resta espansa.
export const loadSidebarCollapsed = (): boolean =>
  safeLoad<{ sidebarCollapsed?: unknown }>(UI, {}, isPlainObject).sidebarCollapsed === true;
export const saveSidebarCollapsed = (collapsed: boolean): boolean => safeSave(UI, { sidebarCollapsed: collapsed });

// Un punto alla settimana, al massimo 52 (vedi nextFtpHistory).
export const loadFtpHistory = (): FtpPoint[] => safeLoad<FtpPoint[]>(FTP_HISTORY, [], Array.isArray);
export const saveFtpHistory = (history: FtpPoint[]): boolean => safeSave(FTP_HISTORY, history);

// Il mesociclo in corso (vedi nextMesocycle); null prima della prima apertura della tab Allenamento.
export const loadMesocycle = (): Mesocycle | null =>
  safeLoad<Mesocycle | null>(MESOCYCLE, null, (x) => x === null || (typeof x === 'object' && !Array.isArray(x)));
export const saveMesocycle = (meso: Mesocycle): boolean => safeSave(MESOCYCLE, meso);

// Le versioni prima di Docker salvavano nel browser client secret e token Strava
// (e, se il JSON era rotto, una copia ".broken"): vanno cancellati.
export function purgeLegacyStrava(): void {
  localStorage.removeItem('biketr_strava');
  localStorage.removeItem('biketr_strava.broken');
}
