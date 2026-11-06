// Quello che il piano di allenamento riceve dalle pagine oltre ad attività e impostazioni.

import type { FtpPoint } from '../ftp.ts';
import { resolveHr } from '../hr.ts';
import type { HrProfile, HrSettings } from '../hr.ts';
import type { Mesocycle } from '../meso.ts';
import type { SegmentEstimates } from '../segments.ts';
import type { Activity } from '../strava-types.ts';

// Valori letti dal browser: l'istante di oggi, le stime dai segmenti salvati, lo storico
// FTP, il mesociclo e i giorni di pioggia salvati.
export interface PlanInputs {
  now: Date;
  segmentEstimates: SegmentEstimates | null;
  ftpHistory: FtpPoint[];
  meso: Mesocycle | null;
  rainyDays: string[];
}

// Del profilo atleta il piano legge il livello; i workout anche soglia e FTP, se ci sono.
export interface PlanProfile {
  level?: { key: string };
  hrLthr?: number | null;
  ftp?: number | null;
}

// Un consiglio o un workout del piano; per un giorno passato con un'attività, anche quale.
export interface Advice {
  title: string;
  detail: string;
  reason: string | null;
  source?: string | null;
  _isDone?: true;
  _activityId?: number;
}

// Un'attività simulata dal piano, per proiettare il carico dei giorni successivi.
export interface SyntheticActivity {
  type: string;
  start_date_local: string;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  has_heartrate: boolean;
  average_heartrate: number | undefined;
  _synthetic: true;
}

// Le attività simulate hanno solo i campi che leggono i calcoli del carico.
export const asActivity = (synthetic: SyntheticActivity): Activity => synthetic as unknown as Activity;

// FTP e soglia con le stime dai segmenti salvati; senza attività contano solo i valori
// dichiarati e i segmenti.
export function planHr(
  settings: HrSettings | null | undefined, activities: Activity[] | undefined, inputs: Pick<PlanInputs, 'segmentEstimates' | 'now'>,
): HrProfile {
  return resolveHr(settings, activities, inputs.segmentEstimates, inputs.now);
}
