// Stato condiviso dell'app: collegamento a Strava, atleta, statistiche e
// attività, caricati una volta all'apertura e letti da ogni sezione.

import { reactive } from 'vue';
import type { SyncStatus } from '../core/coach-types.ts';
import { type HrProfile, resolveHr } from '../core/hr.ts';
import { nextMesocycle } from '../core/meso.ts';
import type { PlanInputs } from '../core/plan/inputs.ts';
import { estimatesFromSegments } from '../core/segments.ts';
import type { Activity, Athlete, AthleteStats } from '../core/strava-types.ts';
import { syncNotice } from '../core/sync-view.ts';
import { loadAthleteData } from '../data/athlete-data.ts';
import { AuthError, getAuthStatus, logout } from '../data/auth.ts';
import {
  activityLoads, type CoachAnswer, forgetCoachRides, savedActivities, savedAthlete, syncStrava,
} from '../data/coach.ts';
import {
  applyCachedStreams, loadFtpHistory, loadMesocycle, loadRainyDays, loadSegmentCache, loadSettings, purgeLegacyStrava,
  recordFtpPoint, saveMesocycle,
} from '../data/storage.ts';
import { forgetAllActivities, refreshAllActivities } from './all-activities.ts';

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
  // Strava non ha risposto all'ultimo aggiornamento: i dati mostrati sono quelli salvati.
  syncNotice: string | null;
  athlete: Athlete | null;
  stats: AthleteStats | null;
  activities: Activity[];
}

export const session = reactive<Session>({
  phase: 'loading', missing: [], error: null, notice: null, syncNotice: null, athlete: null, stats: null, activities: [],
});

export async function startSession(): Promise<void> {
  purgeLegacyStrava();
  forgetAllActivities();
  Object.assign(session, {
    phase: 'loading', missing: [], error: null, syncNotice: null, athlete: null, stats: null, activities: [],
  });
  try {
    const status = await getAuthStatus();
    if (status.missing.length || !status.connected) {
      Object.assign(session, { phase: 'connect', missing: status.missing });
      return;
    }
  } catch (e) {
    if (!connectIfDisconnected(e)) Object.assign(session, { phase: 'error', error: (e as Error).message });
    return;
  }
  // I dati dell'atleta prima di calcolare qualunque cosa: alla prima apertura dopo
  // l'aggiornamento il browser manda al server quelli che aveva.
  const data = await loadAthleteData();
  if (!data.ok) {
    Object.assign(session, { phase: 'error', error: data.msg });
    return;
  }
  // Il servizio controlla Strava al massimo ogni 5 minuti: riaprire l'app spesso non lo chiama.
  const synced = await syncStrava();
  const loaded = synced.ok ? await loadSaved(synced.value) : synced;
  if (!loaded.ok && !connectIfUnlinked(loaded)) Object.assign(session, { phase: 'error', error: loaded.msg });
}

// Atleta, statistiche e ultime attività salvati dal servizio, dopo una sincronizzazione, in
// session; senza nulla salvato (la prima sincronizzazione non è riuscita) è un errore.
export async function loadSaved(sync: SyncStatus): Promise<CoachAnswer<null>> {
  const [saved, activities] = await Promise.all([savedAthlete(), savedActivities(ACTIVITY_COUNT)]);
  if (!saved.ok) return saved;
  if (!activities.ok) return activities;
  const { athlete, stats } = saved.value;
  if (!athlete) return { ok: false, msg: syncNotice(sync) ?? 'Nessun dato salvato da Strava' };
  applyCachedStreams(activities.value);
  const hr = profileFor(activities.value);
  const loaded = await withLoads(activities.value, hr);
  if (!loaded.ok) return loaded;
  loadsFor = profileKey(hr);
  updateMesocycle(loaded.value);
  updateFtpHistory(loaded.value);
  Object.assign(session, { phase: 'ready', athlete, stats, activities: loaded.value, syncNotice: syncNotice(sync) });
  refreshAllActivities();
  return { ok: true, value: null };
}

