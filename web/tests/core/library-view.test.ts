import { describe, expect, it } from 'vitest';
import type { Library, LibraryPaper } from '../../src/core/library-types.ts';
import {
  ADD_PAGE, addedLine, dependencyLines, europePmcUrl, isPmid, matchState, noMatchLine, originLabel, paperAt, passageCount,
  pmidError, removalQuestion, textUsed,
} from '../../src/core/library-view.ts';

const whitty: LibraryPaper = {
  pmid: '27175601', title: 'The effect of low- vs high-cadence interval training.', authors: 'Whitty et al.',
  year: '2016', journal: 'Applied physiology', origin: 'base', wasAdded: false, textUsed: 'abstract', passageCount: 4,
  license: null, licenseUrl: null, supports: { workouts: ['Z2 + cadence drills'], rules: [] },
};
const ccBy = { license: 'CC BY', licenseUrl: 'http://creativecommons.org/licenses/by/4.0/' };
const fullText: LibraryPaper = { ...whitty, pmid: '24550842', textUsed: 'fullText', ...ccBy, supports: { workouts: [], rules: [] } };

describe('testi della Libreria', () => {
  it('paper di base o aggiunto', () => {
    expect([originLabel(whitty), originLabel({ ...whitty, origin: 'added' })]).toEqual(['paper di base', 'aggiunto']);
  });

  it('un paper aggiunto che è diventato di base lo dice', () => {
    expect(originLabel({ ...whitty, wasAdded: true })).toBe('ora tra i paper di base');
  });

  it('numero dei passaggi, al singolare per uno', () => {
    expect([passageCount(1), passageCount(62)]).toEqual(['1 passaggio', '62 passaggi']);
  });

  it('testo completo con la sua licenza, o abstract', () => {
    expect(textUsed(fullText)).toEqual({ label: 'testo completo', license: { name: 'CC BY', url: ccBy.licenseUrl } });
    expect(textUsed(whitty)).toEqual({ label: 'abstract', license: null });
  });

  it('una licenza senza indirizzo web non diventa un link', () => {
    expect(textUsed({ ...fullText, licenseUrl: 'javascript:alert(1)' }).license).toBeNull();
  });

  it('il paper di supporto nomina i suoi workout e le sue regole', () => {
    const rule = 'Hard dal 30% in su: z2_endurance [PMID:20861519]';
    expect(dependencyLines({ ...whitty, supports: { workouts: ['Z2 + cadence drills', 'Z2 Aerobico'], rules: [rule] } }))
      .toEqual(['Paper di supporto di: Z2 + cadence drills, Z2 Aerobico', `Fonte della regola di selezione: ${rule}`]);
  });

  it('un paper che nessuno nomina non ha righe di dipendenza', () => {
    expect(dependencyLines(fullText)).toEqual([]);
  });

  it('link a Europe PMC solo per un testo completo', () => {
    expect([europePmcUrl(fullText), europePmcUrl(whitty)]).toEqual(['https://europepmc.org/article/MED/24550842', null]);
  });

  it('il PMID è un numero', () => {
    expect([pmidError('27175601'), pmidError(' 27175601 ')]).toEqual([null, null]);
    expect(['', '12a', 'PMID:1', '12345678901'].map(pmidError)).toEqual(Array(4).fill('Il PMID è un numero'));
  });

  it('esito dell\'aggiunta: passaggi salvati e secondi', () => {
    expect(addedLine({ pmid: '1', passageCount: 62, seconds: 4.5 })).toBe('✅ Aggiunto: 62 passaggi salvati in 4,5 s.');
  });

  it('togliere un paper di supporto nomina chi lo perde', () => {
    expect(removalQuestion(whitty)).toBe(
      'Togliere dalla libreria Whitty et al. (2016), PMID 27175601?\n\n'
      + 'È il paper di supporto di workout o regole del Coach, che lo perdono:\n- Paper di supporto di: Z2 + cadence drills',
    );
  });

  it('togliere un paper che nessuno nomina chiede solo conferma; un aggiunto si cancella', () => {
    expect(removalQuestion({ ...fullText, origin: 'added' }))
      .toBe('Cancellare dalla libreria Whitty et al. (2016), PMID 24550842?');
  });

  it('l\'indirizzo apre il paper che nomina', () => {
    expect(paperAt([whitty, fullText], '24550842')).toBe(fullText);
  });

  it('senza un PMID nell\'indirizzo nessun paper è aperto', () => {
    expect([paperAt([whitty], undefined), paperAt([whitty], '')]).toEqual([undefined, undefined]);
  });

  it('la pagina per aggiungere un paper non è un paper', () => {
    expect([ADD_PAGE, paperAt([whitty], 'aggiungi')]).toEqual(['aggiungi', undefined]);
  });

  it('un PMID sconosciuto, tolto o non numerico non apre nulla', () => {
    expect(['1', 'abc'].map((pmid) => paperAt([whitty], pmid))).toEqual([null, null]);
  });

  it('solo cifre è un PMID, il resto sono parole da cercare', () => {
    expect(['27175601', ' 27175601 ', '0', '123456789012'].map(isPmid)).toEqual([true, true, true, true]);
    expect(['seiler 2010', '12a', 'PMID:1', ''].map(isPmid)).toEqual([false, false, false, false]);
  });

  it('un risultato già in libreria, tolto o da aggiungere', () => {
    const library: Library = { papers: [whitty], removed: [fullText], warning: null };
    expect(['27175601', '24550842', '111'].map((pmid) => matchState(pmid, library)))
      .toEqual(['inLibrary', 'removed', 'addable']);
  });

  it('nessun risultato ripete il testo cercato com\'è scritto', () => {
    expect(noMatchLine('  «zona» "2" <b> & co ')).toBe('Nessun paper su PubMed per ««zona» "2" <b> & co»');
  });
});
