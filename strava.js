// Condiviso tra index e pagina dettaglio: token dal server di autenticazione + fetch API.
import { APP_CONFIG, PHYSIO } from './constants.js';
export { APP_CONFIG };

const SETTINGS = 'biketr_settings';

// safeLoad/safeSave: parsing localStorage difensivo.
// - Se la chiave manca, ritorna `fallback` (non logga).
// - Se il parsing fallisce o il validator rifiuta, salva backup ".broken",
//   logga warning e ritorna `fallback`. Mai throw.
export function safeLoad(key, fallback, validator) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (validator && !validator(parsed)) throw new Error('validator-rejected');
    return parsed;
  } catch (e) {
    try { localStorage.setItem(key + '.broken', raw); } catch { /* quota */ }
    console.warn(`[storage] ${key} corrotto (${e.message}). Fallback ai default. Backup in ${key}.broken`);
    return fallback;
  }
}
export function safeSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn(`[storage] saveSet failed for ${key}: ${e.message}`); return false; }
}
export const isPlainObject = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function loadSettings() { return safeLoad(SETTINGS, {}, isPlainObject); }
export function saveSettings(s) { safeSave(SETTINGS, s); }

const PLANNED_RESTS = 'biketr_planned_rests';
export function loadPlannedRests() { return safeLoad(PLANNED_RESTS, [], Array.isArray); }
export function savePlannedRests(arr) { safeSave(PLANNED_RESTS, arr); }

export function isoDay(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,'0');
  const day = String(x.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export function todayIso() { return isoDay(new Date()); }
export function dayOffsetIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
// ---- Cache streams (metriche derivate per attività, non i dati grezzi) ----
const STREAMS_CACHE = 'biketr_streams_cache';
export function loadStreamsCache() { return safeLoad(STREAMS_CACHE, {}, isPlainObject); }
export function saveStreamsCache(c) { safeSave(STREAMS_CACHE, c); }

export async function fetchActivityStreams(activityId, token) {
  const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,heartrate,watts,cadence&key_by_type=true`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('streams ' + activityId + ': ' + res.status);
  return res.json();
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

// Hydration opt-in: chiama questa per arricchire attività con streams (costo API)
export async function hydrateWithStreams(activities, token, ftp, lthr, maxFetch = APP_CONFIG.maxStreamsFetch, onProgress) {
  const cache = loadStreamsCache();
  const bikes = activities.filter(a => a.type?.includes('Ride')).slice(0, maxFetch);
  const toFetch = bikes.filter(a => !cache[a.id] || cache[a.id]._error);
  let done = 0;
  for (const a of toFetch) {
    try {
      const streams = await fetchActivityStreams(a.id, token);
      cache[a.id] = { ...computeStreamsMetrics(streams, ftp, lthr), _fetched: Date.now() };
    } catch (e) {
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

export function togglePlannedRest(iso) {
  const arr = loadPlannedRests();
  const i = arr.indexOf(iso);
  if (i >= 0) arr.splice(i, 1); else arr.push(iso);
  savePlannedRests(arr);
  return arr;
}

const RAINY_DAYS = 'biketr_rainy_days';
export function loadRainyDays() { return safeLoad(RAINY_DAYS, [], Array.isArray); }
export function saveRainyDays(arr) { safeSave(RAINY_DAYS, arr); }

// Ciclo stato giorno: normale → skip → pioggia → normale
export function cycleDayState(iso) {
  const skips = loadPlannedRests();
  const rainy = loadRainyDays();
  const si = skips.indexOf(iso);
  const ri = rainy.indexOf(iso);
  if (si < 0 && ri < 0) {
    skips.push(iso); savePlannedRests(skips);
  } else if (si >= 0) {
    skips.splice(si, 1); savePlannedRests(skips);
    rainy.push(iso); saveRainyDays(rainy);
  } else {
    rainy.splice(ri, 1); saveRainyDays(rainy);
  }
}

// ---- Server di autenticazione (/auth/, dietro nginx) ----
// Tiene client secret e refresh token; il browser riceve solo token di accesso.

const AUTH_ERRORS = {
  unreachable: 'Server di autenticazione non raggiungibile. Controlla i log con: docker compose logs auth',
  not_connected: 'Non connesso a Strava.',
  strava_unreachable: 'Strava non raggiungibile per rinnovare l\'accesso. Riprova tra poco.',
};

// `code` dice al chiamante cosa fare: 'not_connected' → mostrare "Collega Strava".
class AuthError extends Error {
  constructor(code) {
    super(AUTH_ERRORS[code] || `Errore del server di autenticazione (${code})`);
    this.code = code;
  }
}

async function authJson(path) {
  let res, body;
  try {
    res = await fetch(path);
    body = await res.json();
  } catch {
    // Rete giù o risposta non JSON (nginx risponde 502 se il servizio è spento).
    throw new AuthError('unreachable');
  }
  if (!res.ok) throw new AuthError(body.error);
  return body;
}

// { missing: impostazioni .env mancanti, connected }
export const getAuthStatus = () => authJson('/auth/status');

// Token di accesso valido almeno un altro minuto (il server lo rinnova quando serve).
// Un lavoro lungo lo chiede a ogni richiesta: un token tenuto a lungo scade.
export async function getAccessToken() {
  return (await authJson('/auth/token')).access_token;
}

// La versione precedente salvava nel browser client secret e token Strava (e,
// se il JSON era rotto, una copia ".broken"): vanno cancellati.
export function purgeLegacyStrava() {
  localStorage.removeItem('biketr_strava');
  localStorage.removeItem('biketr_strava.broken');
}

export async function api(path, token) {
  const res = await fetch('https://www.strava.com/api/v3' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('API ' + path + ': ' + res.status);
  return res.json();
}

export function fmtKm(m) { return (m / 1000).toFixed(1) + ' km'; }
export function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
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
