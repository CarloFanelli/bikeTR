// Il piano delle 4 settimane in Allenamento: ogni settimana parte dalla forma che
// avresti seguendo i workout proposti nelle settimane prima.

import { dayOffsetIso } from '../dates.ts';
import { buildFormTrend } from '../form.ts';
import { activityLoad } from '../load.ts';
import { getTaperPhase, getWeekRoleInBlock } from '../meso.ts';
import type { Settings } from '../settings.ts';
import type { Activity } from '../strava-types.ts';
import { currentMondayOffset } from './dates.ts';
import { asActivity, planHr } from './inputs.ts';
import type { Advice, PlanInputs, PlanProfile, SyntheticActivity } from './inputs.ts';
import { buildWeekPlan } from './week.ts';
import type { FormCtx } from './week.ts';

export type WeekPlan = ReturnType<typeof buildWeekPlan>;

// Genera sinteticamente un'attività corrispondente a un workout pianificato.
// Le FC usate sono MEDIE realistiche dell'intera sessione (comprende warmup+rec+defat),
// NON la FC durante gli intervalli (sarebbe più alta). Così load/polarizzazione
// nelle settimane future simulate restano realistici.
export function synthFromWorkout(
  rec: Pick<Advice, 'title'> | null | undefined, iso: string, settings: Settings | null | undefined,
  inputs: Pick<PlanInputs, 'now' | 'segmentEstimates'>,
): SyntheticActivity | null {
  const { hrLthr } = planHr(settings, undefined, inputs);
  const t = rec?.title || '';
  const d = new Date(iso); d.setHours(9,0,0,0);
  const make = (min: number, hrFrac: number): SyntheticActivity => ({
    type: 'Ride',
    start_date_local: d.toISOString(),
    moving_time: min * 60,
    distance: min * 500,
    total_elevation_gain: 0,
    has_heartrate: !!hrLthr,
    average_heartrate: hrLthr ? hrLthr * hrFrac : undefined,
    _synthetic: true,
  });
  if (t.includes('pianificato') || t.includes('😴 Riposo')) return null;
  if (t.includes('Recupero')) return make(50, 0.68);
  if (t.includes('Sweet Spot')) return make(75, 0.83);
  if (t.includes('Over-Unders')) return make(70, 0.85);
  if (t.includes('Soglia')) return make(75, 0.86);
  if (t.includes('VO2 30/30') || t.includes('Intermittenti')) return make(65, 0.85);
  if (t.includes('VO2')) return make(70, 0.87);
  if (t.includes('Capacità Aerobica')) return make(80, 0.82);
  if (t.includes('Forza')) return make(60, 0.75); // sprint brevi: HR media moderata
  if (t.includes('soglia')) return make(75, 0.86);
  if (t.includes('lunga')) return make(135, 0.78);
  if (t.includes('Fondo')) return make(90, 0.77);
  if (t.includes('Riattivazione')) return make(60, 0.73);
  if (t.includes('Corpo libero')) {
    // Circuito a corpo libero: trattato come WeightTraining (peso 0.5)
    const d2 = new Date(iso); d2.setHours(9,0,0,0);
    return {
      type: 'WeightTraining',
      start_date_local: d2.toISOString(),
      moving_time: 45 * 60,
      distance: 0,
      total_elevation_gain: 0,
      has_heartrate: !!hrLthr,
      average_heartrate: hrLthr ? hrLthr * 0.75 : undefined,
      _synthetic: true,
    };
  }
  return null;
}

// Piano 4 settimane: evolve TSB/CTL/ATL giorno per giorno usando i workout simulati,
// così le settimane future riflettono lo stato di forma che AVRESTI seguendo il piano.
export function buildMonthPlan(
  activities: Activity[], settings: Settings | null | undefined, plannedRests: string[] | null | undefined,
  profile: PlanProfile | null | undefined, inputs: PlanInputs,
) {
  const { now } = inputs;
  let acts = activities.slice();
  const weeks: WeekPlan[] = [];
  const hr = planHr(settings, activities, inputs);
  const { hrMax, hrLthr, ftp } = hr;
  const kCTL = 1 - Math.exp(-1/42);
  const kATL = 1 - Math.exp(-1/7);

  // Stato forma iniziale dalla storia reale
  const form0 = buildFormTrend(activities, hr, now);
  let simCtx: FormCtx | null = form0 ? {
    ctl: form0.ctl[form0.DAYS-1],
    atl: form0.atl[form0.DAYS-1],
    tsb: form0.tsb[form0.DAYS-1],
  } : null;

  // La settimana 0 inizia dal LUNEDÌ della settimana corrente (può essere offset negativo).
  // Esempio: oggi mercoledì → mondayOffset = -2; settimana 1 inizia a -2+7 = 5 (lunedì prossimo).
  const baseMonday = currentMondayOffset(now);
  // Mesociclo corrente: ogni settimana w (0..3) eredita un ruolo nell'onda 3:1
  // (build1 / build2 / peak / deload). Se il mesociclo non è inizializzato, weekRole = null
  // e si applica la logica reattiva precedente (model.needsRecoveryWeek).
  // Race date: se nelle ultime 3 settimane prima della gara, override del weekRole
  // con il taper Mujika (prevale sul mesociclo perché finalizzato all'evento).
  const meso = inputs.meso;
  for (let w = 0; w < 4; w++) {
    const weekStartIso = dayOffsetIso(baseMonday + w * 7, now);
    const taper = getTaperPhase(settings?.raceDate, weekStartIso);
    const weekRole = taper || getWeekRoleInBlock(meso, w);
    const plan = buildWeekPlan(acts, settings, plannedRests, profile, baseMonday + w * 7, simCtx ? {...simCtx} : null, null, weekRole, inputs);
    weeks.push(plan);
    // Avanza simCtx giorno per giorno in base al workout proposto
    plan.days.forEach(d => {
      const synth = synthFromWorkout(d.rec, d.iso, settings, inputs);
      const load = synth ? activityLoad(asActivity(synth), hrMax, hrLthr, ftp) : 0;
      if (simCtx) {
        simCtx.ctl += (load - simCtx.ctl) * kCTL;
        simCtx.atl += (load - simCtx.atl) * kATL;
        simCtx.tsb = simCtx.ctl - simCtx.atl;
      }
      if (synth) acts = [asActivity(synth), ...acts];
    });
  }
  return weeks;
}
