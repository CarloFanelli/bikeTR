// Cosa la schermata Libreria riceve dal servizio Coach: i paper che il Coach cerca
// (docker/coach/app/library.py) e, aprendone uno, i suoi passaggi.

import type { PassageQuote } from './coach-types.ts';

export interface LibraryPaper {
  pmid: string;
  title: string;
  authors: string;
  year: string;
  journal: string | null;
  // "base": dal file dell'indice del progetto; "added": aggiunto dall'atleta.
  origin: 'base' | 'added';
  // Un paper di base che l'atleta aveva aggiunto: un git pull l'ha portato tra quelli di base.
  wasAdded: boolean;
  textUsed: 'abstract' | 'fullText';
  passageCount: number;
  license: string | null;
  licenseUrl: string | null;
  // I workout e le regole di selezione di cui il paper è il paper di supporto, in italiano.
  supports: { workouts: string[]; rules: string[] };
}

// I paper che il Coach cerca, i paper di base tolti e il messaggio su una libreria salvata illeggibile.
export interface Library {
  papers: LibraryPaper[];
  removed: LibraryPaper[];
  warning: string | null;
}

export interface LibraryPassages {
  pmid: string;
  passages: PassageQuote[];
}

// Il paper come entrerebbe in libreria, prima della conferma: reason dice perché il testo usato.
export type PaperPreview = Omit<LibraryPaper, 'origin' | 'wasAdded' | 'supports'> & { reason: string };

// Un paper trovato su PubMed cercando per parole, prima dell'anteprima.
export type PaperMatch = Pick<LibraryPaper, 'pmid' | 'authors' | 'year' | 'title' | 'journal'>;

export interface AddedPaper {
  pmid: string;
  passageCount: number;
  seconds: number;
}
