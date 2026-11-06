// Previsioni sui segmenti preferiti: carica segmenti starred, storico tentativi,
// calcola trend e stima tempo al prossimo tentativo (regressione lineare).
import {
  safeLoad, safeSave, isPlainObject, APP_CONFIG, fmtTime, escapeHtml, AuthError,
  fetchStarredSegments, fetchSegmentEfforts, fetchActivity,
} from './strava.js';

const SEG_CACHE = 'biketr_segments_cache_v2';
function clearSegCache() { localStorage.removeItem(SEG_CACHE); }
function loadSegCache() {
  return safeLoad(SEG_CACHE, {}, isPlainObject);
}
function saveSegCache(c) { safeSave(SEG_CACHE, c); }

// Senza accesso a Strava (non collegato, server di autenticazione spento) salva
// quanto scaricato, si ferma e lancia l'errore, invece di segnarlo su ogni segmento.
async function loadSegmentPredictions(onProgress) {
  const starred = await fetchStarredSegments();
  const cache = loadSegCache();
  const CACHE_TTL_OK = 24 * 60 * 60 * 1000; // 24h per risultati con tentativi
  const CACHE_TTL_EMPTY = 2 * 60 * 60 * 1000; // 2h per risultati vuoti (potrebbe essere stato flaky)
  const now = Date.now();
  const out = [];
  const diag = {
    totalStarred: starred.length,
    withEfforts: 0,
    noEfforts: 0,
    errors: [],
    fromCache: 0,
    fetched: 0,
  };
  for (let i = 0; i < starred.length; i++) {
    const seg = starred[i];
    if (onProgress) onProgress(i + 1, starred.length, diag.errors.length);
    const cached = cache[seg.id];
    const ttl = cached && cached.efforts && cached.efforts.length > 0 ? CACHE_TTL_OK : CACHE_TTL_EMPTY;
    if (cached && cached.efforts && (now - cached._fetched) < ttl) {
      diag.fromCache++;
      if (cached.efforts.length > 0) {
        out.push({ segment: seg, efforts: cached.efforts });
        diag.withEfforts++;
      } else {
        diag.noEfforts++;
      }
      continue;
    }
    try {
      const efforts = await fetchSegmentEfforts(seg.id);
      cache[seg.id] = { efforts, _fetched: now, _segment: {
        average_grade: seg.average_grade, elevation_difference: seg.elevation_high - seg.elevation_low,
        total_elevation_gain: seg.total_elevation_gain, distance: seg.distance,
      }};
      diag.fetched++;
      if (efforts.length >= 1) {
        out.push({ segment: seg, efforts });
        diag.withEfforts++;
      } else {
        diag.noEfforts++;
      }
      if (i < starred.length - 1) await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      if (e instanceof AuthError) {
        saveSegCache(cache);
        throw e;
      }
      diag.errors.push({ name: seg.name, id: seg.id, msg: e.message });
      // NON cache-o errori: così ri-tento alla prossima visita
      if (String(e.message).includes('429')) {
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  }
  saveSegCache(cache);
  return { list: out, diag };
}

// Arricchisce la cache segmenti estraendo segment_efforts dai dettagli attività.
// Costoso: 1 API call per attività. Ma bypassa i limiti di /all_efforts.
// Come sopra, un errore di accesso a Strava ferma il lavoro.
async function hydrateSegmentsFromActivities(activities, maxFetch = APP_CONFIG.maxSegmentsHydrate, starredIds = null, onProgress) {
  const bikes = activities.filter(a => a.type?.includes('Ride')).slice(0, maxFetch);
  const cache = loadSegCache();
  const now = Date.now();
  const starredSet = starredIds ? new Set(starredIds.map(String)) : null;
  let fetched = 0;
  let addedEfforts = 0;
  for (let i = 0; i < bikes.length; i++) {
    const a = bikes[i];
    if (onProgress) onProgress(i + 1, bikes.length);
    // Evita rifetch se abbiamo già memorizzato (attributo _detailFetched sull'attività stessa)
    if (a._detailFetched) continue;
    try {
      const detail = await fetchActivity(a.id);
      a._detailFetched = true;
      fetched++;
      if (Array.isArray(detail.segment_efforts)) {
        for (const eff of detail.segment_efforts) {
          const segId = String(eff.segment?.id);
          if (!segId) continue;
          if (starredSet && !starredSet.has(segId)) continue; // interessano solo preferiti
          if (!cache[segId]) cache[segId] = { efforts: [], _fetched: now, _segment: {
            average_grade: eff.segment?.average_grade, distance: eff.segment?.distance,
            elevation_difference: (eff.segment?.elevation_high || 0) - (eff.segment?.elevation_low || 0),
            total_elevation_gain: eff.segment?.total_elevation_gain,
          }};
          if (!cache[segId].efforts) cache[segId].efforts = [];
          if (!cache[segId].efforts.find(e => e.id === eff.id)) {
            cache[segId].efforts.push({
              id: eff.id,
              elapsed_time: eff.elapsed_time,
              moving_time: eff.moving_time,
              start_date: eff.start_date,
              distance: eff.distance,
              average_heartrate: eff.average_heartrate,
              max_heartrate: eff.max_heartrate,
              average_watts: eff.average_watts,
            });
            addedEfforts++;
            cache[segId]._fetched = now;
          }
        }
      }
      if (i < bikes.length - 1) await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      if (e instanceof AuthError) {
        saveSegCache(cache);
        throw e;
      }
    }
  }
  saveSegCache(cache);
  return { fetched, addedEfforts };
}

// ---- Idoneità segmento per stima FTP ----
// Segmenti ideali: salita 3-8% con dislivello reale, elimina pianure (drafting/vento)
function isSegmentFTPSuitable(segment) {
  const grade = segment.average_grade ?? 0;
  const elev = segment.elevation_difference ?? segment.total_elevation_gain ?? 0;
  // Salita moderata con dislivello significativo = sforzo costante senza variabili esterne
  return grade >= 3 && grade <= 12 && elev > 40 && (segment.distance || 0) >= 1500;
}

// ---- Decadimento temporale degli sforzi ----
// FTP decade ~5-7% al mese senza allenamento → half-life ~8 settimane
function effortDecay(startDate) {
  const ageWeeks = (Date.now() - new Date(startDate).getTime()) / (7 * 86400000);
  return Math.exp(-ageWeeks / 12); // smooth decay, ~50% a 8 settimane
}

// ---- Stima FTP/LTHR da best efforts sui segmenti preferiti ----
// Versione avanzata: filtra per idoneità segmento, applica decadimento temporale,
// modello multi-durata (3-5min, 12-20min, 20-40min, 40-60min) per triangolazione.
function estimatesFromSegments() {
  const cache = loadSegCache();
  let bestWatts15to30 = 0;
  let bestWeightedWatts = 0; // best watts × decay (recency-weighted)
  let bestAvgHR15to45 = 0;
  let bestMaxHR = 0;

  // Raccogli efforts per bucket di durata (power-duration model)
  const pdBuckets = {
    sprint: { min: 0, max: 5*60, efforts: [], factor: 0.72 },      // ~72% of 5min power
    vo2: { min: 3*60, max: 8*60, efforts: [], factor: 0.82 },       // ~82% of VO2max
    subThreshold: { min: 8*60, max: 20*60, efforts: [], factor: 0.92 }, // ~92%
    threshold: { min: 15*60, max: 40*60, efforts: [], factor: 0.95 },   // classico 95%
    endurance: { min: 40*60, max: 90*60, efforts: [], factor: 1.0 },    // FTP diretto
  };

  // Sforzi su segmenti idonei (salita) hanno priorità
  const suitableEfforts = [];
  const allEfforts = [];

  for (const id in cache) {
    const c = cache[id];
    if (!c.efforts) continue;
    const seg = c._segment || {}; // segment metadata se disponibile
    const isSuitable = isSegmentFTPSuitable(seg);

    for (const e of c.efforts) {
      const t = e.elapsed_time || 0;
      const decay = effortDecay(e.start_date);

      // Power-duration buckets
      if (e.average_watts && t >= 60) {
        const entry = { watts: e.average_watts, time: t, decay, date: e.start_date, suitable: isSuitable };
        allEfforts.push(entry);
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
  const estimates = [];

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
  const pdEstimates = [];
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
        .filter(([id, c]) => isSegmentFTPSuitable(c._segment || {}))
        .map(([id]) => id)
    ).size,
  };
}

function linearRegression(points) {
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
function formAdjustedTime(baseTime, bestTime, formCtx) {
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

function computePrediction(entry, formCtx) {
  const sorted = entry.efforts.slice()
    .sort((a,b) => new Date(a.start_date) - new Date(b.start_date));
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

function renderSparkline(points, best, W = 120, H = 40) {
  if (!points.length) return '';
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys, best), ymax = Math.max(...ys);
  const rx = xmax - xmin || 1, ry = ymax - ymin || 1;
  const path = points.map((p, i) => {
    const x = ((p.x - xmin) / rx) * (W - 8) + 4;
    const y = H - 4 - ((p.y - ymin) / ry) * (H - 8);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const bestY = H - 4 - ((best - ymin) / ry) * (H - 8);
  return `<svg viewBox="0 0 ${W} ${H}" class="sparkline">
    <line x1="0" y1="${bestY}" x2="${W}" y2="${bestY}" stroke="#ffd700" stroke-dasharray="2 2" stroke-width="1" opacity=".6"/>
    <path d="${path}" fill="none" stroke="#fc5200" stroke-width="2" stroke-linejoin="round"/>
    ${points.map(p => {
      const x = ((p.x - xmin) / rx) * (W - 8) + 4;
      const y = H - 4 - ((p.y - ymin) / ry) * (H - 8);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#fc5200"/>`;
    }).join('')}
  </svg>`;
}

// ---- Segment-based workout targeting ----
// Se l'atleta ha un segmento obiettivo (es: salita di 25 min),
// genera intervalli specifici alla potenza/tempo target per quel segmento.
function segmentTargetedWorkout(segmentEntry, ftp, hrLthr) {
  if (!segmentEntry || !segmentEntry.efforts?.length) return null;

  const seg = segmentEntry.segment;
  const sorted = segmentEntry.efforts.slice()
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
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
  let workout;
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
  workout.segmentStats = {
    name: seg.name,
    prTime: segDuration,
    targetTime,
    bestWatts,
    targetWatts,
    distance: seg.distance,
    grade: segGrade,
    attempts: sorted.length,
    recentTrend: recent.length >= 2 ? (recent[recent.length-1].elapsed_time - recent[0].elapsed_time) / recent.length : 0,
  };

  return workout;
}

// Genera workout mirati per tutti i segmenti top (quelli con più tentativi e trend negativo)
function generateSegmentWorkouts(list, ftp, hrLthr) {
  if (!list || !list.length) return [];

  return list
    .filter(e => e.efforts.length >= 3) // almeno 3 tentativi
    .map(e => {
      const workout = segmentTargetedWorkout(e, ftp, hrLthr);
      if (!workout) return null;
      return { segment: e.segment, workout };
    })
    .filter(Boolean)
    .sort((a, b) => b.workout.segmentStats.attempts - a.workout.segmentStats.attempts)
    .slice(0, 5); // top 5 segmenti
}

function renderSegmentWorkouts(list, ftp, hrLthr) {
  const workouts = generateSegmentWorkouts(list, ftp, hrLthr);
  if (!workouts.length) return '<p class="muted">Servono almeno 3 tentativi su un segmento per generare workout mirati.</p>';

  return workouts.map(({ segment, workout }) => {
    const stats = workout.segmentStats;
    const trendLabel = stats.recentTrend < -1 ? '📈 in miglioramento'
      : stats.recentTrend > 1 ? '📉 in peggioramento' : '→ stabile';

    return `<details class="seg-workout-card">
      <summary>🎯 ${escapeHtml(segment.name)} — PR ${fmtTime(stats.prTime)} → target ${fmtTime(stats.targetTime)}</summary>
      <div class="metrics" style="margin:.5rem 0">
        <div><span class="muted">Distanza</span><b>${(stats.distance/1000).toFixed(2)} km</b></div>
        <div><span class="muted">Pendenza</span><b>${stats.grade.toFixed(1)}%</b></div>
        <div><span class="muted">Tentativi</span><b>${stats.attempts}</b></div>
        <div><span class="muted">Trend</span><b>${trendLabel}</b></div>
        ${stats.bestWatts ? `<div><span class="muted">Best W</span><b>${stats.bestWatts}W</b></div>` : ''}
        ${stats.targetWatts ? `<div><span class="muted">Target W</span><b>${stats.targetWatts}W</b></div>` : ''}
      </div>
      <div class="seg-workout-detail">${escapeHtml(workout.detail)}</div>
      <div class="muted" style="font-size:.8rem; margin-top:.5rem">${escapeHtml(workout.reason)}</div>
    </details>`;
  }).join('');
}

function renderPredictions(list, formCtx) {
  if (!list.length) {
    return `<p class="muted">Nessun segmento preferito con tentativi. Metti una stella ⭐ ai tuoi segmenti su Strava e ricarica.</p>`;
  }
  const formLabel = formCtx
    ? `<p class="muted" style="font-size:.85rem; margin:0 0 .75rem">Previsioni adattate al tuo stato attuale — CTL ${formCtx.ctl.toFixed(0)}, TSB ${formCtx.tsb > 0 ? '+' : ''}${formCtx.tsb.toFixed(0)}.</p>`
    : '';
  const sorted = list.slice().map(e => ({ e, p: computePrediction(e, formCtx) }))
    .sort((a,b) => b.p.attempts - a.p.attempts);
  return formLabel + `<div class="pred-grid">${sorted.map(({e, p}) => {
    const trend = p.trendPerWeek;
    const trendClass = trend < -0.5 ? 'good' : trend > 0.5 ? 'bad' : 'neutral';
    const trendLabel = trend < -0.1 ? `−${Math.abs(trend).toFixed(1)} s/sett`
      : trend > 0.1 ? `+${trend.toFixed(1)} s/sett` : '→ stabile';
    const distKm = (e.segment.distance/1000).toFixed(2);
    const grade = e.segment.average_grade != null ? e.segment.average_grade.toFixed(1) + '%' : '—';
    const gain = Math.round(e.segment.total_elevation_gain || 0);
    const predDelta = p.predictedForm - p.best.elapsed_time;
    const predVsBest = predDelta > 0 ? `+${Math.round(predDelta)}s da PR` : 'possibile nuovo PR 🔥';
    const formDelta = p.predictedForm - p.predictedBase;
    const formAdjLabel = Math.abs(formDelta) < 1 ? ''
      : formDelta < 0 ? `<span class="form-adj good">forma: −${Math.abs(Math.round(formDelta))}s</span>`
      : `<span class="form-adj bad">forma: +${Math.round(formDelta)}s</span>`;
    return `
      <div class="pred-card">
        <div class="pred-head">
          <a href="https://www.strava.com/segments/${e.segment.id}" target="_blank" rel="noopener" class="pred-name">${escapeHtml(e.segment.name)}</a>
          <span class="pred-meta muted">${distKm} km · ${gain}m · ${grade}</span>
        </div>
        <div class="pred-body">
          <div class="pred-spark">${renderSparkline(p.points, p.best.elapsed_time)}</div>
          <div class="pred-stats">
            <div><span class="muted">PR</span><b>${fmtTime(p.best.elapsed_time)}</b></div>
            <div><span class="muted">Ultimo</span><b>${fmtTime(p.last.elapsed_time)}</b></div>
            <div><span class="muted">Tentativi</span><b>${p.attempts}</b></div>
            <div><span class="muted">Trend</span><b class="trend-${trendClass}">${trendLabel}</b></div>
          </div>
        </div>
        <div class="pred-foot">
          <span class="muted">Prossimo tentativo (≈2 sett., forma attuale):</span>
          <b class="pred-value">${fmtTime(p.predictedForm)}</b>
          <span class="muted">· ${predVsBest}</span>
          ${formAdjLabel}
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

export {
  clearSegCache, loadSegCache, saveSegCache, loadSegmentPredictions,
  hydrateSegmentsFromActivities, isSegmentFTPSuitable, effortDecay,
  estimatesFromSegments, linearRegression, formAdjustedTime, computePrediction,
  renderSparkline, segmentTargetedWorkout, generateSegmentWorkouts,
  renderSegmentWorkouts, renderPredictions,
};
