// Testi e numeri delle previsioni sui segmenti preferiti e dei workout mirati, come la tab
// Analisi di oggi. I nomi dei segmenti restano come li ha scritti l'atleta: le schermate
// li mostrano come testo.

import { fmtTime } from './format.ts';
import { computePrediction, type FormContext, type Point, type SegmentEntry, type SegmentWorkout } from './segments.ts';
import type { Segment } from './strava-types.ts';

export interface SegmentDiagSummary {
  totalStarred: number;
  withEfforts: number;
  noEfforts: number;
  errors: { name: string; msg: string }[];
  fromCache: number;
  fetched: number;
}

export const diagLine = (d: SegmentDiagSummary): string =>
  `📊 ${d.totalStarred} segmenti preferiti · ${d.withEfforts} con tentativi · ${d.noEfforts} senza tentativi · ` +
  `${d.errors.length} errori · ${d.fromCache} da cache / ${d.fetched} scaricati ora`;

// Le prime 20 righe degli errori, una per segmento.
export const errorLines = (d: SegmentDiagSummary): string =>
  d.errors.slice(0, 20).map(e => `${e.name}: ${e.msg}`).join('\n');

export const formLine = (ctx: FormContext): string =>
  `Previsioni adattate al tuo stato attuale — CTL ${ctx.ctl.toFixed(0)}, TSB ${ctx.tsb > 0 ? '+' : ''}${ctx.tsb.toFixed(0)}.`;

// Una card per segmento, da quello con più tentativi.
export function predictionCards(list: SegmentEntry[], formCtx: FormContext | null) {
  return list.map(e => ({ e, p: computePrediction(e, formCtx) }))
    .sort((a, b) => b.p.attempts - a.p.attempts)
    .map(({ e, p }) => {
      const trend = p.trendPerWeek;
      const predDelta = p.predictedForm - p.best.elapsed_time;
      const formDelta = p.predictedForm - p.predictedBase;
      return {
        id: e.segment.id,
        name: e.segment.name,
        meta: `${(e.segment.distance / 1000).toFixed(2)} km · ${Math.round(e.segment.total_elevation_gain || 0)}m · ` +
          (e.segment.average_grade != null ? e.segment.average_grade.toFixed(1) + '%' : '—'),
        points: p.points,
        best: p.best.elapsed_time,
        pr: fmtTime(p.best.elapsed_time),
        last: fmtTime(p.last.elapsed_time),
        attempts: p.attempts,
        trend: {
          kind: trend < -0.5 ? 'good' : trend > 0.5 ? 'bad' : 'neutral',
          text: trend < -0.1 ? `−${Math.abs(trend).toFixed(1)} s/sett` : trend > 0.1 ? `+${trend.toFixed(1)} s/sett` : '→ stabile',
        },
        predicted: fmtTime(p.predictedForm),
        vsBest: predDelta > 0 ? `+${Math.round(predDelta)}s da PR` : 'possibile nuovo PR 🔥',
        formAdj: Math.abs(formDelta) < 1 ? null
          : formDelta < 0 ? { good: true, text: `forma: −${Math.abs(Math.round(formDelta))}s` }
            : { good: false, text: `forma: +${Math.round(formDelta)}s` },
      };
    });
}

// Un workout per segmento: titolo con PR e obiettivo, numeri, istruzioni e motivo.
export function workoutCards(workouts: { segment: Segment; workout: SegmentWorkout }[]) {
  return workouts.map(({ segment, workout }) => {
    const s = workout.segmentStats;
    const trend = s.recentTrend < -1 ? '📈 in miglioramento' : s.recentTrend > 1 ? '📉 in peggioramento' : '→ stabile';
    const rows: [string, string][] = [
      ['Distanza', `${(s.distance / 1000).toFixed(2)} km`], ['Pendenza', `${s.grade.toFixed(1)}%`],
      ['Tentativi', String(s.attempts)], ['Trend', trend],
      ...(s.bestWatts ? [['Best W', `${s.bestWatts}W`] as [string, string]] : []),
      ...(s.targetWatts ? [['Target W', `${s.targetWatts}W`] as [string, string]] : []),
    ];
    return {
      id: segment.id, name: segment.name, target: `PR ${fmtTime(s.prTime)} → target ${fmtTime(s.targetTime)}`,
      rows, detail: workout.detail, reason: workout.reason,
    };
  });
}

// La linea dei tempi di un segmento in un riquadro W×H, con la riga del PR: più in alto
// è più lento, come oggi.
export function sparkline(points: Point[], best: number, W = 120, H = 40) {
  if (!points.length) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys, best), ymax = Math.max(...ys);
  const rx = xmax - xmin || 1, ry = ymax - ymin || 1;
  const dots = points.map(p => ({
    x: +(((p.x - xmin) / rx) * (W - 8) + 4).toFixed(1),
    y: +(H - 4 - ((p.y - ymin) / ry) * (H - 8)).toFixed(1),
  }));
  const path = dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join(' ');
  return { path, dots, bestY: H - 4 - ((best - ymin) / ry) * (H - 8) };
}
