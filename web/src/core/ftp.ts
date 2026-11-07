// Storico della FTP (un punto a settimana), andamento e plateau, e dettaglio del
// calcolo delle stime di FTP e LTHR per Analisi.

import { isoDay } from './format.ts';
import {
  activityWatts, FTP_BUCKETS, type HrProfile, isLthrTestLike, LTHR_OVER_HRMAX, LTHR_TEST_FACTOR,
} from './hr.ts';
import { effortDecay, linearRegression } from './segments.ts';
import type { Activity } from './strava-types.ts';

export interface FtpPoint {
  date: string;
  ftp: number;
  source: string;
}

// Un'osservazione da mostrare all'atleta.
export interface Insight {
  icon: string;
  text: string;
}

// ---- FTP Trend Tracking ----
// Lo storico dopo il punto FTP di oggi: al massimo uno ogni 5 giorni, gli ultimi 52
// (un anno). null quando non c'è niente da aggiungere: nessuna FTP, o troppo presto.
export function nextFtpHistory(
  history: FtpPoint[], profile: Pick<HrProfile, 'ftp' | 'ftpSource' | 'ftpEst' | 'ftpDecl'>, now: Date,
): FtpPoint[] | null {
  const { ftp, ftpSource, ftpEst, ftpDecl } = profile;
  const effectiveFtp = ftpDecl || ftpEst || ftp;
  if (!effectiveFtp) return null;

  const today = isoDay(now);
  const lastEntry = history[history.length - 1];
  if (lastEntry) {
    const daysSinceLast = (new Date(today).getTime() - new Date(lastEntry.date).getTime()) / 86400000;
    if (daysSinceLast < 5) return null; // troppo presto per un nuovo punto
  }

  return [...history, {
    date: today,
    ftp: effectiveFtp,
    source: ftpDecl ? 'declared' : (ftpSource || 'estimated'),
  }].slice(-52);
}

// Analizza il trend FTP e identifica plateau; null con meno di 2 punti.
export function buildFtpTrend(history: FtpPoint[]) {
  if (history.length < 2) return null;

  const points = history.map((h, i) => ({ x: i, y: h.ftp }));
  const reg = linearRegression(points);

  // Trend ultimi N punti
  const recentN = Math.min(6, history.length);
  const recent = history.slice(-recentN);
  const recentPoints = recent.map((h, i) => ({ x: i, y: h.ftp }));
  const recentReg = linearRegression(recentPoints);

  // Plateau detection: se slope < 0.5 W/settimana per 6+ settimane
  const isPlateauDetected = recentN >= 4 && Math.abs(recentReg.slope) < 0.5;

  // Picco storico
  const peakFtp = Math.max(...history.map(h => h.ftp));
  const peakDate = history.find(h => h.ftp === peakFtp)?.date;
  const currentFtp = history[history.length - 1].ftp;
  const pctFromPeak = peakFtp > 0 ? +((currentFtp / peakFtp) * 100).toFixed(0) : 100;

  // Variazione sulle ultime 4 settimane
  const fourWeeksAgo = history.length >= 4 ? history[history.length - 4].ftp : history[0].ftp;
  const delta4w = currentFtp - fourWeeksAgo;

  return {
    history,
    slope: +reg.slope.toFixed(2), // W/punto (≈ W/settimana)
    recentSlope: +recentReg.slope.toFixed(2),
    isPlateauDetected,
    peakFtp,
    peakDate,
    currentFtp,
    pctFromPeak,
    delta4w,
    insights: buildFtpInsights(currentFtp, peakFtp, delta4w, isPlateauDetected, recentReg.slope),
  };
}
export type FtpTrend = NonNullable<ReturnType<typeof buildFtpTrend>>;

