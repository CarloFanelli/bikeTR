// La richiesta al Coach in corso in questa scheda: passo, testo del modello mentre lo
// scrive, risultato o errore. Sta qui e non nella schermata, così continua anche
// cambiando sezione. Una sola richiesta alla volta: una nuova, o Stop, interrompe la
// precedente; la connessione si chiude e il servizio ferma Ollama. Le altre schede
// hanno la loro richiesta e non ne risentono.

import { reactive } from 'vue';
import type { CoachRefusal, CoachWorkout, WorkoutRequest } from '../core/coach-types.ts';
import { COACH_INTERRUPTED, COACH_UNREACHABLE, requestWorkout } from '../data/coach.ts';

export const coachRun = reactive({
  running: false,
  step: '',
  live: '',
  context: null as unknown,
  result: null as CoachWorkout | null,
  error: null as CoachRefusal | null,
  // Interrotta con Stop: il testo scritto finora resta.
  stopped: false,
});

let current: AbortController | null = null;

// Fine della richiesta ctrl, se è ancora quella in corso.
function finish(ctrl: AbortController, outcome: { result: CoachWorkout } | { error: CoachRefusal }): void {
  if (ctrl !== current) return;
  current = null;
  Object.assign(coachRun, { running: false }, outcome);
}

export async function generateWorkout(request: WorkoutRequest): Promise<void> {
  current?.abort();
  const ctrl = (current = new AbortController());
  Object.assign(coachRun, {
    running: true, step: '⏳ Richiesta al Coach…', live: '', context: null, result: null, error: null, stopped: false,
  });

  // Dopo ogni attesa: se la richiesta è stata interrotta, quello che arriva non si disegna.
  let started = false;
  try {
    const answer = await requestWorkout(request, ctrl.signal);
    if (ctrl.signal.aborted) return;
    if ('refusal' in answer) return finish(ctrl, { error: answer.refusal });
    started = true;
    for await (const ev of answer.events) {
      if (ctrl.signal.aborted) return;
      if (ev.type === 'step') {
        coachRun.step = `⏳ ${ev.message}`;
        // Una bozza rimandata: il testo della nuova prende il posto di quello della precedente.
        if (ev.step === 'draft' && (ev.attempt ?? 0) > 1) coachRun.live = '';
      }
      else if (ev.type === 'context') coachRun.context = ev.context;
      else if (ev.type === 'token') coachRun.live += ev.text;
      else if (ev.type === 'result') return finish(ctrl, { result: ev });
      else if (ev.type === 'error') return finish(ctrl, { error: ev });
    }
  } catch {
    if (ctrl.signal.aborted) return;
    return finish(ctrl, { error: { message: started ? COACH_INTERRUPTED : COACH_UNREACHABLE } });
  }
  // Flusso finito senza risultato né errore: la connessione si è chiusa a metà.
  if (!ctrl.signal.aborted) finish(ctrl, { error: { message: COACH_INTERRUPTED } });
}

export function stopWorkout(): void {
  if (!current) return;
  current.abort();
  current = null;
  Object.assign(coachRun, { running: false, stopped: true });
}
