// Previsioni sui segmenti preferiti: card con trend e tempo stimato al prossimo tentativo.
// Il caricamento dei tentativi sta in src/data/segments.ts, i calcoli in src/core/segments.ts.
import { fmtTime, escapeHtml } from './strava.js';
import {
  isSegmentFTPSuitable, effortDecay as effortDecayFrom, estimatesFromSegments as estimatesFrom,
  linearRegression, formAdjustedTime, computePrediction, segmentTargetedWorkout, generateSegmentWorkouts,
} from './src/core/segments.ts';
import {
  completeFromActivities as hydrateSegmentsFromActivities, loadSegmentPredictions,
} from './src/data/segments.ts';
import {
  clearSegmentCache as clearSegCache, loadSegmentCache as loadSegCache, saveSegmentCache as saveSegCache,
} from './src/data/storage.ts';

// I calcoli stanno in src/core/segments.ts; queste versioni leggono orologio e segmenti salvati.
const effortDecay = (startDate) => effortDecayFrom(startDate, new Date());
const estimatesFromSegments = () => estimatesFrom(loadSegCache(), new Date());

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