function buildFtpInsights(
  current: number, peak: number, delta4w: number, isPlateau: boolean, recentSlope: number,
): Insight[] {
  const out: Insight[] = [];

  if (isPlateau) {
    out.push({
      icon: '⚠️',
      text: `FTP in plateau da diverse settimane (~${current}W). Considera un cambio di protocollo: se fai SST, passa a VO2max. Se fai VO2max, prova Over-Unders. Un nuovo stimolo può sbloccare la progressione.`,
    });
  }

  if (delta4w > 8) {
    out.push({
      icon: '📈',
      text: `FTP cresciuta di ${delta4w}W nelle ultime 4 settimane. Ottima progressione — il protocollo attuale funziona.`,
    });
  } else if (delta4w < -5) {
    out.push({
      icon: '📉',
      text: `FTP calata di ${Math.abs(delta4w)}W nelle ultime 4 settimane. Possibili cause: scarico prolungato, malattia, sovrallenamento. Monitora la situazione.`,
    });
  }

  if (current < peak * 0.92) {
    out.push({
      icon: '🎯',
      text: `Sei al ${Math.round(current / peak * 100)}% del tuo picco storico (${peak}W). Margine di recupero: ${peak - current}W.`,
    });
  }

  if (recentSlope > 2) {
    out.push({
      icon: '🚀',
      text: `Trend FTP in forte crescita (~${recentSlope.toFixed(1)}W/settimana). Mantieni il ritmo ma monitora il recupero.`,
    });
  }

  return out;
}

// =====================================================================
// Breakdown FTP / LTHR — dettaglio del calcolo in Analisi
// Replica internamente estimateFTP / estimateLTHR (hr.ts) esponendo le attività
// che hanno determinato la stima.
// =====================================================================

type FtpBreakdownRow =
  | { bucket: string; factor: number; empty: true }
  | { bucket: string; factor: number; empty?: undefined; act: Activity; rawWatts: number; decayValue: number; ftpCandidate: number };

export function buildFtpBreakdown(activities: Activity[] | null | undefined, now: Date) {
  if (!activities) return null;
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const withPower = bikes.filter(activityWatts);
  const decay = (a: Activity) => effortDecay(a.start_date_local, now);

  const rows: FtpBreakdownRow[] = [];
  for (const b of FTP_BUCKETS) {
    const pool = withPower.filter(a => {
      const t = a.moving_time || 0;
      return t >= b.min && t < b.max;
    });
    if (!pool.length) {
      rows.push({ bucket: b.label, factor: b.factor, empty: true });
      continue;
    }
    const scored = pool.map(a => {
      const w = activityWatts(a);
      return { watts: w, weighted: w * decay(a), act: a };
    }).sort((a, c) => c.weighted - a.weighted);
    const best = scored[0];
    rows.push({
      bucket: b.label,
      factor: b.factor,
      act: best.act,
      rawWatts: best.watts,
      decayValue: decay(best.act),
      ftpCandidate: Math.round(best.watts * b.factor),
    });
  }
  const winning = rows.find(r => !r.empty);
  return { rows, winning, fallback: !winning && withPower.length > 0 };
}

export function buildLthrBreakdown(activities: Activity[] | null | undefined) {
  if (!activities) return null;
  const bikes = activities.filter(a => a.type && a.type.includes('Ride') && a.has_heartrate);
  if (!bikes.length) return null;

  const maxHrs = bikes.map(a => ({ act: a, hr: a.max_heartrate || 0 })).filter(x => x.hr > 0);
  if (!maxHrs.length) return null;
  maxHrs.sort((a, b) => b.hr - a.hr);
  const observedHRmax = maxHrs[0].hr;
  const m1 = Math.round(observedHRmax * LTHR_OVER_HRMAX);

  const testLike = bikes.filter(a => isLthrTestLike(a, observedHRmax)).sort((a, b) => (b.average_heartrate || 0) - (a.average_heartrate || 0));

  let m2Row = null;
  if (testLike.length) {
    const rawHr = testLike[0].average_heartrate || 0;
    m2Row = { act: testLike[0], rawHr, factor: LTHR_TEST_FACTOR, value: Math.round(rawHr * LTHR_TEST_FACTOR) };
  }

  return {
    m1Row: { act: maxHrs[0].act, observedHRmax, factor: LTHR_OVER_HRMAX, value: m1 },
    m2Row,
    final: Math.max(m1, m2Row?.value || 0),
  };
}
