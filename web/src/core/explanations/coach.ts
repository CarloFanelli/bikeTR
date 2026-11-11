// Spiegazioni di Coach AI: perché il Coach propone il workout (con i paper citati), il
// workout dalle regole di riserva e gli errori. Dipendono dalla risposta del servizio.

import type { CoachRefusal, CoachWorkout } from '../coach-types.ts';
import { citedPapers, errorHeading, paperCitation, pubmedUrl } from '../coach-view.ts';
import type { Explanation } from './types.ts';

// Il ragionamento del modello e i paper citati, ognuno con le frasi da cui viene.
export function workoutWhyTopic(w: Pick<CoachWorkout, 'razionale' | 'paperRefs'>): Explanation {
  return {
    title: 'Perché questo workout',
    short: 'Il ragionamento del Coach sui tuoi dati e i paper su cui si basa.',
    lead: [w.razionale],
    links: citedPapers(w.paperRefs).map(({ paper, quotes, license }) => ({
      label: paperCitation(paper),
      url: pubmedUrl(paper.pmid),
      note: [paper.journal, license?.name, `PMID ${paper.pmid}`].filter(Boolean).join(' · '),
      quotes: quotes.map(q => `«${q.text}» [${q.label}]`),
    })),
  };
}

// Il workout costruito dalle regole di riserva perché il modello non ha dato una risposta valida.
export function fallbackTopic(warning: string): Explanation {
  return {
    title: 'Workout dalle regole di riserva',
    short: 'Il modello non ha dato un workout valido: questo viene dalle regole fisse del Coach.',
    lead: [warning],
  };
}

// Un errore del Coach: il titolo in una riga, la spiegazione nel pannello.
export function errorTopic(refusal: CoachRefusal): Explanation {
  if (refusal.error === 'no_ftp') {
    return {
      title: 'FTP non disponibile',
      short: 'Il Coach ha bisogno della FTP per calcolare la potenza di ogni ripetuta.',
      lead: ['Dichiara la FTP in Impostazioni, sezione Soglie, oppure registra su Strava qualche uscita con un misuratore di potenza.'],
    };
  }
  if (refusal.error === 'retrieval') {
    return {
      title: 'Ricerca dei paper non riuscita',
      short: 'Il Coach non è riuscito a cercare nei paper della libreria.',
      lead: [refusal.message],
      technical: [
        'Se manca il file papers_index.json, ripristinalo da git: git restore papers_index.json.',
        'Se l\'indice è stato codificato con un altro modello di ricerca, il messaggio qui sopra dà il comando che lo ricodifica.',
      ],
    };
  }
  return { title: errorHeading(refusal.error), short: 'Il Coach non ha generato il workout.', lead: [refusal.message] };
}
