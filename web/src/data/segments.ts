// Segmenti preferiti: i loro tentativi da Strava, salvati nel browser per le previsioni e
// per le stime di FTP e soglia. Senza accesso a Strava (non collegato, server di
// autenticazione spento) si salva quanto scaricato, ci si ferma e si lancia l'errore.

import type { SegmentCache, SegmentEntry } from '../core/segments.ts';
import type { Activity, SegmentEffort } from '../core/strava-types.ts';
import { AuthError } from './auth.ts';
import { loadSegmentCache, saveSegmentCache } from './storage.ts';
import { fetchActivity, fetchSegmentEfforts, fetchStarredSegments, sleep, StravaError } from './strava.ts';

// Uscite lette da "Completa da dettagli attività": una richiesta per uscita.
export const MAX_SEGMENTS_HYDRATE = 30;

const CACHE_TTL_OK = 24 * 60 * 60 * 1000; // 24h per risultati con tentativi
const CACHE_TTL_EMPTY = 2 * 60 * 60 * 1000; // 2h per risultati vuoti (potrebbe essere stato flaky)
const PAUSE_MS = 150;
const RATE_LIMIT_WAIT_MS = 10000;

export interface SegmentDiag {
  totalStarred: number;
  withEfforts: number;
  noEfforts: number;
  errors: { name: string; id: number; msg: string }[];
  fromCache: number;
  fetched: number;
}

// I preferiti con almeno un tentativo, e il riepilogo di cosa è venuto da dove.
export async function loadSegmentPredictions(
  onProgress?: (done: number, total: number, errors: number) => void,
): Promise<{ list: SegmentEntry[]; diag: SegmentDiag }> {
  const starred = await fetchStarredSegments();
  const cache = loadSegmentCache();
  const now = Date.now();
  const list: SegmentEntry[] = [];
  const diag: SegmentDiag = { totalStarred: starred.length, withEfforts: 0, noEfforts: 0, errors: [], fromCache: 0, fetched: 0 };
  for (let i = 0; i < starred.length; i++) {
    const seg = starred[i];
    onProgress?.(i + 1, starred.length, diag.errors.length);
    const cached = cache[seg.id];
    const ttl = cached?.efforts?.length ? CACHE_TTL_OK : CACHE_TTL_EMPTY;
    if (cached?.efforts && now - (cached._fetched ?? 0) < ttl) {
      diag.fromCache++;
      if (cached.efforts.length > 0) {
        list.push({ segment: seg, efforts: cached.efforts });
        diag.withEfforts++;
      } else {
        diag.noEfforts++;
      }
      continue;
    }
    try {
      const efforts = await fetchSegmentEfforts(seg.id);
      cache[seg.id] = {
        efforts, _fetched: now, _segment: {
          average_grade: seg.average_grade, elevation_difference: (seg.elevation_high ?? 0) - (seg.elevation_low ?? 0),
          total_elevation_gain: seg.total_elevation_gain, distance: seg.distance,
        },
      };
      diag.fetched++;
      if (efforts.length >= 1) {
        list.push({ segment: seg, efforts });
        diag.withEfforts++;
      } else {
        diag.noEfforts++;
      }
      if (i < starred.length - 1) await sleep(PAUSE_MS);
    } catch (e) {
      if (e instanceof AuthError) {
        saveSegmentCache(cache);
        throw e;
      }
      // Gli errori non si salvano: così si riprova alla prossima apertura.
      diag.errors.push({ name: seg.name, id: seg.id, msg: (e as Error).message });
      if (e instanceof StravaError && e.status === 429) await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
  saveSegmentCache(cache);
  return { list, diag };
}

// Aggiunge ai preferiti i tentativi letti nei dettagli delle uscite in bici: costa una
// richiesta per uscita, ma supera i limiti di /all_efforts. Un'uscita che fallisce si
// salta; quelle già lette in questa sessione non si scaricano di nuovo.
export async function completeFromActivities(
  activities: Activity[], maxFetch: number, onProgress?: (done: number, total: number) => void,
): Promise<{ fetched: number; addedEfforts: number }> {
  // Tutti i preferiti, non solo quelli con tentativi: interessano solo loro.
  const starred = new Set((await fetchStarredSegments()).map(s => String(s.id)));
  const bikes = activities.filter(a => a.type?.includes('Ride')).slice(0, maxFetch);
  const cache: SegmentCache = loadSegmentCache();
  const now = Date.now();
  let fetched = 0;
  let addedEfforts = 0;
  for (let i = 0; i < bikes.length; i++) {
    const a = bikes[i];
    onProgress?.(i + 1, bikes.length);
    if (a._detailFetched) continue;
    try {
      const detail = await fetchActivity(a.id);
      a._detailFetched = true;
      fetched++;
      for (const eff of detail.segment_efforts ?? []) {
        const segId = String(eff.segment?.id);
        if (!starred.has(segId)) continue;
        const entry = cache[segId] ??= {
          efforts: [], _fetched: now, _segment: {
            average_grade: eff.segment?.average_grade, distance: eff.segment?.distance,
            elevation_difference: (eff.segment?.elevation_high || 0) - (eff.segment?.elevation_low || 0),
            total_elevation_gain: eff.segment?.total_elevation_gain,
          },
        };
        const efforts = entry.efforts ??= [];
        if (efforts.some(e => e.id === eff.id)) continue;
        efforts.push(savedEffort(eff));
        addedEfforts++;
        entry._fetched = now;
      }
      if (i < bikes.length - 1) await sleep(PAUSE_MS);
    } catch (e) {
      if (e instanceof AuthError) {
        saveSegmentCache(cache);
        throw e;
      }
    }
  }
  saveSegmentCache(cache);
  return { fetched, addedEfforts };
}

// Del tentativo si tiene solo quello che servono previsioni e stime.
const savedEffort = (eff: SegmentEffort): SegmentEffort => ({
  id: eff.id, elapsed_time: eff.elapsed_time, moving_time: eff.moving_time, start_date: eff.start_date,
  distance: eff.distance, average_heartrate: eff.average_heartrate, max_heartrate: eff.max_heartrate,
  average_watts: eff.average_watts,
});
