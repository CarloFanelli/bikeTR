// FTP e soglia cardiaca (LTHR): stime dalle attività, scelta tra valori dichiarati e
// stimati, distribuzione nelle zone di frequenza cardiaca.

import { buildDateHelpers } from './dates.ts';
import { effortDecay, type SegmentEstimates } from './segments.ts';
import type { Activity } from './strava-types.ts';

// Le impostazioni dell'atleta che contano per FTP e frequenza cardiaca.
export interface HrSettings {
  hrMax?: number;
  hrLthr?: number;
  lthrSource?: string;
  ftpDeclared?: number;
  ftpSource?: string;
}

// I valori usati dai calcoli e da dove vengono.
export interface HrProfile {
  hrMax: number | undefined;
  hrLthr: number | null;
  ftp: number | null;
  lthrDecl: number | null;
  lthrEst: number | null;
  lthrSource: string | null;
  lthrEstFromActivities: number | null;
  lthrEstFromSegments: number | null;
  ftpDecl: number | null;
  ftpEst: number | null;
  ftpSource: string | null;
  ftpEstFromActivities: number | null;
  ftpEstFromSegments: number | null;
}

// Watt di un'attività: la potenza normalizzata di Strava, se c'è, altrimenti la media.
export const activityWatts = (a: Activity): number => a.weighted_average_watts || a.average_watts || 0;

// Durate degli sforzi per la stima FTP, dalla più affidabile, e il fattore che porta
// la loro potenza alla FTP.
export const FTP_BUCKETS = [
  { min: 40*60, max: 90*60, factor: 0.98, label: '40-90 min' },
  { min: 20*60, max: 40*60, factor: 0.95, label: '20-40 min' },
  { min: 10*60, max: 20*60, factor: 0.90, label: '10-20 min' },
  { min: 0,     max: 10*60, factor: 0.85, label: '< 10 min' },
];

// Stima LTHR. M1: FC massima osservata × 0.91 (media Friel/Coggan/Allen 88-92%; vale
// anche al contrario, HRmax = LTHR / 0.91). M2: miglior FC media di un'uscita di 20-60
// minuti × 0.98, solo se la sua FC massima arriva al 90% di quella osservata: l'atleta
// ha spinto davvero, non è un Z2 lungo.
export const LTHR_OVER_HRMAX = 0.91;
export const LTHR_TEST_FACTOR = 0.98;
export const isLthrTestLike = (a: Activity, observedHRmax: number): boolean => !!(
  a.average_heartrate && a.max_heartrate &&
  (a.moving_time || 0) >= 20*60 && (a.moving_time || 0) <= 60*60 &&
  a.max_heartrate >= observedHRmax * 0.9
);

// ---- Stima FTP ----
// Stima FTP da attività con power-duration model multi-bucket (FTP_BUCKETS) + decadimento
// temporale: sforzi recenti pesano di più (half-life 8 settimane).
// Limitazione: senza streams reali, il WAP summary di Strava non è una NP esatta
// ma una buona approssimazione; per 20-60 min ragionevolmente accurato.
export function estimateFTP(activities: Activity[] | null | undefined, now: Date): number | null {
  if (!activities) return null;
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const withPower = bikes.filter(a => activityWatts(a));
  if (!withPower.length) return null;

  // Priorità: bucket più lunghi sono più affidabili per FTP (già ordinati per durata decrescente):
  // vale il primo con attività, con il best recency-weighted.
  for (const b of FTP_BUCKETS) {
    const pool = withPower.filter(a => {
      const t = a.moving_time || 0;
      return t >= b.min && t < b.max;
    });
    if (!pool.length) continue;
    const best = pool.map(a => ({ watts: activityWatts(a), weighted: activityWatts(a) * effortDecay(a.start_date_local, now) }))
      .sort((a, c) => c.weighted - a.weighted)[0];
    return Math.round(best.watts * b.factor);
  }

  // Fallback assoluto
  const best = Math.max(...withPower.map(activityWatts));
  return Math.round(best * 0.88);
}

