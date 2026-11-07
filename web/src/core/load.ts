// Carico di allenamento di ogni attività, sessioni dure e fatica muscolare.

import { buildDateHelpers } from './dates.ts';
import type { Activity } from './strava-types.ts';

// Peso BASE di ciascun tipo sul carico totale (1.0 = bici standard).
// typeWeight() restituisce un peso dinamico che tiene conto del dislivello per hike/walk.
const TYPE_WEIGHTS: Record<string, number> = {
  Ride: 1.0, VirtualRide: 1.0, EBikeRide: 0.7,
  MountainBikeRide: 1.0, GravelRide: 1.0,
  Run: 1.0, VirtualRun: 1.0, TrailRun: 1.05,
  Swim: 0.9,
  Walk: 0.2, Hike: 0.5,
  Workout: 0.6, WeightTraining: 0.5, Crossfit: 0.8,
  Yoga: 0.3, Pilates: 0.4, Elliptical: 0.8, StairStepper: 0.8,
  RockClimbing: 0.6, InlineSkate: 0.7, NordicSki: 1.0,
  BackcountrySki: 1.0, AlpineSki: 0.7, Snowboard: 0.6,
  Rowing: 0.9, Canoeing: 0.7, Kayaking: 0.7,
  Handcycle: 0.8, Velomobile: 0.8, Skateboard: 0.4,
};

// Peso dinamico: hike/walk scalano con dislivello, trail run con D+
export function typeWeight(act: Activity | string | null | undefined): number {
  // Retrocompatibilità: se chiamato con stringa sola (vecchio modo)
  if (typeof act === 'string') return TYPE_WEIGHTS[act] ?? 0.5;
  if (!act) return 0.5;

  const type = act.type || '';
  const base = TYPE_WEIGHTS[type] ?? 0.5;
  const elev = act.total_elevation_gain || 0;

  // Hike/Walk: scala con dislivello (escursione alpina 1500m D+ è quasi come una bici dura)
  if (type === 'Hike' || type === 'Walk') {
    if (elev > 1500) return 0.9;  // escursione alpina seria
    if (elev > 1000) return 0.8;  // escursione impegnativa
    if (elev > 500) return 0.65;  // escursione media
    if (elev > 200) return 0.45;  // passeggiata collinare
    return base;
  }

  // Trail run: bonus dislivello
  if (type === 'TrailRun') {
    if (elev > 800) return 1.15;
    if (elev > 400) return 1.1;
    return base;
  }

  return base;
}

// ---- Carico specifico per Hike con modello dislivello ----
// Il modello ACSM stima che il costo metabolico dell'hiking su pendenza
// è 2-3x quello del cammino in piano. Dislivello = stress muscolare eccentrico.
export function hikeSpecificLoad(act: Activity, _hrMax: number | null | undefined, hrLthr: number | null | undefined): number {
  const hours = (act.moving_time || 0) / 3600;
  const elev = act.total_elevation_gain || 0;
  const w = typeWeight(act);

  // Se HR disponibile, usa hrTSS-like con peso dinamico
  if (hrLthr && act.has_heartrate && act.average_heartrate) {
    const r = act.average_heartrate / hrLthr;
    const hrLoad = r * r * hours * 100 * w;
    // Bonus dislivello: stress muscolare eccentrico (discesa) + concentrico (salita)
    const elevBonus = elev / 100 * 1.2;
    return hrLoad + elevBonus;
  }

  // Senza HR: modello basato su durata + dislivello
  const baseTSS = hours * 45 * w; // ~45 TSS/h per hike moderato
  const elevBonus = elev / 100 * 1.5; // 1.5 TSS per 100m D+
  const durationBonus = hours > 3 ? (hours - 3) * 12 : 0; // fatica cumulativa >3h
  return baseTSS + elevBonus + durationBonus;
}

// ---- Fatigue muscolare da attività non-bici ----
// Restituisce un "muscular fatigue score" (0-100) per le attività degli ultimi `daysWindow`
// giorni che tiene conto di: dislivello, forza, eccentrico (trail run, hike in discesa)
export function muscularFatigueScore(activities: Activity[], daysWindow: number, now: Date): number {
  const { ago } = buildDateHelpers(0, now);
  const recent = activities.filter(a => {
    const da = ago(a.start_date_local);
    return da >= 0 && da < daysWindow;
  });

  let score = 0;
  for (const a of recent) {
    const elev = a.total_elevation_gain || 0;
    const hours = (a.moving_time || 0) / 3600;
    const type = a.type || '';

    // Dislivello totale = stress eccentrico/concentrico
    score += elev / 100 * 0.8;

    // Forza/corpo libero = DOMS per 24-48h
    if (['WeightTraining', 'Workout', 'Crossfit'].includes(type)) {
      score += hours * 12;
    }

    // Trail running = impatto articolare + eccentrico
    if (type === 'TrailRun') {
      score += hours * 6 + elev / 100 * 1.0;
    }

    // Hike lungo = fatica muscolare periferica
    if (type === 'Hike' && hours > 3) {
      score += (hours - 3) * 5;
    }

    // Rock climbing = grip/core
    if (type === 'RockClimbing') {
      score += hours * 8;
    }
  }

  return Math.min(100, Math.round(score));
}

