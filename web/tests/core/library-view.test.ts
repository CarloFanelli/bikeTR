import { describe, expect, it } from 'vitest';
import type { LibraryPaper } from '../../src/core/library-types.ts';
import { dependencyLines, europePmcUrl, originLabel, passageCount, textUsed } from '../../src/core/library-view.ts';

const whitty: LibraryPaper = {
  pmid: '27175601', title: 'The effect of low- vs high-cadence interval training.', authors: 'Whitty et al.',
  year: '2016', journal: 'Applied physiology', origin: 'base', textUsed: 'abstract', passageCount: 4,
  license: null, licenseUrl: null, supports: { workouts: ['Z2 + cadence drills'], rules: [] },
};
const ccBy = { license: 'CC BY', licenseUrl: 'http://creativecommons.org/licenses/by/4.0/' };
const fullText: LibraryPaper = { ...whitty, pmid: '24550842', textUsed: 'fullText', ...ccBy, supports: { workouts: [], rules: [] } };

describe('testi della Libreria', () => {
  it('paper di base o aggiunto', () => {
    expect([originLabel(whitty), originLabel({ ...whitty, origin: 'added' })]).toEqual(['paper di base', 'aggiunto']);
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
});
