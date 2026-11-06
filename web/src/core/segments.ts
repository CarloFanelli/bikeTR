// Segmenti preferiti: stime di FTP e soglia dai tentativi, previsione del prossimo
// tempo (regressione lineare) e allenamenti mirati a un segmento.

import { fmtTime } from './format.ts';
import type { Segment, SegmentEffort } from './strava-types.ts';

// I dati del segmento salvati con i suoi tentativi.
export interface SegmentShape {
  average_grade?: number;
  elevation_difference?: number;
  total_elevation_gain?: number;
  distance?: number;
}
export interface SegmentCacheEntry {
  efforts?: SegmentEffort[];
  _fetched?: number;
  _segment?: SegmentShape;
}
export type SegmentCache = Record<string, SegmentCacheEntry>;

// Un segmento preferito con i suoi tentativi.
export interface SegmentEntry {
  segment: Segment;
  efforts: SegmentEffort[];
}

// Forma attuale usata per correggere la previsione.
export interface FormContext {
  ctl: number;
  tsb: number;
}

export interface Point {
  x: number;
  y: number;
}

// ---- Idoneità segmento per stima FTP ----
// Segmenti ideali: salita 3-8% con dislivello reale, elimina pianure (drafting/vento)
export function isSegmentFTPSuitable(segment: SegmentShape): boolean {
  const grade = segment.average_grade ?? 0;
  const elev = segment.elevation_difference ?? segment.total_elevation_gain ?? 0;
  // Salita moderata con dislivello significativo = sforzo costante senza variabili esterne
  return grade >= 3 && grade <= 12 && elev > 40 && (segment.distance || 0) >= 1500;
}

// ---- Decadimento temporale degli sforzi ----
// FTP decade ~5-7% al mese senza allenamento → half-life ~8 settimane
export function effortDecay(startDate: string, now: Date): number {
  const ageWeeks = (now.getTime() - new Date(startDate).getTime()) / (7 * 86400000);
  return Math.exp(-ageWeeks / 12); // smooth decay, ~50% a 8 settimane
}

interface RatedEffort {
  watts: number;
  time: number;
  decay: number;
  date: string;
  suitable: boolean;
}
interface DurationBucket {
  min: number;
  max: number;
  efforts: RatedEffort[];
  factor: number;
}
export interface FtpEstimate {
  ftp: number;
  source: string;
  confidence: number;
  buckets?: { ftp: number; bucket: string }[];
}
export interface SegmentEstimates {
  ftpFromSegments: number | null;
  lthrFromSegments: number | null;
  hrMaxFromSegments: number | null;
  ftpEstimates: FtpEstimate[];
  ftpConfidence: number;
  ftpSource: string | null;
  pdBuckets: Record<string, { count: number; bestWatts: number | null }>;
  suitableSegmentCount: number;
}

