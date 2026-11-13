// Le frasi sull'aggiornamento da Strava fatto dal servizio: l'avviso sopra le schermate quando
// Strava non ha risposto, e il risultato di "Aggiorna da Strava" nel menu dell'atleta.

import type { SyncStatus } from './coach-types.ts';

// "alle 14:32" oggi, "il 12/11 alle 14:32" un altro giorno.
export function at(ms: number, now: Date): string {
  const when = new Date(ms);
  const time = when.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (when.toDateString() === now.toDateString()) return `alle ${time}`;
  return `il ${when.toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' })} alle ${time}`;
}

// L'avviso quando i dati mostrati non sono freschi: null se la sincronizzazione è andata bene.
export function syncNotice(s: SyncStatus, now = new Date()): string | null {
  if (s.status === 'paused' && s.retryAt) return `Strava ha chiesto una pausa: riprovo ${at(s.retryAt, now)}`;
  if (s.status === 'unreachable' || s.status === 'paused') {
    return s.syncedAt ? `Dati aggiornati ${at(s.syncedAt, now)}: Strava non raggiungibile` : 'Strava non raggiungibile';
  }
  return null;
}

// Il risultato di "Aggiorna da Strava".
export function syncResult(s: SyncStatus, now = new Date()): string {
  return syncNotice(s, now) ?? (s.syncedAt ? `Aggiornato ${at(s.syncedAt, now)}` : 'Aggiornato');
}
