// Il modello di allenamento della tab Allenamento: abitudini e carico delle ultime 6 settimane.

import type { HrProfile } from '../hr.ts';
import { activityLoad, isHard, typeWeight } from '../load.ts';
import type { Activity } from '../strava-types.ts';

// ---- Training model: analizza 42gg per costruire un profilo di allenamento ----
export function buildTrainingModel(activities: Activity[], hr: Pick<HrProfile, 'hrMax' | 'hrLthr' | 'ftp'>, now: Date) {
  const { hrMax, hrLthr, ftp } = hr;
  const today = new Date(now); today.setHours(0,0,0,0);
  const daysFromIso = (iso: string) => {
    const d = new Date(iso); d.setHours(0,0,0,0);
    return Math.round((today.getTime() - d.getTime()) / 86400000);
  };
  const WINDOW = 42;
  const acts = activities.filter(a => {
    const da = daysFromIso(a.start_date_local);
    return da >= 0 && da < WINDOW;
  });
  const weeks = WINDOW / 7;

  // 1) Pattern settimanale: per ogni dow conta frequenza e load medio
  const dowStats = Array(7).fill(null).map(() => ({ count: 0, load: 0, hards: 0 }));
  acts.forEach(a => {
    const d = new Date(a.start_date_local);
    const dow = d.getDay();
    dowStats[dow].count++;
    dowStats[dow].load += activityLoad(a, hrMax, hrLthr, ftp);
    if (a.type?.includes('Ride') && isHard(a, hrLthr, ftp)) dowStats[dow].hards++;
  });

  // Giorni preferiti per allenamento: frequenza >= 50%
  const preferredDays = dowStats
    .map((st, dow) => ({ dow, ...st, frequency: st.count / weeks }))
    .filter(d => d.frequency >= 0.5)
    .sort((a, b) => b.frequency - a.frequency)
    .map(d => d.dow);

  // Giorni dow dove metti intensità storicamente (ordinati per frequenza)
  const hardDowHistorical = dowStats
    .map((st, dow) => ({ dow, hards: st.hards, load: st.load }))
    .filter(d => d.hards > 0)
    .sort((a, b) => b.hards - a.hards)
    .map(d => d.dow);

  // 2) Carico settimanale ultime 6 settimane → progressione
  const weeklyLoads: number[] = [];
  for (let w = 0; w < weeks; w++) {
    const wk = acts.filter(a => {
      const da = daysFromIso(a.start_date_local);
      return da >= w*7 && da < (w+1)*7;
    });
    weeklyLoads.push(wk.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0));
  }
  const avgWeeklyLoad = weeklyLoads.reduce((s,l) => s+l, 0) / weeks;
  // Regressione lineare su weekIdx → load (weekIdx 0 = questa settimana)
  const points = weeklyLoads.map((l,i) => ({ x: -i, y: l }));
  const n = points.length;
  const sX = points.reduce((s,p)=>s+p.x,0);
  const sY = points.reduce((s,p)=>s+p.y,0);
  const sXY = points.reduce((s,p)=>s+p.x*p.y,0);
  const sX2 = points.reduce((s,p)=>s+p.x*p.x,0);
  const denom = n*sX2 - sX*sX;
  const progressionPerWeek = denom ? (n*sXY - sX*sY) / denom : 0;

  // 3) Polarizzazione effettiva
  let easyMin = 0, hardMin = 0;
  acts.forEach(a => {
    const mins = (a.moving_time||0) / 60 * typeWeight(a);
    if (hrLthr && a.has_heartrate && a.average_heartrate) {
      if (a.average_heartrate >= hrLthr * 0.88) hardMin += mins;
      else easyMin += mins;
    } else {
      easyMin += mins;
    }
  });
  const totalMin = easyMin + hardMin;
  const polarization = totalMin > 0
    ? { easyPct: easyMin / totalMin, hardPct: hardMin / totalMin, totalMin }
    : null;

  // 4) Target carico settimanale (progressione safe +3% vs media, ±10% se progressione già buona)
  const targetWeeklyLoad = Math.max(avgWeeklyLoad * 1.03, avgWeeklyLoad + 10);

  // 5) Recovery week solo se: 4+ settimane consecutive ad alto carico,
  //    nessuno scarico recente, progressione in crescita. Evita false recovery in stati stabili.
  let consecLoad = 0;
  for (let i = 0; i < weeks; i++) {
    if (weeklyLoads[i] >= avgWeeklyLoad * 0.9) consecLoad++;
    else break;
  }
  const recentWeeks = weeklyLoads.slice(0, 4);
  const hasRecentDeload = recentWeeks.some(l => l < avgWeeklyLoad * 0.65);
  const needsRecoveryWeek = consecLoad >= 4 && !hasRecentDeload && progressionPerWeek > 0;

  return {
    window: WINDOW, weeks,
    preferredDays, hardDowHistorical, dowStats,
    weeklyLoads, avgWeeklyLoad, progressionPerWeek,
    polarization, targetWeeklyLoad,
    consecLoad, needsRecoveryWeek,
  };
}