// ---- Stima FTP/LTHR da best efforts sui segmenti preferiti ----
// Versione avanzata: filtra per idoneità segmento, applica decadimento temporale,
// modello multi-durata (3-5min, 12-20min, 20-40min, 40-60min) per triangolazione.
export function estimatesFromSegments(cache: SegmentCache, now: Date): SegmentEstimates {
  let bestWatts15to30 = 0;
  let bestWeightedWatts = 0; // best watts × decay (recency-weighted)
  let bestAvgHR15to45 = 0;
  let bestMaxHR = 0;

  // Raccogli efforts per bucket di durata (power-duration model)
  const pdBuckets: Record<string, DurationBucket> = {
    sprint: { min: 0, max: 5*60, efforts: [], factor: 0.72 },      // ~72% of 5min power
    vo2: { min: 3*60, max: 8*60, efforts: [], factor: 0.82 },       // ~82% of VO2max
    subThreshold: { min: 8*60, max: 20*60, efforts: [], factor: 0.92 }, // ~92%
    threshold: { min: 15*60, max: 40*60, efforts: [], factor: 0.95 },   // classico 95%
    endurance: { min: 40*60, max: 90*60, efforts: [], factor: 1.0 },    // FTP diretto
  };

  // Sforzi su segmenti idonei (salita) hanno priorità
  const suitableEfforts: RatedEffort[] = [];

  for (const id in cache) {
    const c = cache[id];
    if (!c.efforts) continue;
    const seg = c._segment || {}; // segment metadata se disponibile
    const isSuitable = isSegmentFTPSuitable(seg);

    for (const e of c.efforts) {
      const t = e.elapsed_time || 0;
      const decay = effortDecay(e.start_date, now);

      // Power-duration buckets
      if (e.average_watts && t >= 60) {
        const entry = { watts: e.average_watts, time: t, decay, date: e.start_date, suitable: isSuitable };
        if (isSuitable) suitableEfforts.push(entry);

        for (const key in pdBuckets) {
          const b = pdBuckets[key];
          if (t >= b.min && t < b.max) {
            b.efforts.push(entry);
          }
        }
      }

      // Best watts 15-30min (retrocompatibilità + weighted)
      if (e.average_watts && t >= 15*60 && t <= 30*60) {
        if (e.average_watts > bestWatts15to30) bestWatts15to30 = e.average_watts;
        const weighted = e.average_watts * decay;
        if (weighted > bestWeightedWatts) bestWeightedWatts = weighted;
      }

      // HR metrics (invariati)
      if (e.average_heartrate && t >= 15*60 && t <= 45*60) {
        if (e.average_heartrate > bestAvgHR15to45) bestAvgHR15to45 = e.average_heartrate;
      }
      if (e.max_heartrate && e.max_heartrate > bestMaxHR) bestMaxHR = e.max_heartrate;
    }
  }

  // --- Stima FTP multi-sorgente ---
  const estimates: FtpEstimate[] = [];

  // 1) Best assoluto 15-30min × 0.95 (retrocompatibile)
  if (bestWatts15to30) {
    estimates.push({ ftp: Math.round(bestWatts15to30 * 0.95), source: 'best_15_30', confidence: 0.7 });
  }

  // 2) Best recency-weighted 15-30min × 0.95
  if (bestWeightedWatts) {
    estimates.push({ ftp: Math.round(bestWeightedWatts * 0.95), source: 'weighted_recent', confidence: 0.75 });
  }

  // 3) Segmenti idonei (salita): più affidabili
  const suitableThreshold = suitableEfforts
    .filter(e => e.time >= 15*60 && e.time <= 40*60)
    .sort((a, b) => b.watts * b.decay - a.watts * a.decay);
  if (suitableThreshold.length) {
    const best = suitableThreshold[0];
    const factor = best.time >= 30*60 ? 0.98 : 0.95;
    estimates.push({ ftp: Math.round(best.watts * factor), source: 'suitable_climb', confidence: 0.9 });
  }

  // 4) Power-duration model: triangolazione da bucket multipli
  const pdEstimates: { ftp: number; bucket: string }[] = [];
  for (const key in pdBuckets) {
    const b = pdBuckets[key];
    if (!b.efforts.length) continue;
    const best = b.efforts.sort((a, c) => c.watts * c.decay - a.watts * a.decay)[0];
    pdEstimates.push({ ftp: Math.round(best.watts * b.factor), bucket: key });
  }
  if (pdEstimates.length >= 2) {
    // Media dei bucket disponibili = triangolazione
    const avgFtp = Math.round(pdEstimates.reduce((s, e) => s + e.ftp, 0) / pdEstimates.length);
    estimates.push({ ftp: avgFtp, source: 'power_duration_model', confidence: 0.85, buckets: pdEstimates });
  }

  // Scegli la stima con confidenza più alta
  estimates.sort((a, b) => b.confidence - a.confidence || b.ftp - a.ftp);
  const bestEstimate = estimates[0] || null;

  return {
    ftpFromSegments: bestEstimate ? bestEstimate.ftp : (bestWatts15to30 ? Math.round(bestWatts15to30 * 0.95) : null),
    lthrFromSegments: bestAvgHR15to45 ? Math.round(bestAvgHR15to45 * 0.98) : null,
    hrMaxFromSegments: bestMaxHR || null,
    // Nuovi campi per diagnostica e UI
    ftpEstimates: estimates,
    ftpConfidence: bestEstimate?.confidence || 0,
    ftpSource: bestEstimate?.source || null,
    pdBuckets: Object.fromEntries(
      Object.entries(pdBuckets).map(([k, b]) => [k, {
        count: b.efforts.length,
        bestWatts: b.efforts.length ? Math.round(Math.max(...b.efforts.map(e => e.watts))) : null,
      }])
    ),
    suitableSegmentCount: new Set(
      Object.entries(cache)
        .filter(([, c]) => isSegmentFTPSuitable(c._segment || {}))
        .map(([id]) => id)
    ).size,
  };
}

