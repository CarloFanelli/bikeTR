// Export di tutti gli allenamenti in JSON (per copia-incolla in Claude). Tre livelli:
//   - compact  : summary + metriche già salvate (nessuna richiesta in più)
//   - detailed : + /activities/:id (segment_efforts, splits, gear, description)
//   - max      : + stream grezzi (time, hr, watts, cadence, velocity, altitude, distance)
//
// Limiti di Strava: 100 richieste ogni 15 minuti, 1000 al giorno.

import { computeStreamsMetrics } from '../core/streams.ts';
import type { Settings } from '../core/settings.ts';
import type {
  Activity, ActivityDetail, Athlete, AthleteStats, StreamKey, StreamMetrics, Streams,
} from '../core/strava-types.ts';
import { AuthError } from './auth.ts';
import { loadStreamsCache, saveStreamsCache } from './storage.ts';
import { fetchActivities, fetchActivity, fetchActivityStreams } from './strava.ts';

export type ExportMode = 'compact' | 'detailed' | 'max';

// Una pausa tra richieste per stare sotto 100/15min con margine.
// 100 richieste in 900 s → 9 s a richiesta. Usiamo 10 s per sicurezza.
export const THROTTLE_MS = 10000;
const RATE_LIMIT_WAIT_MS = 60000;
const PAGE_SIZE = 200; // il massimo che Strava concede per /athlete/activities
const MAX_PAGES = 200;
// Stream completi: più serie di quelle che servono alle metriche.
const FULL_STREAM_KEYS: StreamKey[] = [
  'time', 'heartrate', 'watts', 'cadence', 'velocity_smooth', 'altitude', 'distance', 'temp', 'grade_smooth',
];
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'MountainBikeRide', 'GravelRide']);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Tutto lo storico, a pagine da 200.
export async function fetchAllActivities(onProgress?: (count: number, page: number) => void): Promise<Activity[]> {
  const all: Activity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchActivities(PAGE_SIZE, page);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    onProgress?.(all.length, page);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

// Prima e ultima data dello storico, "—" senza attività.
export function exportRange(all: Activity[]): { first: string; last: string } {
  const dates = all.map(a => a.start_date_local).filter(Boolean).sort();
  return { first: dates[0]?.slice(0, 10) || '—', last: dates[dates.length - 1]?.slice(0, 10) || '—' };
}

export interface ExportFilter {
  from: string;
  to: string;
  onlyRides: boolean;
}

// Periodo (date "AAAA-MM-GG", vuote = senza limite; `to` comprende tutto il giorno) e sport.
export function filterForExport(all: Activity[], { from, to, onlyRides }: ExportFilter): Activity[] {
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to + 'T23:59:59') : null;
  return all.filter(a => {
    const d = new Date(a.start_date_local);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return !onlyRides || BIKE_TYPES.has(a.type);
  });
}

// Richieste a Strava e minuti che servono per esportare `count` attività.
export function estimate(mode: ExportMode, count: number): { calls: number; minutes: number } {
  const calls = mode === 'detailed' ? count : mode === 'max' ? count * 2 : 0;
  return { calls, minutes: Math.ceil((calls * THROTTLE_MS) / 60000) };
}

export function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

const round = (n: number | undefined, digits: number): number | null => n != null ? +n.toFixed(digits) : null;

// Il summary di un'attività senza i campi rumorosi o ridondanti.
function slimSummary(a: Activity) {
  const m = a._metrics as (Activity['_metrics'] & { _error?: string }) | undefined;
  return {
    id: a.id, external_id: a.external_id, upload_id: a.upload_id, name: a.name, type: a.type,
    sport_type: a.sport_type, workout_type: a.workout_type, start_date: a.start_date,
    start_date_local: a.start_date_local, timezone: a.timezone,
    distance_m: a.distance, distance_km: round(a.distance != null ? a.distance / 1000 : undefined, 3),
    moving_time_s: a.moving_time, elapsed_time_s: a.elapsed_time,
    total_elevation_gain_m: a.total_elevation_gain, elev_high_m: a.elev_high, elev_low_m: a.elev_low,
    average_speed_ms: a.average_speed, max_speed_ms: a.max_speed,
    average_speed_kmh: round(a.average_speed != null ? a.average_speed * 3.6 : undefined, 2),
    max_speed_kmh: round(a.max_speed != null ? a.max_speed * 3.6 : undefined, 2),
    average_cadence: a.average_cadence, average_temp: a.average_temp,
    has_heartrate: a.has_heartrate, average_heartrate: a.average_heartrate, max_heartrate: a.max_heartrate,
    average_watts: a.average_watts, max_watts: a.max_watts, weighted_average_watts: a.weighted_average_watts,
    device_watts: a.device_watts, kilojoules: a.kilojoules, suffer_score: a.suffer_score, calories: a.calories,
    trainer: a.trainer, commute: a.commute, manual: a.manual, private: a.private,
    achievement_count: a.achievement_count, kudos_count: a.kudos_count, pr_count: a.pr_count, gear_id: a.gear_id,
    location_city: a.location_city, location_state: a.location_state, location_country: a.location_country,
    start_latlng: a.start_latlng, end_latlng: a.end_latlng, map_summary_polyline: a.map?.summary_polyline,
    computed_metrics: m && !m._error ? {
      np_watts: m.NP ?? null,
      intensity_factor: m.IF ?? null,
      tss: m.TSS ?? null,
      hr_tss: m.hrTSS ?? null,
      hr_zones_seconds: m.hrZones ?? null, // [Z1, Z2, Z3, Z4, Z5]
      source: 'streams_cache',
    } : null,
  };
}

