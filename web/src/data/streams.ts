// "Aggiorna con streams": scarica le serie secondo per secondo delle uscite in bici
// e ne salva le metriche nel browser (una richiesta a Strava per uscita).

import { computeStreamsMetrics } from '../core/streams.ts';
import type { Activity, StreamMetrics } from '../core/strava-types.ts';
import { AuthError } from './auth.ts';
import { loadStreamsCache, saveStreamsCache } from './storage.ts';
import { fetchActivityStreams } from './strava.ts';

// Uscite più recenti considerate: Strava concede 100 richieste ogni 15 minuti.
export const MAX_STREAMS_FETCH = 40;

// Scarica solo le uscite non ancora scaricate o fallite; un errore su un'uscita la segna
// e si va avanti. Senza accesso a Strava (non collegato, server di autenticazione spento)
// salva quanto scaricato, si ferma e lancia l'errore, invece di segnarlo su ogni uscita.
export async function hydrateWithStreams(
  activities: Activity[], ftp: number | null, lthr: number | null, maxFetch = MAX_STREAMS_FETCH,
  onProgress?: (done: number, total: number) => void,
): Promise<{ fetched: number; totalCached: number }> {
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
      cache[a.id] = { _error: (e as Error).message, _fetched: Date.now() };
    }
    done++;
    onProgress?.(done, toFetch.length);
  }
  saveStreamsCache(cache);
  activities.forEach(a => {
    const entry = cache[a.id];
    if (entry && !entry._error) a._metrics = entry as StreamMetrics;
  });
  return { fetched: toFetch.length, totalCached: Object.keys(cache).length };
}