// Load di un'attività — cascata di precisione:
//  0) TSS/hrTSS calcolati da streams (NP vera, time-weighted HR) — MAX precisione
//  1) TSS approssimato: IF² × hours × 100 (FTP + Weighted Avg Power summary)
//  2) hrTSS approssimato: (avgHR/LTHR)² × hours × 100
//  3) Proxy HR-max based (fallback vecchio)
//  4) Suffer score o stima lineare
// Moltiplicato per peso tipo dinamico (bici=1, hike scala con D+, ecc.)
// Attività hike/walk con dislivello usano modello specifico.
export function activityLoad(
  act: Activity, hrMax: number | null | undefined, hrLthr: number | null | undefined, ftp: number | null | undefined,
): number {
  const w = typeWeight(act);

  // Hike/Walk con dislivello significativo: modello specifico
  if ((act.type === 'Hike' || act.type === 'Walk') && (act.total_elevation_gain || 0) > 100) {
    return hikeSpecificLoad(act, hrMax, hrLthr);
  }

  const min = (act.moving_time || 0) / 60;
  const hours = min / 60;

  // 0) Streams-based (quando disponibili in cache)
  if (act._metrics) {
    if (ftp && act._metrics.TSS != null) return act._metrics.TSS * w;
    if (hrLthr && act._metrics.hrTSS != null) return act._metrics.hrTSS * w;
  }
  // 1) TSS approssimato con potenza summary
  if (ftp && act.weighted_average_watts) {
    const IF = act.weighted_average_watts / ftp;
    return IF * IF * hours * 100 * w;
  }
  // 2) hrTSS approssimato
  if (hrLthr && act.has_heartrate && act.average_heartrate) {
    const r = act.average_heartrate / hrLthr;
    return r * r * hours * 100 * w;
  }
  // 3) proxy hrMax
  if (act.has_heartrate && act.average_heartrate && hrMax) {
    const r = Math.min(act.average_heartrate / hrMax, 1.1);
    return min * r * r * 10 * w;
  }
  if (act.suffer_score) return act.suffer_score * w;
  return min * 0.5 * w;
}

// Classifica un'attività come "dura" (intensità sopra soglia).
// Cascata di segnali, dal più affidabile al più euristico:
//   1) potenza: IF ≥ 0.85 vs FTP → hard
//   2) FC: avg HR > 92% LTHR → hard
//   3) suffer_score Strava ≥ 60 → hard
//   4) titolo contiene keyword da workout strutturato → hard
//   5) altrimenti: NON hard (anche una lunga 2h Z2 senza HR non è "hard")
const HARD_TITLE_RX = /intervalli|interval|sst|sweet ?spot|soglia|threshold|vo2|over[- ]?under|tabata|hiit|seiler|r[øo]nnestad/i;
export function isHard(act: Activity, hrLthr: number | null | undefined, ftp: number | null | undefined): boolean {
  const wap = act.weighted_average_watts || act.average_watts;
  if (ftp && wap) return (wap / ftp) >= 0.85;
  if (hrLthr && act.has_heartrate && act.average_heartrate) {
    return act.average_heartrate > hrLthr * 0.92;
  }
  if ((act.suffer_score || 0) >= 60) return true;
  if (act.name && HARD_TITLE_RX.test(act.name)) return true;
  return false;
}

// Forza o corpo libero, dal tipo di Strava o dal titolo: il giorno dopo il piano propone
// recupero, e con la pioggia evita due giorni di forza di fila.
const STRENGTH_TYPES = new Set(['WeightTraining', 'Workout', 'Crossfit']);
const STRENGTH_TITLE_RX = /corpo\s*libero|corpolibero|bodyweight|body\s*weight|palestra|gym|forza|strength|calistenia|calisthenics|allenamento\s*generico|home\s*workout|circuit|functional|HIIT|tabata|kettlebell|TRX|resistance\s*band|pesi|sala\s*pesi|core\s*training|cross\s*training/i;
export function isStrengthActivity(act: Pick<Activity, 'type' | 'name'>): boolean {
  return STRENGTH_TYPES.has(act.type) || STRENGTH_TITLE_RX.test(act.name || '');
}
