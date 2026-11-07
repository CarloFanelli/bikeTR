// Stato condiviso della nuova app: collegamento a Strava, atleta, statistiche e
// attività, caricati una volta all'apertura e letti da ogni sezione.

import { reactive } from 'vue';
import type { Activity, Athlete, AthleteStats } from '../core/strava-types.ts';
import { AuthError, getAuthStatus, logout } from '../data/auth.ts';
import { forgetCoachRides } from '../data/coach.ts';
import { applyCachedStreams, purgeLegacyStrava } from '../data/storage.ts';
import { fetchActivities, fetchAthlete, fetchAthleteStats } from '../data/strava.ts';

// Attività caricate all'apertura: abbastanza storico per il consiglio del giorno.
const ACTIVITY_COUNT = 60;

interface Session {
  // loading: in attesa di Strava · connect: solo "Collega Strava" · error: messaggio · ready: l'app.
  phase: 'loading' | 'connect' | 'error' | 'ready';
  // Impostazioni del .env che mancano per collegarsi.
  missing: string[];
  error: string | null;
  // Errore del ritorno da Strava, mostrato una volta sopra la schermata.
  notice: string | null;
  athlete: Athlete | null;
  stats: AthleteStats | null;
  activities: Activity[];
}

export const session = reactive<Session>({
  phase: 'loading', missing: [], error: null, notice: null, athlete: null, stats: null, activities: [],
});

export async function startSession(): Promise<void> {
  purgeLegacyStrava();
  Object.assign(session, { phase: 'loading', missing: [], error: null, athlete: null, stats: null, activities: [] });
  try {
    const status = await getAuthStatus();
    if (status.missing.length || !status.connected) {
      Object.assign(session, { phase: 'connect', missing: status.missing });
      return;
    }
    const athlete = await fetchAthlete();
    const stats = await fetchAthleteStats(athlete.id);
    const activities = await fetchActivities(ACTIVITY_COUNT);
    applyCachedStreams(activities);
    Object.assign(session, { phase: 'ready', athlete, stats, activities });
  } catch (e) {
    // Scollegati mentre carica (token cancellati, accesso revocato): "Collega Strava", non un errore.
    if (e instanceof AuthError && e.code === 'not_connected') Object.assign(session, { phase: 'connect' });
    else Object.assign(session, { phase: 'error', error: (e as Error).message });
  }
}

// "Disconnetti da Strava": il server di autenticazione cancella i token, il servizio
// Coach dimentica le corse, e resta solo "Collega Strava".
export async function disconnect(): Promise<void> {
  await logout();
  await forgetCoachRides();
  await startSession();
}
