// Spiegazioni di Home (forma, prontezza senza dati) e della scheda Profilo e dati di Analisi
// (livello, precisione dei dati, come si stimano FTP e LTHR). Il livello dipende dall'atleta.

import type { Explanation } from './types.ts';

export const HOME_EXPLANATIONS = {
  form: {
    title: 'Forma',
    short: 'Quanto sei fresco oggi: la tua forma di lungo periodo meno la fatica degli ultimi giorni. Sopra zero sei riposato, sotto zero stai caricando.',
    lead: [
      'Un valore negativo non è un problema: vuol dire che ti stai allenando più del solito e il corpo sta lavorando.',
      'Prima di una gara conviene arrivare sopra zero, con qualche giorno più leggero.',
    ],
    technical: [
      'È il TSB: la forma di lungo periodo (CTL, media del carico degli ultimi 42 giorni) meno la fatica (ATL, media degli ultimi 7 giorni).',
      'Il carico di ogni uscita è il TSS, dalla potenza o dalla frequenza cardiaca.',
    ],
  },
  readinessMissing: {
    title: 'Prontezza',
    short: 'Non ci sono uscite con un carico negli ultimi 90 giorni, quindi la fatica non si può calcolare.',
  },
  precision: {
    title: 'Precisione dei dati',
    short: 'Quanto sono precisi i calcoli di carico e fatica: dipende da potenza, frequenza cardiaca e dettaglio delle uscite.',
  },
  missingThreshold: {
    title: 'Valore mancante',
    short: 'Non c\'è un valore dichiarato e non ci sono uscite per stimarlo. Puoi inserirlo in Impostazioni.',
  },
  method: {
    title: 'Come si stimano FTP e LTHR',
    short: 'Dai tuoi sforzi migliori nelle uscite e sui segmenti; un valore che inserisci in Impostazioni ha la precedenza.',
    lead: [
      'La FTP è la potenza che reggi per circa un\'ora, la LTHR la frequenza cardiaca alla stessa soglia.',
      'L\'app guarda i tuoi sforzi migliori di 10-90 minuti, nelle uscite e sui segmenti in salita, e tiene la stima più alta.',
      'Con "Aggiorna con streams" scarica i dati secondo per secondo delle uscite recenti: i calcoli diventano più precisi.',
    ],
    technical: [
      'FTP dalle uscite: il miglior sforzo in quattro fasce di durata (10-20, 20-40, 40-90 minuti e sotto i 10), pesato per quanto è recente (dimezza in circa 8 settimane); la fascia 20-40 minuti vale × 0,95.',
      'FTP dai segmenti: fra quattro metodi si tiene quello più affidabile. Miglior sforzo di 15-30 minuti × 0,95 (affidabilità 0,7); lo stesso pesato per quanto è recente, con dimezzamento a 12 settimane (0,75); miglior sforzo di 15-40 minuti su salite del 3-12%, con almeno 40 m di dislivello e 1,5 km (0,9, niente scia né vento); media di cinque fasce di durata con fattori propri (0,85).',
      'LTHR: la più alta fra tre stime. Frequenza massima osservata × 0,91 (in letteratura 88-92%); miglior media di uscite di 20-60 minuti × 0,98, solo se il massimo ha toccato il 90% della frequenza massima; miglior media su segmenti di 15-45 minuti × 0,98.',
      'Senza streams la potenza normalizzata è quella approssimata da Strava. Con gli streams si calcolano la potenza normalizzata vera (media mobile di 30 secondi), il TSS e i minuti per zona. Ogni uscita costa una chiamata a Strava, che ne concede 100 ogni 15 minuti.',
    ],
  },
} satisfies Record<string, Explanation>;

// Il livello stimato dai km di sempre, con cosa vuol dire per il piano e i numeri del profilo.
export function levelTopic(level: { label: string; note: string }, rows: [string, string][]): Explanation {
  return {
    title: `Livello: ${level.label}`,
    short: `Stimato dai km di sempre in bici. ${level.note.split('. ')[0].replace(/\.$/, '')}.`,
    lead: [
      'Il livello viene dai km totali: sotto 500 nuovo, fino a 3.000 principiante, fino a 15.000 intermedio, fino a 50.000 avanzato, oltre veterano.',
      `Per il piano vuol dire: ${level.note}`,
    ],
    rows,
  };
}
