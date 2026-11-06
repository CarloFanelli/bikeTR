// Il grafico del carico degli ultimi 30 giorni nella tab Allenamento: un valore per giorno.

import { dayOffsetIso } from '../dates.ts';
import { isoDay } from '../format.ts';
import type { HrProfile } from '../hr.ts';
import { activityLoad, isHard } from '../load.ts';
import type { Activity } from '../strava-types.ts';

// Un giorno del grafico: il carico e che cosa c'è stato (per il colore della barra).
export interface LoadChartDay {
  iso: string;
  load: number;
  hard: boolean;
  long: boolean;
  hasActivity: boolean;
  nonBike: boolean;
  bike: boolean;
}

// Dal giorno più vecchio a oggi.
export function loadChartDays(activities: Activity[], hr: Pick<HrProfile, 'hrMax' | 'hrLthr' | 'ftp'>, now: Date): LoadChartDay[] {
  const { hrMax, hrLthr, ftp } = hr;
  const DAYS = 30;
  const bars: LoadChartDay[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const iso = dayOffsetIso(-i, now);
    const acts = activities.filter(a => isoDay(a.start_date_local) === iso);
    const load = acts.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0);
    const bikeAct = acts.find(a => a.type && a.type.includes('Ride'));
    const hard = !!bikeAct && isHard(bikeAct, hrLthr, ftp);
    const long = acts.some(a => a.type && a.type.includes('Ride') && (a.moving_time||0) >= 120*60);
    const nonBike = acts.some(a => !(a.type && a.type.includes('Ride')));
    bars.push({ iso, load, hard, long, hasActivity: acts.length > 0, nonBike, bike: !!bikeAct });
  }
  return bars;
}
