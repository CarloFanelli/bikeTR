// Testi del Coach AI: il profilo atleta inviato al servizio e le righe della card del
// workout. Ricevono i dati e restituiscono testi, senza leggere il browser.

import type { AthleteProfile, CoachWorkout, PaperRef } from './coach-types.ts';
import type { HrProfile } from './hr.ts';
import type { Settings } from './settings.ts';

// Le stesse FTP e soglie del resto dell'app; i valori mancanti viaggiano come null.
export function coachProfile(hr: HrProfile, settings: Settings): AthleteProfile {
  return {
    ftp: hr.ftp || null,
    lthr: hr.hrLthr || null,
    hrMax: hr.hrMax || null,
    weight: settings.weight || null,
    weeklyHours: settings.weeklyHours || null,
    weeklyDays: settings.weeklyDays || null,
  };
}

export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

export const paperCitation = (p: PaperRef) => `${p.authors} (${p.year}). ${p.title}`;

// Da dove vengono le corse, quando non è il solito download completo.
export function ridesNotes(rides: CoachWorkout['rides']): string[] {
  const notes: string[] = [];
  if (rides.fromSaved && rides.downloadedAt != null) {
    const when = new Date(rides.downloadedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    notes.push(`⚠️ Strava non raggiungibile: uso le corse salvate il ${when}.`);
  }
  if (rides.missingDetails > 0) {
    notes.push(`ℹ️ ${rides.missingDetails} uscite senza dettagli secondo per secondo: per loro uso le cifre di riepilogo.`);
  }
  return notes;
}

// Locale o cloud, modello, secondi, token letti e scritti e, per il cloud, il costo in dollari
// con 4 decimali ("—" per ciò che il provider non dice). Ollama non costa nulla: nessun costo.
const tokens = (n: number | null) => (n == null ? '—' : String(n));
const cost = (w: CoachWorkout) =>
  w.provider === 'cloud' ? ` · costo: ${w.cost == null ? '—' : `$${w.cost.toFixed(4)}`}` : '';
export const metaLine = (w: CoachWorkout) =>
  `⚡ ${w.provider === 'cloud' ? 'cloud' : 'locale'} · ${w.model} · ${w.seconds.toFixed(1)}s · ` +
  `token: ${tokens(w.inputTokens)} in, ${tokens(w.outputTokens)} out${cost(w)}`;

// Il titolo di un errore che non ha una spiegazione sua (FTP mancante, ricerca dei paper).
export const errorHeading = (code?: string) => (code === 'model' ? 'Errore chiamata modello' : 'Workout non generato');
