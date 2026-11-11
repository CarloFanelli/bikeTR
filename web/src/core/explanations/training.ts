// Spiegazioni di Allenamento: prontezza, calendario, modello di allenamento, da dove viene
// il carico e settimana di scarico. Le ultime due dipendono dai dati dell'atleta.

import type { HrProfile } from '../hr.ts';
import type { Explanation } from './types.ts';

export const TRAINING_EXPLANATIONS = {
  readiness: {
    title: 'Prontezza',
    short: 'Un punteggio di fatica da 0 a 100: più è basso, più sei pronto. Sotto 35 sei pronto, da 75 in su sovraccarico.',
    lead: [
      'Il punteggio unisce la fatica del cuore e dei polmoni degli ultimi giorni con quella dei muscoli.',
      'La prima pesa per il 60% e viene dalla tua forma; la seconda pesa per il 40% e viene dalle uscite recenti, dislivello compreso.',
      'Fra 35 e 55 sei moderatamente stanco, fra 55 e 75 affaticato.',
    ],
  },
  calendar: {
    title: 'Prossimi 28 giorni',
    short: 'Tocca un giorno per cambiarlo: allenamento, salto (non ti alleni) o pioggia (allenamento a corpo libero). Il piano si ricalcola subito.',
  },
  trainingModel: {
    title: 'Modello di allenamento',
    short: 'Come ti alleni davvero nelle ultime 6 settimane: giorni abituali, carico medio, crescita e divisione facile/duro.',
    lead: [
      'Il piano mette le sedute di qualità nei giorni in cui di solito le fai, e riempie con uscite facili gli altri giorni abituali.',
      'Se gli allenamenti duri sono troppi rispetto a quelli facili, il piano corregge la divisione.',
    ],
  },
} satisfies Record<string, Explanation>;

// Da dove viene il carico di ogni uscita, che il piano usa per tutte le sue scelte.
export function loadSourceTopic(hr: Pick<HrProfile, 'ftp' | 'hrLthr'>): Explanation {
  const title = 'Da dove viene il carico';
  if (hr.ftp) {
    return { title, short: 'Il carico di ogni uscita si calcola dalla potenza rispetto alla tua FTP: è il dato più preciso.' };
  }
  if (hr.hrLthr) {
    return { title, short: 'Il carico si calcola dalla frequenza cardiaca rispetto alla tua soglia (LTHR). Con un misuratore di potenza e la FTP sarebbe più preciso.' };
  }
  return {
    title,
    short: 'Il carico si stima dalla frequenza cardiaca massima, il modo meno preciso. Imposta la LTHR in Impostazioni per un calcolo migliore.',
  };
}

export function recoveryWeekTopic(consecutiveLoadWeeks: number): Explanation {
  return {
    title: 'Settimana di scarico',
    short: `Hai ${consecutiveLoadWeeks} settimane di carico di fila: questa settimana il piano riduce intensità e volume.`,
    lead: [
      'Dopo alcune settimane di carico il corpo ha bisogno di una settimana più leggera per assorbire il lavoro fatto.',
      'Il piano segue la regola di tre settimane di carico e una di scarico.',
    ],
  };
}