// ---- Stima LTHR ----
// Il maggiore tra M1 e M2 (vedi LTHR_OVER_HRMAX e isLthrTestLike).
export function estimateLTHR(activities: Activity[] | null | undefined): number | null {
  if (!activities) return null;
  const bikes = activities.filter(a =>
    a.type && a.type.includes('Ride') && a.has_heartrate
  );
  if (!bikes.length) return null;
  const maxHrs = bikes.map(a => a.max_heartrate || 0).filter(x => x > 0);
  if (!maxHrs.length) return null;
  const observedHRmax = Math.max(...maxHrs);

  const m1 = Math.round(observedHRmax * LTHR_OVER_HRMAX);
  const testLike = bikes.filter(a => isLthrTestLike(a, observedHRmax));
  let m2 = null;
  if (testLike.length) {
    const best = Math.max(...testLike.map(a => a.average_heartrate || 0));
    m2 = Math.round(best * LTHR_TEST_FACTOR);
  }

  return Math.max(m1, m2 || 0);
}

// Valore dichiarato o stimato (MAX tra attività e segmenti, più affidabili), secondo
// la scelta nelle impostazioni. Senza attività (`activities` assente) contano solo
// i valori dichiarati e i segmenti.
export function resolveHr(
  settings: HrSettings | null | undefined, activities: Activity[] | null | undefined,
  segmentEstimates: Partial<SegmentEstimates> | null | undefined, now: Date,
): HrProfile {
  const s = settings || {};
  const segEst = segmentEstimates || {};
  const lthrDecl = s.hrLthr || null;
  const lthrEstAct = estimateLTHR(activities);
  const lthrEst = Math.max(lthrEstAct || 0, segEst.lthrFromSegments || 0) || null;
  const lthrSource = s.lthrSource || (lthrDecl ? 'declared' : (lthrEst ? 'estimated' : null));
  const hrLthr = (lthrSource === 'declared' && lthrDecl) ? lthrDecl
    : (lthrSource === 'estimated' && lthrEst) ? lthrEst
    : (lthrDecl || lthrEst);

  const ftpDecl = s.ftpDeclared || null;
  const ftpEstAct = estimateFTP(activities, now);
  // Stima FTP: MAX tra attività e segmenti
  const ftpEst = Math.max(ftpEstAct || 0, segEst.ftpFromSegments || 0) || null;
  const ftpSource = ftpDecl ? 'declared'
    : (s.ftpSource === 'estimated' && ftpEst) ? 'estimated'
    : null;
  const ftp = ftpDecl || (ftpSource === 'estimated' ? ftpEst : null);

  const hrMax = s.hrMax || (segEst.hrMaxFromSegments)
    || (hrLthr ? Math.round(hrLthr / LTHR_OVER_HRMAX) : undefined);
  return {
    hrMax, hrLthr, ftp,
    lthrDecl, lthrEst, lthrSource,
    lthrEstFromActivities: lthrEstAct,
    lthrEstFromSegments: segEst.lthrFromSegments || null,
    ftpDecl, ftpEst, ftpSource,
    ftpEstFromActivities: ftpEstAct,
    ftpEstFromSegments: segEst.ftpFromSegments || null,
  };
}

export interface HrZone {
  label: string;
  color: string;
  min: number;
  max: number;
  minutes: number;
}

// ---- Zone FC ultime 4 settimane ----
// Minuti di bici per zona, secondo la FC media di ogni uscita; null senza LTHR.
export function buildHrZones(activities: Activity[], hrLthr: number | null | undefined, now: Date) {
  if (!hrLthr) return null;
  const bikes = activities.filter(a =>
    a.type && a.type.includes('Ride') && a.has_heartrate && a.average_heartrate
  );
  const { ago } = buildDateHelpers(0, now);
  const recent = bikes.filter(a => ago(a.start_date_local) < 28);
  const zones: HrZone[] = [
    { label: 'Z1 Recupero', color: '#4ade80', min: 0, max: 0.75, minutes: 0 },
    { label: 'Z2 Aerobico', color: '#22c55e', min: 0.75, max: 0.88, minutes: 0 },
    { label: 'Z3 Tempo', color: '#facc15', min: 0.88, max: 0.94, minutes: 0 },
    { label: 'Z4 Soglia', color: '#fc5200', min: 0.94, max: 1.05, minutes: 0 },
    { label: 'Z5 VO2+', color: '#ff6b6b', min: 1.05, max: 99, minutes: 0 },
  ];
  recent.forEach(a => {
    const r = (a.average_heartrate || 0) / hrLthr;
    const z = zones.find(z => r >= z.min && r < z.max);
    if (z) z.minutes += (a.moving_time || 0) / 60;
  });
  const total = zones.reduce((s, z) => s + z.minutes, 0);
  return { zones, total };
}
