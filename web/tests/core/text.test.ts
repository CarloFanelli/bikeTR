import { describe, expect, it } from 'vitest';
import { clipWords } from '../../src/core/text.ts';

const words = (n: number, end = '') => Array.from({ length: n }, (_, i) => `p${i + 1}`).join(' ') + end;

describe('testo visibile di al massimo 30 parole', () => {
  it('un testo corto resta intero', () => {
    expect(clipWords('Fondo facile. Cadenza alta.', 30)).toEqual({ visible: 'Fondo facile. Cadenza alta.', clipped: false });
    expect(clipWords(words(30, '.'), 30)).toEqual({ visible: words(30, '.'), clipped: false });
  });

  it('un testo lungo si taglia alla fine dell\'ultima frase entro le 30 parole', () => {
    const text = `${words(10, '.')} ${words(25, '.')}`;
    expect(clipWords(text, 30)).toEqual({ visible: words(10, '.'), clipped: true });
  });

  it('un numero con il punto non è la fine di una frase', () => {
    const text = `${words(5, '.')} Media 3.5 ${words(30, '.')}`;
    expect(clipWords(text, 30)).toEqual({ visible: words(5, '.'), clipped: true });
  });

  it('senza una fine di frase entro le 30 parole si taglia alla trentesima con "…"', () => {
    expect(clipWords(words(40, '.'), 30)).toEqual({ visible: `${words(30)}…`, clipped: true });
  });

  it('gli a capo contano come spazi', () => {
    expect(clipWords('Riscaldamento 15′.\nPoi 3×12′ a soglia.', 30).visible).toBe('Riscaldamento 15′.\nPoi 3×12′ a soglia.');
  });
});
