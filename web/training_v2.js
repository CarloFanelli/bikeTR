// Training v2: il catalogo dei workout sta in src/core/training-v2.ts. Qui restano i nomi
// di prima; v2_workoutForCategory legge il mesociclo salvato nel browser.
import { v2_workoutForCategory as workoutFrom } from './src/core/training-v2.ts';
import { loadMesocycle } from './src/data/storage.ts';

export {
  v2_capacityTier, v2_aerobicCapacityWorkout, v2_strengthSprintsWorkout, v2_vo2Workout,
  v2_strengthCircuits, isReducedVolume as _isReducedVolume,
} from './src/core/training-v2.ts';

export function v2_workoutForCategory(cat, settings, profile, hardIndex = 0, formCtx = null, isRecoveryWeek = false, totalHardsInWeek = 2) {
  return workoutFrom(cat, settings, profile, hardIndex, formCtx, isRecoveryWeek, totalHardsInWeek, loadMesocycle());
}
