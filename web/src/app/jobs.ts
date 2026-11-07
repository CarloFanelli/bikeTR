// Lavori lunghi che continuano anche cambiando sezione: "Aggiorna con streams",
// l'export JSON, le previsioni sui segmenti e "Completa da dettagli attività". Lo stato sta qui, fuori dalle schermate, e le schermate lo leggono:
// tornando su Home si vede l'avanzamento o il risultato. Un secondo avvio mentre uno
// è in corso non fa niente.

import { markRaw, reactive } from 'vue';
import type { SegmentEntry } from '../core/segments.ts';
import type { Activity } from '../core/strava-types.ts';
import {
  buildExport, downloadJson, type ExportFilter, type ExportMode, fetchAllActivities, filterForExport, formatBytes,
} from '../data/export.ts';
import { completeFromActivities, loadSegmentPredictions, MAX_SEGMENTS_HYDRATE, type SegmentDiag } from '../data/segments.ts';
import { clearSegmentCache, loadSettings } from '../data/storage.ts';
import { hydrateWithStreams, MAX_STREAMS_FETCH } from '../data/streams.ts';
import { connectIfDisconnected, hrProfile, session } from './session.ts';

export const streamsJob = reactive({ running: false, progress: '' });

export async function refreshStreams(): Promise<void> {
  if (streamsJob.running) return;
  Object.assign(streamsJob, { running: true, progress: 'Avvio…' });
  try {
    const { ftp, hrLthr } = hrProfile();
    // Le metriche finiscono sulle attività della sessione: Home e le altre sezioni ricalcolano da sole.
    await hydrateWithStreams(session.activities, ftp, hrLthr, MAX_STREAMS_FETCH, (done, total) => {
      streamsJob.progress = `Scarico streams: ${done}/${total}`;
    });
    streamsJob.progress = '✅ Cache aggiornata. Ricalcolo…';
  } catch (e) {
    if (!connectIfDisconnected(e)) streamsJob.progress = '❌ ' + (e as Error).message;
  } finally {
    streamsJob.running = false;
  }
}

interface ExportJob {
  // Conteggio dello storico, all'apertura della finestra.
  counting: boolean;
  countText: string;
  countError: string;
  // Tutto lo storico contato; null finché il conteggio non è finito.
  all: Activity[] | null;
  running: boolean;
  progress: string;
  // Percentuale della barra; null = barra nascosta.
  pct: number | null;
  done: { fname: string; size: string; count: number } | null;
  error: string;
}

export const exportJob = reactive<ExportJob>({
  counting: false, countText: '', countError: '', all: null,
  running: false, progress: '', pct: null, done: null, error: '',
});

// All'apertura della finestra conta di nuovo lo storico; non durante un export.
export async function countForExport(): Promise<void> {
  if (exportJob.counting || exportJob.running) return;
  Object.assign(exportJob, {
    counting: true, countText: 'Conto le attività…', countError: '', all: null,
    progress: '', pct: null, done: null, error: '',
  });
  try {
    const all = await fetchAllActivities((count, page) => {
      exportJob.countText = `Caricate ${count} attività (pagina ${page})…`;
    });
    // Migliaia di attività: Vue non le osserva una per una, servono solo all'export.
    exportJob.all = markRaw(all);
  } catch (e) {
    if (!connectIfDisconnected(e)) exportJob.countError = 'Errore: ' + (e as Error).message;
  } finally {
    exportJob.counting = false;
  }
}

export async function runExport(choice: ExportFilter & { mode: ExportMode }): Promise<void> {
  if (exportJob.running || !exportJob.all) return;
  const activities = filterForExport(exportJob.all, choice);
  Object.assign(exportJob, { running: true, progress: '', pct: 0, done: null, error: '' });
  try {
    const { payload, fname } = await buildExport({
      mode: choice.mode, activities, athlete: session.athlete, stats: session.stats, settings: loadSettings(),
    }, (progress, pct) => Object.assign(exportJob, { progress, pct }));
    const size = downloadJson(payload, fname);
    Object.assign(exportJob, { pct: 100, done: { fname, size: formatBytes(size), count: activities.length } });
  } catch (e) {
    if (!connectIfDisconnected(e)) exportJob.error = '❌ ' + (e as Error).message;
  } finally {
    exportJob.running = false;
  }
}

interface SegmentsJob {
  loading: boolean;
  progress: string;
  // I preferiti con tentativi e il riepilogo; null finché il primo caricamento non è finito.
  list: SegmentEntry[] | null;
  diag: SegmentDiag | null;
  error: string;
  completing: boolean;
  completeProgress: string;
}

export const segmentsJob = reactive<SegmentsJob>({
  loading: false, progress: 'Carico segmenti…', list: null, diag: null, error: '', completing: false, completeProgress: '',
});

// Previsioni sui segmenti preferiti: all'apertura dell'app, e di nuovo dopo
// "Completa da dettagli attività" e "Svuota cache e ricarica".
export async function loadSegments(): Promise<void> {
  if (segmentsJob.loading) return;
  Object.assign(segmentsJob, { loading: true, progress: 'Carico segmenti…', error: '' });
  try {
    const { list, diag } = await loadSegmentPredictions((done, total, errors) => {
      segmentsJob.progress = `Carico segmenti ${done}/${total}${errors ? ' (errori: ' + errors + ')' : ''}…`;
    });
    Object.assign(segmentsJob, { list: markRaw(list), diag: markRaw(diag) });
  } catch (e) {
    if (!connectIfDisconnected(e)) segmentsJob.error = 'Errore caricamento segmenti: ' + (e as Error).message;
  } finally {
    segmentsJob.loading = false;
  }
}

export function clearSegmentsAndReload(): void {
  if (segmentsJob.loading || segmentsJob.completing) return;
  clearSegmentCache();
  void loadSegments();
}

// Non parte mentre le previsioni caricano: scrivono gli stessi segmenti salvati.
export async function completeSegments(): Promise<void> {
  if (segmentsJob.completing || segmentsJob.loading) return;
  Object.assign(segmentsJob, { completing: true, completeProgress: 'Scarico dettagli attività…' });
  try {
    const result = await completeFromActivities(session.activities, MAX_SEGMENTS_HYDRATE, (done, total) => {
      segmentsJob.completeProgress = `Attività ${done}/${total}…`;
    });
    const done = `✅ Scaricate ${result.fetched} attività, aggiunti ${result.addedEfforts} efforts.`;
    segmentsJob.completeProgress = done + ' Ricarico…';
    await loadSegments();
    segmentsJob.completeProgress = done;
  } catch (e) {
    if (!connectIfDisconnected(e)) segmentsJob.completeProgress = '❌ ' + (e as Error).message;
  } finally {
    segmentsJob.completing = false;
  }
}