export function linearRegression(points: Point[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0 };
  const sumX = points.reduce((s,p) => s+p.x, 0);
  const sumY = points.reduce((s,p) => s+p.y, 0);
  const sumXY = points.reduce((s,p) => s+p.x*p.y, 0);
  const sumX2 = points.reduce((s,p) => s+p.x*p.x, 0);
  const denom = n*sumX2 - sumX*sumX;
  const slope = denom === 0 ? 0 : (n*sumXY - sumX*sumY) / denom;
  const intercept = (sumY - slope*sumX) / n;
  return { slope, intercept };
}

// Adatta la previsione alla forma corrente (CTL/TSB).
// Logica semplificata: TSB positivo → tempo migliore; TSB negativo → tempo peggiore.
// CTL più alto del passato medio → spinta aggiuntiva.
export function formAdjustedTime(baseTime: number, bestTime: number, formCtx: FormContext | null | undefined): number {
  if (!formCtx) return baseTime;
  const { ctl, tsb } = formCtx;
  let pct = 0;
  if (tsb > 15) pct -= 0.025;
  else if (tsb > 5) pct -= 0.012;
  else if (tsb < -20) pct += 0.04;
  else if (tsb < -10) pct += 0.02;
  if (ctl > 80) pct -= 0.01;
  if (ctl < 30) pct += 0.015;
  const adjusted = baseTime * (1 + pct);
  return Math.max(bestTime * 0.93, adjusted);
}

const byStartDate = (a: SegmentEffort, b: SegmentEffort) =>
  new Date(a.start_date).getTime() - new Date(b.start_date).getTime();

export function computePrediction(entry: SegmentEntry, formCtx: FormContext | null | undefined) {
  const sorted = entry.efforts.slice().sort(byStartDate);
  const best = sorted.reduce((b, e) => e.elapsed_time < b.elapsed_time ? e : b, sorted[0]);
  const last = sorted[sorted.length - 1];
  const recent = sorted.slice(-10);
  const t0 = new Date(recent[0].start_date).getTime();
  const points = recent.map(e => ({
    x: (new Date(e.start_date).getTime() - t0) / 86400000,
    y: e.elapsed_time,
  }));
  const { slope, intercept } = linearRegression(points);
  const lastX = points[points.length - 1].x;
  const predX = lastX + 14;
  const baseY = Math.max(best.elapsed_time * 0.95, slope * predX + intercept);
  const adjusted = formAdjustedTime(baseY, best.elapsed_time, formCtx);
  return {
    best, last, attempts: entry.efforts.length,
    slopePerDay: slope,
    predictedBase: Math.round(baseY),
    predictedForm: Math.round(adjusted),
    trendPerWeek: slope * 7,
    sorted: recent,
    points,
  };
}

export interface SegmentWorkout {
  title: string;
  detail: string;
  reason: string;
  segmentStats: {
    name: string;
    prTime: number;
    targetTime: number;
    bestWatts: number | null;
    targetWatts: number | null;
    distance: number;
    grade: number;
    attempts: number;
    recentTrend: number;
  };
}