// I campi del dettaglio che il summary non ha già.
function detailExtra(d: ActivityDetail) {
  return {
    description: d.description || null,
    device_name: d.device_name || null,
    gear: d.gear ? {
      id: d.gear.id, name: d.gear.name, brand_name: d.gear.brand_name, model_name: d.gear.model_name,
      frame_type: d.gear.frame_type, distance_m: d.gear.distance,
    } : null,
    photos_count: d.total_photo_count ?? null,
    splits_metric: (d.splits_metric || []).map(s => ({
      split: s.split, distance_m: s.distance, elapsed_time_s: s.elapsed_time, moving_time_s: s.moving_time,
      elevation_difference_m: s.elevation_difference, average_speed_ms: s.average_speed,
      average_heartrate: s.average_heartrate, pace_zone: s.pace_zone,
    })),
    laps: (d.laps || []).map(l => ({
      lap_index: l.lap_index, name: l.name, start_index: l.start_index, end_index: l.end_index,
      distance_m: l.distance, elapsed_time_s: l.elapsed_time, moving_time_s: l.moving_time,
      total_elevation_gain_m: l.total_elevation_gain, average_speed_ms: l.average_speed, max_speed_ms: l.max_speed,
      average_cadence: l.average_cadence, average_watts: l.average_watts, max_watts: l.max_watts,
      weighted_average_watts: l.weighted_average_watts, average_heartrate: l.average_heartrate,
      max_heartrate: l.max_heartrate,
    })),
    best_efforts: (d.best_efforts || []).map(b => ({
      name: b.name, distance_m: b.distance, elapsed_time_s: b.elapsed_time, moving_time_s: b.moving_time,
      start_index: b.start_index, end_index: b.end_index, pr_rank: b.pr_rank,
    })),
    segment_efforts: (d.segment_efforts || []).map(s => ({
      id: s.id, name: s.name, elapsed_time_s: s.elapsed_time, moving_time_s: s.moving_time, distance_m: s.distance,
      start_index: s.start_index, end_index: s.end_index, average_cadence: s.average_cadence,
      average_watts: s.average_watts, device_watts: s.device_watts, average_heartrate: s.average_heartrate,
      max_heartrate: s.max_heartrate, pr_rank: s.pr_rank, kom_rank: s.kom_rank,
      segment: s.segment ? {
        id: s.segment.id, name: s.segment.name, distance_m: s.segment.distance,
        average_grade: s.segment.average_grade, maximum_grade: s.segment.maximum_grade,
        elevation_high_m: s.segment.elevation_high, elevation_low_m: s.segment.elevation_low,
        climb_category: s.segment.climb_category, city: s.segment.city, state: s.segment.state,
        country: s.segment.country, starred: s.segment.starred,
      } : null,
    })),
  };
}

// Le serie presenti negli stream, senza l'involucro di Strava.
function streamsExtract(streams: Streams): Partial<Record<StreamKey, number[]>> {
  const out: Partial<Record<StreamKey, number[]>> = {};
  for (const k of FULL_STREAM_KEYS) {
    const data = streams[k]?.data;
    if (data) out[k] = data;
  }
  return out;
}

type QueueProgress = (done: number, total: number, msg?: string) => void;

