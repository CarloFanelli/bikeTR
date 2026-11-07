// Condiviso tra index e pagina dettaglio. Strava, server di autenticazione, valori
// salvati nel browser, formattazione e metriche degli stream stanno in src/: qui
// restano i nomi che usa il codice di oggi.
import { APP_CONFIG } from './constants.js';
import { dayOffsetIso as dayOffsetFrom } from './src/core/dates.ts';
import { isoDay } from './src/core/format.ts';
import { computeStreamsMetrics } from './src/core/streams.ts';
import { AuthError } from './src/data/auth.ts';
import { loadStreamsCache, saveStreamsCache } from './src/data/storage.ts';
import { fetchActivityStreams } from './src/data/strava.ts';

export { APP_CONFIG, computeStreamsMetrics };
export { fmtKm, fmtTime, fmtDate, isoDay, TYPE_EMOJI } from './src/core/format.ts';
export { AuthError, authCallbackMessage, getAuthStatus, logout } from './src/data/auth.ts';
export {
  safeLoad, safeSave, isPlainObject, loadSettings, saveSettings, loadPlannedRests,
  loadRainyDays, cycleDayState, loadStreamsCache, saveStreamsCache, purgeLegacyStrava, applyCachedStreams,
} from './src/data/storage.ts';
export {
  fetchAthlete, fetchAthleteStats, fetchActivities, fetchActivity, fetchStarredSegments,
  fetchSegmentEfforts, fetchActivityStreams,
} from './src/data/strava.ts';

export function todayIso() { return isoDay(new Date()); }
export const dayOffsetIso = (n) => dayOffsetFrom(n, new Date());

// Hydration opt-in: chiama questa per arricchire attività con streams (costo API).
// Senza accesso a Strava (non collegato, server di autenticazione spento) salva
// quanto scaricato, si ferma e lancia l'errore, invece di segnarlo su ogni attività.
export async function hydrateWithStreams(activities, ftp, lthr, maxFetch = APP_CONFIG.maxStreamsFetch, onProgress) {
  const cache = loadStreamsCache();
  const bikes = activities.filter(a => a.type?.includes('Ride')).slice(0, maxFetch);
  const toFetch = bikes.filter(a => !cache[a.id] || cache[a.id]._error);
  let done = 0;
  for (const a of toFetch) {
    try {
      const streams = await fetchActivityStreams(a.id);
      cache[a.id] = { ...computeStreamsMetrics(streams, ftp, lthr), _fetched: Date.now() };
    } catch (e) {
      if (e instanceof AuthError) {
        saveStreamsCache(cache);
        throw e;
      }
      cache[a.id] = { _error: e.message, _fetched: Date.now() };
    }
    done++;
    if (onProgress) onProgress(done, toFetch.length);
  }
  saveStreamsCache(cache);
  activities.forEach(a => {
    if (cache[a.id] && !cache[a.id]._error) a._metrics = cache[a.id];
  });
  return { fetched: toFetch.length, totalCached: Object.keys(cache).length };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
export const BIKE_TYPES = new Set(['Ride','VirtualRide','EBikeRide','MountainBikeRide','GravelRide']);
