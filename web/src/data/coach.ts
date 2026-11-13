// Servizio Coach (/coach/, dietro nginx): parla con il modello chat scelto nel suo .env
// (Ollama o un provider cloud) e tiene, nel suo database, i dati scaricati da Strava.

import type {
  CoachEvent, CoachRefusal, CoachStatus, ConnectionCheck, DetailsProgress, LoadProfile, SavedAthlete, SyncStatus,
  WorkoutRequest,
} from '../core/coach-types.ts';
import type { AthleteKey } from '../core/athlete-data.ts';
import type { Activity } from '../core/strava-types.ts';
import type { AddedPaper, Library, LibraryPassages, PaperMatch, PaperPreview } from '../core/library-types.ts';

export const COACH_UNREACHABLE = 'Coach non raggiungibile: avvia BikeTR con docker compose up -d';

// code: il codice d'errore del servizio (per esempio not_connected), se ha risposto.
export type CoachAnswer<T> = { ok: true; value: T } | { ok: false; msg: string; code?: string };

// Il servizio risponde con i dati oppure con {error, message}; 204, a un salvataggio riuscito,
// senza corpo. Senza una risposta del servizio, il Coach non è avviato. Un corpo viaggia in JSON.
async function askCoach<T>(path: string, method = 'GET', payload?: unknown): Promise<CoachAnswer<T>> {
  let res: Response;
  try {
    res = await fetch(path, payload === undefined ? { method } : {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, msg: COACH_UNREACHABLE };
  }
  if (res.status === 204) return { ok: true, value: null as T };
  const body: (T & { message?: string; error?: string }) | null = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, msg: body?.message || COACH_UNREACHABLE, code: body?.error };
  return { ok: true, value: body };
}

// Il modello chat di .env, e per il cloud spesa e tetto: il servizio non chiama nessuno.
export const coachStatus = () => askCoach<CoachStatus>('/coach/status');

// Il provider risponde, accetta la chiave e ha il modello? Nessun token speso.
export const checkConnection = () => askCoach<ConnectionCheck>('/coach/ping');

// Il servizio aggiorna da Strava le attività che ha salvato: al massimo ogni 5 minuti, o
// subito con force ("Aggiorna da Strava"). Il browser non chiama Strava per atleta e attività.
export const syncStrava = (force = false) =>
  askCoach<SyncStatus>(`/coach/sync${force ? '?force=true' : ''}`, 'POST');

// Atleta, statistiche e le ultime `limit` attività salvati dal servizio; senza limit tutte,
// con i soli campi delle card di Attività.
export const savedAthlete = () => askCoach<SavedAthlete>('/coach/athlete');
export const savedActivities = (limit?: number) =>
  askCoach<Activity[]>(`/coach/activities${limit ? `?limit=${limit}` : ''}`);

// Il carico di ogni attività salvata fra `ids`, calcolato dal servizio con i dettagli corsa che ha
// scaricato e il profilo dato (FTP, soglia, FC massima): {loads: {id: carico}}.
export const activityLoads = (profile: LoadProfile, ids: number[]) =>
  askCoach<{ loads: Record<string, number> }>('/coach/metrics', 'POST', { profile, ids });

// I dati dell'atleta salvati sul server (impostazioni, calendario, FTP, mesociclo, segmenti,
// durata del Coach), {chiave: valore}; un salvataggio controllato campo per campo; e i dati di
// un browser, mandati solo se il server non ne ha (altrimenti code not_empty).
export const athleteData = () => askCoach<Partial<Record<AthleteKey, unknown>>>('/coach/athlete-data');
export const saveAthleteData = (key: AthleteKey, value: unknown) =>
  askCoach<null>(`/coach/athlete-data/${key}`, 'PUT', value);
export const importAthleteData = (data: Partial<Record<AthleteKey, unknown>>) =>
  askCoach<null>('/coach/athlete-data/import', 'POST', data);

// Quanti dettagli corsa ha già scaricato il servizio, in sottofondo, su quanti.
export const detailsProgress = () => askCoach<DetailsProgress>('/coach/details/progress');

// I paper che il Coach cerca, senza passaggi; i passaggi di un paper si chiedono aprendolo.
export const libraryPapers = () => askCoach<Library>('/coach/library');
export const libraryPassages = (pmid: string) =>
  askCoach<LibraryPassages>(`/coach/library/${encodeURIComponent(pmid)}`);

// Fino a 10 paper di PubMed per parole del titolo o degli autori, nell'ordine di pertinenza.
export const searchPapers = (query: string) => askCoach<PaperMatch[]>('/coach/library/search', 'POST', { query });

// Il paper da PubMed come entrerebbe in libreria: il servizio non salva nulla.
export const previewPaper = (pmid: string) => askCoach<PaperPreview>('/coach/library/preview', 'POST', { pmid });

// Scarica, taglia e codifica il paper e lo salva nella libreria: qualche secondo.
export const addPaper = (pmid: string) => askCoach<AddedPaper>('/coach/library', 'POST', { pmid });

// Un paper aggiunto si cancella; uno di base si toglie e resta nell'elenco dei tolti, da cui si ripristina.
export const removePaper = (pmid: string) =>
  askCoach<{ pmid: string }>(`/coach/library/${encodeURIComponent(pmid)}`, 'DELETE');
export const restorePaper = (pmid: string) =>
  askCoach<{ pmid: string }>(`/coach/library/${encodeURIComponent(pmid)}/restore`, 'POST');

// Le corse salvate dal servizio appartengono al collegamento con Strava: dopo lo
// scollegamento nessuna richiesta del Coach può ottenere un nuovo token.
export async function forgetCoachRides(): Promise<void> {
  await fetch('/coach/forget', { method: 'POST' }).catch(() => {});
}

// ----------------------------------------------------------------------------
// Workout di oggi: il browser invia durata, fuso orario e profilo atleta (il modello lo
// sceglie .env del servizio); il servizio risponde con un flusso di eventi, una riga JSON
// l'uno: step, context, token (il testo del modello mentre lo scrive), poi result oppure error.
// ----------------------------------------------------------------------------

export const COACH_INTERRUPTED = 'Connessione col Coach interrotta';

// Gli eventi del flusso, uno per riga. Un pezzo di rete può tagliare una riga o un
// carattere a metà: TextDecoder in modalità stream tiene i byte incompleti, il buffer
// tiene la riga incompleta fino al prossimo pezzo.
export async function* readCoachEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CoachEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as CoachEvent;
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as CoachEvent;
}

// Nessun limite di tempo qui: il servizio smette se il modello tace per 3 minuti.
// Interrompere signal chiude la connessione, e il servizio ferma Ollama. Gli errori di
// rete e l'interruzione arrivano come eccezioni.
export async function requestWorkout(
  request: WorkoutRequest, signal: AbortSignal,
): Promise<{ events: AsyncGenerator<CoachEvent> } | { refusal: CoachRefusal }> {
  const res = await fetch('/coach/workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    // Rifiutata dal servizio ({error, message}); senza un corpo JSON risponde nginx:
    // il servizio non è avviato.
    const body: CoachRefusal | null = await res.json().catch(() => null);
    return { refusal: body?.message ? body : { message: COACH_UNREACHABLE } };
  }
  return { events: readCoachEvents(res.body) };
}