// Una richiesta ogni 10 secondi. Un errore segna l'attività e si va avanti (dopo un
// minuto se Strava dice "troppe richieste"); senza accesso a Strava ci si ferma.
async function throttledQueue(items: Activity[], fn: (a: Activity) => Promise<void>, onProgress: QueueProgress) {
  for (let i = 0; i < items.length; i++) {
    const t0 = Date.now();
    try {
      await fn(items[i]);
    } catch (e) {
      if (e instanceof AuthError) throw e;
      if ((e as Error).message.includes('429')) {
        onProgress(i + 1, items.length, 'rate-limit hit, attendo 60s…');
        await sleep(RATE_LIMIT_WAIT_MS);
      }
    }
    onProgress(i + 1, items.length);
    if (i < items.length - 1) {
      const wait = Math.max(0, THROTTLE_MS - (Date.now() - t0));
      if (wait > 0) await sleep(wait);
    }
  }
}

export interface ExportInput {
  mode: ExportMode;
  activities: Activity[];
  athlete: Athlete | null;
  stats: AthleteStats | null;
  settings: Settings;
}

// Il JSON da scaricare e il nome del file. `onProgress` riceve il testo da mostrare e la
// percentuale: dettagli fino al 50%, stream dal 50 al 100.
export async function buildExport(
  { mode, activities, athlete, stats, settings }: ExportInput, onProgress: (text: string, pct: number) => void,
) {
  const details: Record<number, ReturnType<typeof detailExtra>> = {};
  const rawStreams: Record<number, ReturnType<typeof streamsExtract>> = {};
  const streamsCache = loadStreamsCache();
  const throttle = `(throttle ${THROTTLE_MS / 1000}s/req)…`;
  const queueProgress = (name: string, start: number): QueueProgress => (done, total, msg) =>
    onProgress(msg ? `${name} ${done}/${total} · ${msg}` : `${name} ${done}/${total} ${throttle}`, start + (done / total) * 50);

  if (mode !== 'compact') {
    onProgress(`Scarico dettagli (${activities.length})…`, 0);
    await throttledQueue(activities, async (a) => {
      details[a.id] = detailExtra(await fetchActivity(a.id, { allEfforts: true }));
    }, queueProgress('Dettagli', 0));
  }

  if (mode === 'max') {
    // FTP e LTHR dalle impostazioni, o valori tipici: servono solo alle metriche salvate.
    const ftp = settings.ftpDeclared || 220;
    const lthr = settings.hrLthr || 170;
    onProgress(`Scarico streams (${activities.length})…`, 50);
    await throttledQueue(activities, async (a) => {
      const s = await fetchActivityStreams(a.id, FULL_STREAM_KEYS.join(','));
      rawStreams[a.id] = streamsExtract(s);
      streamsCache[a.id] = { ...computeStreamsMetrics(s, ftp, lthr), _fetched: Date.now() };
    }, queueProgress('Streams', 50));
    saveStreamsCache(streamsCache);
  }

  activities.forEach(a => {
    const entry = streamsCache[a.id];
    if (entry && !entry._error) a._metrics = entry as StreamMetrics;
  });
  const enriched = activities.map(a => ({
    ...slimSummary(a),
    ...(details[a.id] ? { detail: details[a.id] } : {}),
    ...(rawStreams[a.id] ? { streams: rawStreams[a.id] } : {}),
  }));

  const generatedAt = new Date().toISOString();
  const payload = {
    biketr_export: {
      version: mode, generated_at: generatedAt, generator: 'BikeTR v2 export', schema: 'biketr-export-v1',
      activity_count: enriched.length,
    },
    athlete: athlete ? {
      id: athlete.id, firstname: athlete.firstname, lastname: athlete.lastname, sex: athlete.sex,
      city: athlete.city, state: athlete.state, country: athlete.country, weight_kg: athlete.weight,
      ftp: athlete.ftp, premium: athlete.premium, created_at: athlete.created_at,
    } : null,
    stats: stats ? {
      recent_ride_totals: stats.recent_ride_totals, recent_run_totals: stats.recent_run_totals,
      ytd_ride_totals: stats.ytd_ride_totals, ytd_run_totals: stats.ytd_run_totals,
      all_ride_totals: stats.all_ride_totals, all_run_totals: stats.all_run_totals,
      all_swim_totals: stats.all_swim_totals,
    } : null,
    settings_biketr: settings,
    activities: enriched,
  };
  return { payload, fname: `biketr-export-${mode}-${generatedAt.slice(0, 10)}.json` };
}

// Fa scaricare il JSON al browser; restituisce la dimensione del file in byte.
export function downloadJson(data: unknown, filename: string): number {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return blob.size;
}
