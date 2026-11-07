// Servizio Coach (/coach/, dietro nginx): parla con il modello chat scelto nel suo .env
// (Ollama o un provider cloud) e tiene le corse scaricate da Strava.

import type {
  CoachEvent, CoachRefusal, CoachStatus, ConnectionCheck, WorkoutRequest,
} from '../core/coach-types.ts';

export const COACH_UNREACHABLE = 'Coach non raggiungibile: avvia BikeTR con docker compose up -d';

export type CoachAnswer<T> = { ok: true; value: T } | { ok: false; msg: string };

// Il servizio risponde con i dati oppure con {error, message}. Senza una risposta del
// servizio, il Coach non è avviato.
async function askCoach<T>(path: string): Promise<CoachAnswer<T>> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    return { ok: false, msg: COACH_UNREACHABLE };
  }
  const body: (T & { message?: string }) | null = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, msg: body?.message || COACH_UNREACHABLE };
  return { ok: true, value: body };
}

// Il modello chat di .env, e per il cloud spesa e tetto: il servizio non chiama nessuno.
export const coachStatus = () => askCoach<CoachStatus>('/coach/status');

// Il provider risponde, accetta la chiave e ha il modello? Nessun token speso.
export const checkConnection = () => askCoach<ConnectionCheck>('/coach/ping');

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
