// I dati dell'atleta (core/athlete-data.ts) letti dal server all'apertura e tenuti qui in
// memoria: le schermate li leggono subito, come prima dal browser, e ogni salvataggio cambia la
// copia in memoria e va al server. Alla prima apertura dopo l'aggiornamento il browser manda al
// server, se è vuoto, quello che aveva salvato, poi cancella le sue copie.

import { ATHLETE_KEYS, type AthleteKey, cleanForServer } from '../core/athlete-data.ts';
import { athleteData, type CoachAnswer, importAthleteData, saveAthleteData } from './coach.ts';

let memory: Partial<Record<AthleteKey, unknown>> = {};
// L'ultimo valore che il server ha preso, per chiave: un salvataggio rifiutato torna a questo.
let confirmed: Partial<Record<AthleteKey, unknown>> = {};
// Un salvataggio alla volta per chiave: due salvataggi vicini arrivano al server nell'ordine giusto.
const queues = new Map<AthleteKey, Promise<unknown>>();

export const readAthleteData = (key: AthleteKey): unknown => memory[key];

// Cambia la copia in memoria subito; la risposta dice se il server ha salvato. Se non ha
// salvato, la memoria torna all'ultimo valore che il server ha preso (a meno che un salvataggio
// più nuovo, ancora in corso, l'abbia già cambiata).
export function writeAthleteData(key: AthleteKey, value: unknown): Promise<CoachAnswer<null>> {
  memory[key] = value;
  const previous = queues.get(key) ?? Promise.resolve();
  const saving = previous.then(() => saveAthleteData(key, value)).then((answer) => {
    if (answer.ok) confirmed[key] = value;
    else if (memory[key] === value) memory[key] = confirmed[key];
    return answer;
  });
  queues.set(key, saving);
  return saving;
}

// I dati salvati nel browser dalle versioni precedenti, puliti; un JSON rovinato si salta.
function localCopies(): Partial<Record<AthleteKey, unknown>> {
  const found: Partial<Record<AthleteKey, unknown>> = {};
  for (const [key, name] of Object.entries(ATHLETE_KEYS) as [AthleteKey, string][]) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(name);
    } catch { /* dati del browser bloccati: nulla da mandare */ }
    if (raw == null) continue;
    try {
      const cleaned = cleanForServer(key, JSON.parse(raw));
      if (cleaned !== null) found[key] = cleaned;
    } catch {
      console.warn(`[athlete-data] ${name} illeggibile: non viene mandato al server`);
    }
  }
  return found;
}

function deleteLocalCopies(): void {
  for (const name of Object.values(ATHLETE_KEYS)) {
    try {
      localStorage.removeItem(name);
      localStorage.removeItem(name + '.broken');
    } catch { /* dati del browser bloccati */ }
  }
}

// All'apertura: i dati dal server, dopo aver mandato quelli del browser se il server è vuoto.
// Se il server ne ha già (anche perché un altro browser è arrivato prima) le copie del browser
// si cancellano senza mandarle. Un errore lascia le copie: si riprova alla prossima apertura.
export async function loadAthleteData(): Promise<CoachAnswer<null>> {
  let saved = await athleteData();
  if (!saved.ok) return saved;
  const local = localCopies();
  if (!Object.keys(saved.value).length && Object.keys(local).length) {
    const sent = await importAthleteData(local);
    if (!sent.ok && sent.code !== 'not_empty') return sent;
    saved = await athleteData();
    if (!saved.ok) return saved;
  }
  deleteLocalCopies();
  memory = { ...saved.value };
  confirmed = { ...saved.value };
  return { ok: true, value: null };
}
