// Condiviso tra index e pagina dettaglio. Strava, server di autenticazione, valori
// salvati nel browser e formattazione stanno in src/: qui restano i nomi che usa il
// codice di oggi, più le metriche degli stream.
import { APP_CONFIG, PHYSIO } from './constants.js';
import { isoDay } from './src/core/format.ts';
import { AuthError } from './src/data/auth.ts';
import { loadStreamsCache, saveStreamsCache } from './src/data/storage.ts';
import { fetchActivityStreams } from './src/data/strava.ts';

export { APP_CONFIG };
export { fmtKm, fmtTime, fmtDate, isoDay } from './src/core/format.ts';
export { AuthError, getAuthStatus, logout } from './src/data/auth.ts';
export {
  safeLoad, safeSave, isPlainObject, loadSettings, saveSettings, loadPlannedRests,
  loadRainyDays, cycleDayState, loadStreamsCache, saveStreamsCache, purgeLegacyStrava,
} from './src/data/storage.ts';
export {
  fetchAthlete, fetchAthleteStats, fetchActivities, fetchActivity, fetchStarredSegments,
  fetchSegmentEfforts, fetchActivityStreams,
} from './src/data/strava.ts';

export function todayIso() { return isoDay(new Date()); }
export function dayOffsetIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

// NP = ((rolling30s^4 avg))^(1/4); IF = NP/FTP; TSS = (seconds × NP × IF) / (FTP × 3600) × 100
export function computeStreamsMetrics(streams, ftp, lthr) {
  const out = {};
  const w = streams.watts?.data;
  const h = streams.heartrate?.data;

  if (w && w.length && ftp) {
    const win = 30;
    let sum = 0;
    const roll = [];
    for (let i = 0; i < w.length; i++) {
      sum += w[i];
      if (i >= win) sum -= w[i - win];
      if (i >= win - 1) roll.push(sum / win);
    }
    const mean4 = roll.reduce((s, r) => s + r*r*r*r, 0) / Math.max(1, roll.length);
    const np = Math.pow(mean4, 0.25);
    const seconds = w.length;
    const IF = np / ftp;
    const TSS = (seconds * np * IF) / (ftp * 3600) * 100;
    out.NP = Math.round(np);
    out.IF = +IF.toFixed(3);
    out.TSS = Math.round(TSS);
  }

  if (h && h.length && lthr) {
    // Time-in-zone rispetto a LTHR (zone Coggan/Friel)
    const z = [0,0,0,0,0];
    const [z2lo, z2hi] = PHYSIO.Z2_PCT_LTHR;
    const z3hi = PHYSIO.Z3_PCT_LTHR[1];
    const z4hi = PHYSIO.Z4_PCT_LTHR[1];
    h.forEach(hr => {
      const r = hr / lthr;
      const idx = r < z2lo ? 0 : r < z2hi ? 1 : r < z3hi ? 2 : r < z4hi ? 3 : 4;
      z[idx]++;
    });
    out.hrZones = z;
    const avgHR = h.reduce((s, x) => s + x, 0) / h.length;
    const hours = h.length / 3600;
    out.hrTSS = Math.round(Math.pow(avgHR / lthr, 2) * hours * 100);
  }
  return out;
}

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

export function applyCachedStreams(activities) {
  const cache = loadStreamsCache();
  activities.forEach(a => {
    if (cache[a.id] && !cache[a.id]._error) a._metrics = cache[a.id];
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
export const TYPE_EMOJI = {
  Ride: '🚴', VirtualRide: '🚴', EBikeRide: '🚴',
  MountainBikeRide: '🚵', GravelRide: '🚵',
  Run: '🏃', VirtualRun: '🏃', TrailRun: '🏃',
  Swim: '🏊', Walk: '🚶', Hike: '🥾', Workout: '💪',
};
export const BIKE_TYPES = new Set(['Ride','VirtualRide','EBikeRide','MountainBikeRide','GravelRide']);
