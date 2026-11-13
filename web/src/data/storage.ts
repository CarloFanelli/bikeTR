// I valori che l'app salva. I dati dell'atleta (impostazioni, calendario, FTP, mesociclo,
// segmenti, durata del Coach) stanno sul server e si leggono dalla copia in memoria di
// data/athlete-data.ts; un salvataggio risponde se il server l'ha preso. Le scelte di questo
// browser (tema, scheda di Analisi, vista di Attività) e gli stream restano in localStorage,
// con i nomi e i formati di sempre (README, sezione 7). Un valore illeggibile non blocca l'app:
// vale il default.

import { isObject } from '../core/athlete-data.ts';
import { type FtpPoint, nextFtpHistory } from '../core/ftp.ts';
import type { HrProfile } from '../core/hr.ts';
import { type Mesocycle, withFtpPoint } from '../core/meso.ts';
import type { SegmentCache } from '../core/segments.ts';
import type { Settings } from '../core/settings.ts';
import type { Activity, StreamMetrics } from '../core/strava-types.ts';
import { readAthleteData, writeAthleteData } from './athlete-data.ts';
import type { CoachAnswer } from './coach.ts';

// Metriche di un'attività calcolate dai suoi stream, o l'errore del download.
type StreamsCacheEntry = (StreamMetrics & { _fetched: number; _error?: undefined }) | { _error: string; _fetched: number };
type StreamsCache = Record<string, StreamsCacheEntry>;

const STREAMS_CACHE = 'biketr_streams_cache';
const UI = 'biketr_ui';

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

// Un dato dell'atleta dalla copia in memoria; mancante o di una forma inattesa, il default.
// Una copia, così chi la cambia non tocca la memoria prima di salvarla.
function athleteValue<T>(key: Parameters<typeof readAthleteData>[0], fallback: T, valid: (x: unknown) => boolean): T {
  const value = readAthleteData(key);
  return valid(value) ? structuredClone(value) as T : fallback;
}

export const loadSettings = (): Settings => athleteValue<Settings>('settings', {}, isObject);
export const saveSettings = (s: Settings): Promise<CoachAnswer<null>> => writeAthleteData('settings', s);

export const loadPlannedRests = (): string[] => athleteValue<string[]>('plannedRests', [], Array.isArray);
export const loadRainyDays = (): string[] => athleteValue<string[]>('rainyDays', [], Array.isArray);

// Stato di un giorno del calendario: normale → saltato → pioggia → normale.
export async function cycleDayState(iso: string): Promise<CoachAnswer<null>> {
  const skips = loadPlannedRests();
  const rainy = loadRainyDays();
  const si = skips.indexOf(iso);
  const ri = rainy.indexOf(iso);
  if (si < 0 && ri < 0) return writeAthleteData('plannedRests', [...skips, iso]);
  if (si >= 0) {
    const [rests, rain] = await Promise.all([
      writeAthleteData('plannedRests', skips.filter(d => d !== iso)), writeAthleteData('rainyDays', [...rainy, iso]),
    ]);
    // Uno solo salvato: anche l'altro torna com'era, così il giorno resta saltato.
    if (rests.ok && !rain.ok) await writeAthleteData('plannedRests', skips);
    if (!rests.ok && rain.ok) await writeAthleteData('rainyDays', rainy);
    return rests.ok ? rain : rests;
  }
  rainy.splice(ri, 1);
  return writeAthleteData('rainyDays', rainy);
}

export const loadStreamsCache = (): StreamsCache => safeLoad<StreamsCache>(STREAMS_CACHE, {}, isObject);
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
export const loadSegmentCache = (): SegmentCache => athleteValue<SegmentCache>('segmentCache', {}, isObject);
export const saveSegmentCache = (cache: SegmentCache): Promise<CoachAnswer<null>> => writeAthleteData('segmentCache', cache);
export const clearSegmentCache = (): Promise<CoachAnswer<null>> => writeAthleteData('segmentCache', {});

// Durata dell'ultimo workout chiesto al Coach.
interface CoachSettings {
  lastDuration?: number;
}

export const loadCoachSettings = (): CoachSettings => athleteValue<CoachSettings>('coachSettings', {}, isObject);

// Aggiorna solo i valori passati, senza cancellare gli altri.
export const saveCoachSettings = (changes: CoachSettings): Promise<CoachAnswer<null>> =>
  writeAthleteData('coachSettings', { ...loadCoachSettings(), ...changes });

// Le scelte dell'interfaccia (tema, scheda di Analisi) stanno insieme sotto biketr_ui:
// ogni salvataggio cambia solo la sua voce e tiene le altre.
const loadUi = () => safeLoad<Record<string, unknown>>(UI, {}, isObject);
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
export const loadFtpHistory = (): FtpPoint[] => athleteValue<FtpPoint[]>('ftpHistory', [], Array.isArray);

// Il mesociclo in corso (vedi nextMesocycle); null prima della prima apertura dell'app.
export const loadMesocycle = (): Mesocycle | null => athleteValue<Mesocycle | null>('mesocycle', null, isObject);
export const saveMesocycle = (meso: Mesocycle): Promise<CoachAnswer<null>> => writeAthleteData('mesocycle', meso);

// Il punto FTP di oggi, dato FTP e soglia di adesso: nello storico (al massimo uno ogni
// 5 giorni) e, se c'è un mesociclo, in fondo ai suoi ultimi 20.
export async function recordFtpPoint(profile: HrProfile, now: Date): Promise<CoachAnswer<null>> {
  const history = nextFtpHistory(loadFtpHistory(), profile, now);
  if (!history) return { ok: true, value: null };
  const saves = [writeAthleteData('ftpHistory', history)];
  const meso = loadMesocycle();
  if (meso) {
    const { date, ftp } = history[history.length - 1];
    saves.push(saveMesocycle(withFtpPoint(meso, date, ftp)));
  }
  const saved = await Promise.all(saves);
  return saved.find(a => !a.ok) ?? saved[0];
}

// Le versioni prima di Docker salvavano nel browser client secret e token Strava
// (e, se il JSON era rotto, una copia ".broken"): vanno cancellati.
export function purgeLegacyStrava(): void {
  localStorage.removeItem('biketr_strava');
  localStorage.removeItem('biketr_strava.broken');
}