// ---- Segment-based workout targeting ----
// Se l'atleta ha un segmento obiettivo (es: salita di 25 min),
// genera intervalli specifici alla potenza/tempo target per quel segmento.
export function segmentTargetedWorkout(
  segmentEntry: SegmentEntry | null | undefined, ftp: number | null | undefined, _hrLthr: number | null | undefined,
): SegmentWorkout | null {
  if (!segmentEntry || !segmentEntry.efforts?.length) return null;

  const seg = segmentEntry.segment;
  const sorted = segmentEntry.efforts.slice().sort(byStartDate);
  const best = sorted.reduce((b, e) => e.elapsed_time < b.elapsed_time ? e : b, sorted[0]);
  const recent = sorted.slice(-5);

  const segDuration = best.elapsed_time; // secondi del PR
  const segMinutes = segDuration / 60;
  const segKm = (seg.distance || 0) / 1000;
  const segGrade = seg.average_grade || 0;

  // Calcola potenza target dal best effort o stima da FTP
  const bestWatts = best.average_watts || (ftp ? Math.round(ftp * (segMinutes > 20 ? 0.95 : segMinutes > 10 ? 1.05 : 1.15)) : null);
  const targetImprovement = 0.02; // 2% improvement target
  const targetTime = Math.round(segDuration * (1 - targetImprovement));
  const targetWatts = bestWatts ? Math.round(bestWatts * (1 + targetImprovement)) : null;

  // Genera workout specifico in base alla durata del segmento
  let workout: Omit<SegmentWorkout, 'segmentStats'>;
  if (segMinutes <= 5) {
    // Segmento breve: lavoro VO2max + sprint
    const reps = Math.max(4, Math.round(segMinutes * 1.5));
    workout = {
      title: `🎯 Specifico per "${seg.name}" (${segMinutes.toFixed(0)}')`,
      detail: `Obiettivo: migliorare il PR di ${fmtTime(segDuration)} → ${fmtTime(targetTime)}.
Risc 20'.
${reps}×${Math.round(segMinutes)}' @ intensità gara segmento${targetWatts ? ` (~${targetWatts}W)` : ''}, rec ${Math.round(segMinutes)}' Z1.
Simula: pendenza ${segGrade}% · distanza ${segKm.toFixed(1)} km.
Defat 10'. Totale ~${20 + reps * segMinutes * 2 + 10} min.`,
      reason: `Ripetute alla durata esatta del segmento target. L'obiettivo è abituare il corpo a sostenere la potenza necessaria per ${fmtTime(targetTime)}.`,
    };
  } else if (segMinutes <= 15) {
    // Segmento medio: lavoro soglia/VO2 specifico
    const reps = Math.max(3, Math.round(15 / segMinutes));
    workout = {
      title: `🎯 Specifico per "${seg.name}" (${segMinutes.toFixed(0)}')`,
      detail: `Obiettivo: migliorare il PR di ${fmtTime(segDuration)} → ${fmtTime(targetTime)}.
Risc 20'.
${reps}×${Math.round(segMinutes * 0.8)}' @ 100-105% della potenza gara${targetWatts ? ` (~${Math.round(targetWatts * 1.02)}W)` : ''}, rec ${Math.max(3, Math.round(segMinutes * 0.4))}' Z1.
Finale: 1×${Math.round(segMinutes)}' simulazione completa (ritmo gara). Pendenza target: ${segGrade}%.
Defat 10'. Totale ~${30 + reps * segMinutes * 1.2 + segMinutes + 10} min.`,
      reason: `Intervalli leggermente più corti ma più intensi del segmento, più una simulazione completa a ritmo gara.`,
    };
  } else {
    // Segmento lungo (>15 min): lavoro di sostenibilità
    const blockMin = Math.round(segMinutes / 3);
    workout = {
      title: `🎯 Specifico per "${seg.name}" (${segMinutes.toFixed(0)}')`,
      detail: `Obiettivo: migliorare il PR di ${fmtTime(segDuration)} → ${fmtTime(targetTime)}.
Risc 20'.
Blocco 1: 3×${blockMin}' @ 95% della potenza gara${targetWatts ? ` (~${Math.round(targetWatts * 0.95)}W)` : ''}, rec ${Math.max(3, Math.round(blockMin * 0.3))}' Z1.
Blocco 2 (se senti le gambe): 1×${Math.round(segMinutes * 0.6)}' progressione da 90% a 105% potenza gara.
Il segmento ha ${segGrade}% pendenza media, ${segKm.toFixed(1)} km.
Defat 10'. Totale ~${30 + blockMin * 4 + segMinutes * 0.6 + 10} min.`,
      reason: `Segmenti >15 min richiedono lavoro di sostenibilità: intervalli al 95% + progressione per imparare a gestire lo sforzo su tutta la durata.`,
    };
  }

  // Aggiungi statistiche del segmento
  return {
    ...workout,
    segmentStats: {
      name: seg.name,
      prTime: segDuration,
      targetTime,
      bestWatts,
      targetWatts,
      distance: seg.distance,
      grade: segGrade,
      attempts: sorted.length,
      recentTrend: recent.length >= 2 ? (recent[recent.length-1].elapsed_time - recent[0].elapsed_time) / recent.length : 0,
    },
  };
}

// Genera workout mirati per tutti i segmenti top (quelli con più tentativi e trend negativo)
export function generateSegmentWorkouts(
  list: SegmentEntry[] | null | undefined, ftp: number | null | undefined, hrLthr: number | null | undefined,
): { segment: Segment; workout: SegmentWorkout }[] {
  if (!list || !list.length) return [];

  return list
    .filter(e => e.efforts.length >= 3) // almeno 3 tentativi
    .flatMap(e => {
      const workout = segmentTargetedWorkout(e, ftp, hrLthr);
      return workout ? [{ segment: e.segment, workout }] : [];
    })
    .sort((a, b) => b.workout.segmentStats.attempts - a.workout.segmentStats.attempts)
    .slice(0, 5); // top 5 segmenti
}
