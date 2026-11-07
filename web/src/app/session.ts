// Stato condiviso della nuova app: collegamento a Strava, atleta, statistiche e
// attività, caricati una volta all'apertura e letti da ogni sezione.

import { reactive } from 'vue';
import { type HrProfile, resolveHr } from '../core/hr.ts';
import { nextMesocycle } from '../core/meso.ts';
import type { PlanInputs } from '../core/plan/inputs.ts';
import { estimatesFromSegments } from '../core/segments.ts';
import type { Activity, Athlete, AthleteStats } from '../core/strava-types.ts';
import { AuthError, getAuthStatus, logout } from '../data/auth.ts';
import { forgetCoachRides } from '../data/coach.ts';
import {
  applyCachedStreams, loadFtpHistory, loadMesocycle, loadRainyDays, loadSegmentCache, loadSettings, purgeLegacyStrava,
  recordFtpPoint, saveMesocycle,
} from '../data/storage.ts';
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
    updateMesocycle(activities);
    updateFtpHistory(activities);
    Object.assign(session, { phase: 'ready', athlete, stats, activities });
  } catch (e) {
    if (!connectIfDisconnected(e)) Object.assign(session, { phase: 'error', error: (e as Error).message });
  }
}

// Il mesociclo di oggi, aggiornato a ogni apertura come fa l'app di oggi, così ogni sezione
// legge lo stesso blocco: si salva solo alla prima apertura e quando un blocco finisce.
// Un mesociclo salvato rovinato non blocca l'app, come oggi.
function updateMesocycle(activities: Activity[]): void {
  try {
    const { meso, changed } = nextMesocycle(loadMesocycle(), activities, loadSettings(), new Date());
    if (changed) saveMesocycle(meso);
  } catch (e) {
    console.warn('[BikeTR] mesociclo non aggiornato:', e);
  }
}

// Il punto FTP di oggi, per il trend in Analisi e per il piano in Allenamento, come
// l'app di oggi a ogni apertura. Uno storico rovinato non blocca l'app.
function updateFtpHistory(activities: Activity[]): void {
  const now = new Date();
  try {
    recordFtpPoint(resolveHr(loadSettings(), activities, estimatesFromSegments(loadSegmentCache(), now), now), now);
  } catch (e) {
    console.warn('[BikeTR] punto FTP non registrato:', e);
  }
}

// Scollegati mentre l'app lavora (token cancellati, accesso revocato): "Collega Strava",
// non un errore. Restituisce true se era questo il caso.
export function connectIfDisconnected(e: unknown): boolean {
  if (!(e instanceof AuthError && e.code === 'not_connected')) return false;
  session.phase = 'connect';
  return true;
}

// FTP e LTHR di adesso, dichiarate o stimate da attività e segmenti salvati.
export function hrProfile(now = new Date()): HrProfile {
  return resolveHr(loadSettings(), session.activities, estimatesFromSegments(loadSegmentCache(), now), now);
}

// "Disconnetti da Strava": il server di autenticazione cancella i token, il servizio
// Coach dimentica le corse, e resta solo "Collega Strava".
export async function disconnect(): Promise<void> {
  await logout();
  await forgetCoachRides();
  await startSession();
}

// Quello che il piano di allenamento legge dal browser oltre ad attività e impostazioni.
export function planInputs(now = new Date()): PlanInputs {
  return {
    now, segmentEstimates: estimatesFromSegments(loadSegmentCache(), now), ftpHistory: loadFtpHistory(),
    meso: loadMesocycle(), rainyDays: loadRainyDays(),
  };
}