// Il carico di ogni attività lo calcola il servizio Coach, con i dettagli corsa che ha salvato e
// le soglie di adesso: cambia quando le impostazioni o le stime dai segmenti cambiano FTP, soglia
// o FC massima. Il browser calcola il carico solo per gli allenamenti simulati del piano.
let loadsFor = '';
const profileKey = (hr: HrProfile) => `${hr.ftp}|${hr.hrLthr}|${hr.hrMax}`;

async function withLoads(activities: Activity[], hr: HrProfile): Promise<CoachAnswer<Activity[]>> {
  const profile = { ftp: hr.ftp || null, lthr: hr.hrLthr || null, hrMax: hr.hrMax || null };
  const answer = await activityLoads(profile, activities.map(a => a.id));
  if (!answer.ok) return answer;
  return { ok: true, value: activities.map(a => ({ ...a, _load: answer.value.loads[a.id] })) };
}

// Dopo un salvataggio delle impostazioni o un aggiornamento dei segmenti: se le soglie sono
// cambiate, il servizio ricalcola il carico. Se non risponde, i carichi restano quelli di prima e
// la schermata lo dice.
export async function refreshLoads(): Promise<void> {
  if (session.phase !== 'ready') return;
  const hr = hrProfile();
  const key = profileKey(hr);
  if (key === loadsFor) return;
  loadsFor = key;
  const activities = session.activities;
  const answer = await withLoads(activities, hr);
  // Nel frattempo sono arrivate altre attività, o soglie più nuove: vale la loro richiesta.
  if (session.activities !== activities || loadsFor !== key) return;
  if (answer.ok) {
    session.activities = answer.value;
  } else {
    loadsFor = '';
    session.syncNotice = `Carico delle attività non ricalcolato con le nuove soglie: ${answer.msg}`;
  }
}

// Il servizio dice che Strava non è collegato, o è stato scollegato durante la
// sincronizzazione: "Collega Strava". Restituisce true se era questo il caso.
export function connectIfUnlinked(answer: { code?: string }): boolean {
  if (answer.code !== 'not_connected' && answer.code !== 'disconnected') return false;
  session.phase = 'connect';
  return true;
}

// Un salvataggio fatto all'apertura che il server non prende: si rifà alla prossima apertura.
const warnIfNotSaved = (what: string) => (answer: CoachAnswer<null>) => {
  if (!answer.ok) console.warn(`[BikeTR] ${what} non salvato:`, answer.msg);
};

// Il mesociclo di oggi, aggiornato all'apertura dell'app e di Allenamento, così ogni sezione
// legge lo stesso blocco e la stessa settimana: si salva solo quando cambia (prima apertura,
// nuova settimana, blocco finito). Un mesociclo salvato rovinato non blocca l'app.
export function updateMesocycle(activities: Activity[]): void {
  try {
    const { meso, changed } = nextMesocycle(loadMesocycle(), activities, loadSettings(), new Date());
    if (changed) void saveMesocycle(meso).then(warnIfNotSaved('mesociclo'));
  } catch (e) {
    console.warn('[BikeTR] mesociclo non aggiornato:', e);
  }
}

// Il punto FTP di oggi, per il trend in Analisi e per il piano in Allenamento, a ogni
// apertura. Uno storico rovinato non blocca l'app.
function updateFtpHistory(activities: Activity[]): void {
  const now = new Date();
  try {
    void recordFtpPoint(profileFor(activities, now), now)
      .then(warnIfNotSaved('punto FTP'));
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
export const hrProfile = (now = new Date()): HrProfile => profileFor(session.activities, now);

function profileFor(activities: Activity[], now = new Date()): HrProfile {
  return resolveHr(loadSettings(), activities, estimatesFromSegments(loadSegmentCache(), now), now);
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
