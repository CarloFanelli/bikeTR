// Testi della schermata Libreria: da dove viene un paper, quale testo il Coach ne usa, cosa ne
// dipende e i suoi link. Ricevono i dati e restituiscono testi, senza leggere il browser.

import { licenseLink } from './coach-view.ts';
import type { AddedPaper, LibraryPaper } from './library-types.ts';

export const originLabel = (p: LibraryPaper) => (p.origin === 'base' ? 'paper di base' : 'aggiunto');

export const passageCount = (n: number) => (n === 1 ? '1 passaggio' : `${n} passaggi`);

// Il testo completo porta la sua licenza, da accreditare; l'abstract no.
export function textUsed(p: Pick<LibraryPaper, 'textUsed' | 'license' | 'licenseUrl'>): { label: string; license: { name: string; url: string } | null } {
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

// Un PMID è un numero: il servizio rifiuta il resto prima di chiedere a PubMed.
export const pmidError = (text: string) => (/^\d{1,10}$/.test(text.trim()) ? null : 'Il PMID è un numero');

// L'indicizzazione usa il modello di ricerca del servizio, non il modello chat: nessun costo.
export const FREE_INDEXING = "Indicizzazione gratis: la fa il modello di ricerca sul tuo computer, nessun modello chat.";

export const addedLine = (a: AddedPaper) =>
  `✅ Aggiunto: ${passageCount(a.passageCount)} salvati in ${a.seconds.toLocaleString('it-IT')} s.`;

// La domanda prima di togliere un paper: nomina i workout e le regole che perdono il loro paper di supporto.
export function removalQuestion(p: LibraryPaper): string {
  const lines = dependencyLines(p);
  const what = p.origin === 'base' ? 'Togliere dalla libreria' : 'Cancellare dalla libreria';
  const question = `${what} ${p.authors} (${p.year}), PMID ${p.pmid}?`;
  if (!lines.length) return question;
  return `${question}\n\nÈ il paper di supporto di workout o regole del Coach, che lo perdono:\n- ${lines.join('\n- ')}`;
}
