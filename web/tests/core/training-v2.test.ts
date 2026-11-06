import { describe, expect, it } from 'vitest';
import { workoutForCategory } from '../../src/core/plan/week.ts';
import {
  isReducedVolume, v2_aerobicCapacityWorkout, v2_capacityTier, v2_strengthCircuits, v2_strengthSprintsWorkout,
  v2_vo2Workout,
} from '../../src/core/training-v2.ts';
import { plan, planExpected, planInputs, settingsOf } from './plan-reference.ts';
import { displayed, rides } from './reference.ts';

const recorded = planExpected.workouts;
const w = plan.workout;
const tierOf = (t: [number, number] | null) => t && v2_capacityTier({ weeklyHours: t[0] }, { ctl: t[1] });
const athlete = { hrLthr: 166, ftp: 255 };

interface WorkoutCase {
  cat: string;
  settings: string;
  profile: { level?: { key: string }; hrLthr?: number; ftp?: number } | null;
  hardIndex: number;
  formCtx: { ctl: number; atl: number; tsb: number } | null;
  isRecoveryWeek: boolean;
  totalHardsInWeek: number;
  workout: unknown;
}

describe('Training v2: workout del piano', () => {
  const inputs = planInputs(rides.now, { segments: true });
  const categories: WorkoutCase[] = recorded.categories;
  it.each(categories)('categoria $cat, impostazioni $settings, sessione $hardIndex', c => {
    expect(displayed(workoutForCategory(c.cat, settingsOf(c.settings), c.profile, c.hardIndex, c.formCtx,
      c.isRecoveryWeek, c.totalHardsInWeek, inputs))).toEqual(displayed(c.workout));
  });

  // Le sessioni dure cambiano con il blocco del mesociclo in corso.
  const hard: (Omit<WorkoutCase, 'cat' | 'settings' | 'profile' | 'isRecoveryWeek'> & { meso: string | null })[] = recorded.hard;
  it.each(hard)('sessione dura $hardIndex di $totalHardsInWeek, mesociclo $meso', c => {
    const withMeso = planInputs(rides.now, { segments: true, mesocycle: c.meso });
    expect(displayed(workoutForCategory('HARD', settingsOf('declared'), null, c.hardIndex, c.formCtx, false,
      c.totalHardsInWeek, withMeso))).toEqual(displayed(c.workout));
  });

  it('protocolli VO2, capacità aerobica e forza', () => {
    const vo2: { variant: string; volMul: number; tier: [number, number] | null }[] = recorded.vo2;
    expect(displayed(vo2.map(v => ({
      ...v, workout: v2_vo2Workout(v.variant, athlete, v.volMul, ' · scarico', ' · nota', tierOf(v.tier), '\nstrumenti'),
    })))).toEqual(displayed(recorded.vo2));
    const others: { volMul: number; tier: [number, number] | null }[] = recorded.others;
    expect(displayed(others.map(o => ({
      ...o,
      aerobic: v2_aerobicCapacityWorkout(athlete, o.volMul, '', '', tierOf(o.tier)),
      sprints: v2_strengthSprintsWorkout({}, o.volMul, ' · scarico', ' · nota', tierOf(o.tier), '\nstrumenti'),
    })))).toEqual(displayed(recorded.others));
  });

  it('livello di volume, circuiti a corpo libero, volume ridotto', () => {
    expect(w.tiers.map(([weeklyHours, ctl]: [number | null, number]) =>
      v2_capacityTier(weeklyHours == null ? {} : { weeklyHours }, { ctl }))).toEqual(recorded.tiers);
    expect(w.strengthLevels.map(v2_strengthCircuits)).toEqual(recorded.circuits);
    expect(w.reducedVolume.map(isReducedVolume)).toEqual(recorded.reducedVolume);
  });
});
