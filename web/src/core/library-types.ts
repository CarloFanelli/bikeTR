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
  textUsed: 'abstract' | 'fullText';
  passageCount: number;
  license: string | null;
  licenseUrl: string | null;
  // I workout e le regole di selezione di cui il paper è il paper di supporto, in italiano.
  supports: { workouts: string[]; rules: string[] };
}

export interface LibraryPassages {
  pmid: string;
  passages: PassageQuote[];
}
