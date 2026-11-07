// Condiviso tra index e pagina dettaglio. Strava, server di autenticazione, valori
// salvati nel browser, formattazione e metriche degli stream stanno in src/: qui
// restano i nomi che usa il codice di oggi.
import { APP_CONFIG } from './constants.js';
import { dayOffsetIso as dayOffsetFrom } from './src/core/dates.ts';
import { isoDay } from './src/core/format.ts';

export { APP_CONFIG };
export { fmtKm, fmtTime, fmtDate, isoDay, TYPE_EMOJI } from './src/core/format.ts';
export { AuthError, authCallbackMessage, getAuthStatus, logout } from './src/data/auth.ts';
export {
  safeLoad, safeSave, isPlainObject, loadSettings, saveSettings, loadPlannedRests,
  loadRainyDays, cycleDayState, purgeLegacyStrava, applyCachedStreams,
} from './src/data/storage.ts';
export {
  fetchAthlete, fetchAthleteStats, fetchActivities, fetchActivity, fetchStarredSegments, fetchSegmentEfforts,
} from './src/data/strava.ts';
export { hydrateWithStreams } from './src/data/streams.ts';

export function todayIso() { return isoDay(new Date()); }
export const dayOffsetIso = (n) => dayOffsetFrom(n, new Date());

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
export const BIKE_TYPES = new Set(['Ride','VirtualRide','EBikeRide','MountainBikeRide','GravelRide']);
