// Profilo dell'atleta: livello dai km totali, costanza, forma recente e record personali.

import { buildDateHelpers } from './dates.ts';
import type { Activity, AthleteStats } from './strava-types.ts';

export interface Level {
  key: string;
  label: string;
  note: string;
}

// Classifica il livello dell'atleta in base ai km all-time
export function levelFromKm(km: number): Level {
  if (km < 500) return { key: 'new', label: 'Nuovo alla bici',
    note: 'Focus adattamento: 1 sola intensità/sett, solo Sweet Spot, niente VO2max per ora.' };
  if (km < 3000) return { key: 'beginner', label: 'Principiante',
    note: 'Base aerobica prioritaria. 1 sessione di qualità/sett, evita VO2max.' };
  if (km < 15000) return { key: 'intermediate', label: 'Intermedio',
    note: 'Puoi reggere 2 intensità/sett + lunga. Rotazione Sweet Spot/Soglia/VO2.' };
  if (km < 50000) return { key: 'advanced', label: 'Avanzato',
    note: 'Piano polarizzato, intensità mirate, volume sostenuto.' };
  return { key: 'veteran', label: 'Veterano',
    note: 'Gestione fine del recupero, varietà negli stimoli, attenzione ai segnali.' };
}

// Quota delle ultime 8 settimane con almeno 3 uscite in bici.
export function consistencyScore(activities: Activity[], now: Date): number {
  const bikeActs = activities.filter(a => a.type && a.type.includes('Ride'));
  const { ago } = buildDateHelpers(0, now);
  let weeksOk = 0;
  for (let w = 0; w < 8; w++) {
    const from = w * 7, to = from + 7;
    const cnt = bikeActs.filter(a => {
      const da = ago(a.start_date_local);
      return da >= from && da < to;
    }).length;
    if (cnt >= 3) weeksOk++;
  }
  return weeksOk / 8;
}

export function buildProfile(
  stats: AthleteStats | null | undefined, activities: Activity[], settings: { weight?: number } | null | undefined, now: Date,
) {
  const s = settings || {};
  const allRide = stats?.all_ride_totals;
  const recent = stats?.recent_ride_totals;
  const allKm = (allRide?.distance || 0) / 1000;
  const allCount = allRide?.count || 0;
  const recentKm = (recent?.distance || 0) / 1000;
  const recentHours = (recent?.moving_time || 0) / 3600;
  const recentCount = recent?.count || 0;
  const level = levelFromKm(allKm);
  const consistency = consistencyScore(activities, now);

  let wPerKg = null;
  if (s.weight) {
    const acts = activities.filter(a => a.weighted_average_watts || a.average_watts).slice(0, 20);
    if (acts.length) {
      const best = Math.max(...acts.map(a => a.weighted_average_watts || a.average_watts || 0));
      wPerKg = (best / s.weight).toFixed(2);
    }
  }

  // Forma: confronto ore recenti (4 sett.) con una soglia per livello
  const expectedWeeklyHours = level.key === 'new' ? 3
    : level.key === 'beginner' ? 5
    : level.key === 'intermediate' ? 7
    : level.key === 'advanced' ? 10 : 12;
  const weeklyRecent = recentHours / 4;
  const formRatio = expectedWeeklyHours > 0 ? weeklyRecent / expectedWeeklyHours : 0;
  const form = formRatio > 1.1 ? 'ottima'
    : formRatio > 0.85 ? 'buona'
    : formRatio > 0.5 ? 'in costruzione' : 'bassa / da riavviare';

  return {
    allKm, allCount, recentKm, recentHours, recentCount,
    level, consistency, wPerKg, form, weeklyRecent,
  };
}

// Uscita più lunga, con più dislivello, più veloce sopra 30 km e più dura; null senza uscite.
export function personalRecords(activities: Activity[]) {
  const rides = activities.filter(a => a.type && a.type.includes('Ride'));
  if (!rides.length) return null;
  const by = (fn: (a: Activity) => number) => rides.reduce((best, a) => fn(a) > fn(best) ? a : best, rides[0]);
  const longest = by(a => a.moving_time || 0);
  const mostClimb = by(a => a.total_elevation_gain || 0);
  const fastest = rides.filter(a => a.distance > 30000).reduce<Activity | null>(
    (b, a) => (!b || (a.average_speed||0) > (b.average_speed||0)) ? a : b, null
  );
  const mostSuffer = rides.filter(a => a.suffer_score).reduce<Activity | null>(
    (b, a) => (!b || (a.suffer_score || 0) > (b.suffer_score || 0)) ? a : b, null
  );
  return { longest, mostClimb, fastest, mostSuffer };
}
