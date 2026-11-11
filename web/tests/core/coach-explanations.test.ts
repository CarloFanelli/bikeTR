import { describe, expect, it } from 'vitest';
import { errorTopic, workoutWhyTopic } from '../../src/core/explanations/coach.ts';

describe('spiegazioni del Coach', () => {
  it('il perché del workout porta il ragionamento intero e un link per paper citato, con le frasi citate', () => {
    const topic = workoutWhyTopic({
      razionale: 'Ragionamento lungo.',
      paperRefs: [{
        pmid: '123', title: 'Titolo', authors: 'Rossi', year: '2020', journal: 'J Sport',
        passages: [{ label: 'PMID:123 §1', text: 'Frase' }], license: 'CC BY 4.0', licenseUrl: 'https://l',
      }],
    });
    expect(topic.lead).toEqual(['Ragionamento lungo.']);
    expect(topic.links).toEqual([{
      label: 'Rossi (2020). Titolo',
      url: 'https://pubmed.ncbi.nlm.nih.gov/123/',
      note: 'J Sport · CC BY 4.0 · PMID 123',
      quotes: ['«Frase» [PMID:123 §1]'],
    }]);
  });

  it('senza paper citati, nessun link', () => {
    expect(workoutWhyTopic({ razionale: 'x', paperRefs: [] }).links).toEqual([]);
  });

  it('senza rivista né licenza, la nota ha solo il PMID', () => {
    const topic = workoutWhyTopic({ razionale: 'x', paperRefs: [{ pmid: '9', title: 'T', authors: 'A', year: '2001' }] });
    expect(topic.links?.[0].note).toBe('PMID 9');
  });

  it('un errore qualsiasi porta il messaggio del servizio nel pannello', () => {
    expect(errorTopic({ error: 'model', message: 'Ollama spento.' })).toMatchObject({ title: 'Errore chiamata modello', lead: ['Ollama spento.'] });
    expect(errorTopic({ message: 'boh' }).title).toBe('Workout non generato');
  });

  it('la ricerca dei paper mette i comandi nei dettagli tecnici', () => {
    expect(errorTopic({ error: 'retrieval', message: 'm' }).technical?.join(' ')).toContain('git restore papers_index.json');
  });
});
