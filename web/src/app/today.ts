// Gli ingressi del consiglio di oggi, comuni ad Allenamento e Home: corse, impostazioni,
// giorni saltati, soglie, profilo e fatica di adesso.

import { buildFormTrend, compositeFatigueScore } from '../core/form.ts';
import { planHr } from '../core/plan/inputs.ts';
import { buildProfile } from '../core/profile.ts';
import { dailyAdvice } from '../core/training-view.ts';
import { loadPlannedRests, loadSettings } from '../data/storage.ts';
import { planInputs, session } from './session.ts';

// Un calcolo che fallisce dà il suo errore al posto del valore: la schermata mostra il
// resto lo stesso.
export function attempt<T>(fn: () => T): { value: T; error: null } | { value: null; error: string } {
  try {
    return { value: fn(), error: null };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

export function trainingContext() {
  const inputs = planInputs();
  const { now } = inputs;
  const activities = session.activities;
  const settings = loadSettings();
  const rests = loadPlannedRests();
  const hr = planHr(settings, activities, inputs);
  const profile = buildProfile(session.stats, activities, settings, now);
  const fatigue = compositeFatigueScore(buildFormTrend(activities, hr, now), activities, now);
  return { inputs, now, activities, settings, rests, hr, profile, fatigue };
}

export const todayAdvice = (ctx: ReturnType<typeof trainingContext>) =>
  attempt(() => dailyAdvice(ctx.activities, ctx.settings, ctx.rests, ctx.profile, ctx.inputs));
