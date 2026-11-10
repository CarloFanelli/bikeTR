// Testi della schermata Libreria: da dove viene un paper, quale testo il Coach ne usa, cosa ne
// dipende e i suoi link. Ricevono i dati e restituiscono testi, senza leggere il browser.

import { licenseLink } from './coach-view.ts';
import type { LibraryPaper } from './library-types.ts';

export const originLabel = (p: LibraryPaper) => (p.origin === 'base' ? 'paper di base' : 'aggiunto');

export const passageCount = (n: number) => (n === 1 ? '1 passaggio' : `${n} passaggi`);

// Il testo completo porta la sua licenza, da accreditare; l'abstract no.
export function textUsed(p: LibraryPaper): { label: string; license: { name: string; url: string } | null } {
  if (p.textUsed !== 'fullText') return { label: 'abstract', license: null };
  return { label: 'testo completo', license: licenseLink(p.license, p.licenseUrl) };
}

// Una riga per i workout di cui il paper è il paper di supporto e una per ogni regola di selezione;
// nessuna riga per un paper che nessuno nomina.
export function dependencyLines(p: LibraryPaper): string[] {
  const { workouts, rules } = p.supports;
  return [
    ...(workouts.length ? [`Paper di supporto di: ${workouts.join(', ')}`] : []),
    ...rules.map((rule) => `Fonte della regola di selezione: ${rule}`),
  ];
}

// Europe PMC solo per un paper di cui il Coach usa il testo completo, che viene da lì.
export const europePmcUrl = (p: LibraryPaper) =>
  p.textUsed === 'fullText' ? `https://europepmc.org/article/MED/${p.pmid}` : null;
