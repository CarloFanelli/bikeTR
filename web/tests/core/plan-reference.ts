// I casi del piano di allenamento (tests/fixtures/plan-cases.json) e i risultati registrati
// dal JavaScript di prima della conversione (tests/fixtures/plan-expected.json, vedi
// tests/reference/record.ts).

import type { FtpPoint } from '../../src/core/ftp.ts';
import type { Mesocycle } from '../../src/core/meso.ts';
import type { PlanInputs } from '../../src/core/plan/inputs.ts';
import { estimatesFromSegments } from '../../src/core/segments.ts';
import type { Settings } from '../../src/core/settings.ts';
import { caseActivities, profileOf } from '../reference/plan-inputs.ts';
import { activities, fixture, rides } from './reference.ts';

export const plan = fixture('plan-cases.json');
export const planExpected = fixture('plan-expected.json');

export interface PlanCase {
  name: string;
  now: string;
  activities: string;
  settings: string;
  level: string | null;
  plannedRests: string[];
  rainyDays: string[];
  mesocycle: string | null;
  ftpHistory: string | null;
  segments: boolean;
}
export const planCases: PlanCase[] = plan.cases;

export const settingsOf = (name: string): Settings => plan.settings[name];
export const mesocycleOf = (name: string | null): Mesocycle | null =>
  (name ? structuredClone(plan.mesocycles[name]) : null);

// Valori che le pagine leggono dal browser, come li salva record-plan.ts per ogni caso.
export function planInputs(
  now: string, saved: { segments?: boolean; ftpHistory?: string | null; mesocycle?: string | null; rainyDays?: string[] } = {},
): PlanInputs {
  const at = new Date(now);
  return {
    now: at,
    segmentEstimates: estimatesFromSegments(saved.segments ? rides.segmentCache : {}, at),
    ftpHistory: (saved.ftpHistory ? rides.ftpHistories[saved.ftpHistory] : []) as FtpPoint[],
    meso: mesocycleOf(saved.mesocycle ?? null),
    rainyDays: saved.rainyDays ?? [],
  };
}

// Ingressi di un caso come li preparano le pagine.
export function planCase(c: PlanCase) {
  return {
    inputs: planInputs(c.now, c),
    settings: settingsOf(c.settings),
    acts: caseActivities(c.activities, activities(), c.now, plan.activitySets),
    profile: profileOf(c.level),
    expected: planExpected.cases[c.name],
  };
}

// Per un calcolo che nel codice di prima lanciava un errore la registrazione ha { throws: true }.
export const throws = (value: unknown): boolean =>
  !!value && typeof value === 'object' && 'throws' in value;
