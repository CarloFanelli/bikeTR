// Tutte le attività salvate dal servizio, per Attività e per l'ultima uscita di Home: lette una
// volta per sessione, la prima volta che una schermata le chiede, e rilette dopo ogni
// aggiornamento da Strava. Le altre sezioni usano le ultime 60 di session.

import { reactive } from 'vue';
import type { Activity } from '../core/strava-types.ts';
import { savedActivities } from '../data/coach.ts';

export const allActivities = reactive<{ list: Activity[] | null; error: string }>({ list: null, error: '' });

// Una schermata le ha chieste: dopo un aggiornamento si rileggono subito.
let wanted = false;
// Vale solo l'ultima lettura partita: una più vecchia che finisce dopo non la sovrascrive.
let reading = 0;

export async function loadAllActivities(): Promise<void> {
  wanted = true;
  const mine = ++reading;
  const answer = await savedActivities();
  if (mine !== reading) return;
  if (answer.ok) Object.assign(allActivities, { list: answer.value, error: '' });
  else allActivities.error = answer.msg;
}

// Una schermata che si apre: le legge se non sono ancora arrivate.
export function ensureAllActivities(): void {
  if (!allActivities.list) void loadAllActivities();
}

// Dopo un aggiornamento da Strava l'elenco letto prima è vecchio.
export function refreshAllActivities(): void {
  if (wanted) void loadAllActivities();
}

// Un'altra sessione (riapertura, Disconnetti): niente dell'atleta di prima.
export function forgetAllActivities(): void {
  wanted = false;
  reading++;
  Object.assign(allActivities, { list: null, error: '' });
}
