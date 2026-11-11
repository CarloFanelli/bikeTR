import { describe, expect, it } from 'vitest';
import { BOTTOM_BAR, SECTIONS, sectionOf } from '../../src/app/sections.ts';

describe('sezioni', () => {
  it('la sezione di un indirizzo, anche per il dettaglio di un\'attività', () => {
    expect(sectionOf('/home')?.title).toBe('Home');
    expect(sectionOf('/attivita/123')?.title).toBe('Attività');
    expect(sectionOf('/impostazioni')).toBeNull();
    // "/allenamento-x" non è Allenamento: conta solo il percorso intero o una sua sottocartella.
    expect(sectionOf('/allenamento-x')).toBeNull();
  });

  it('la barra in basso ha le cinque sezioni principali, Libreria resta fuori', () => {
    expect(BOTTOM_BAR.map(s => s.title)).toEqual(['Home', 'Allenamento', 'Analisi', 'Attività', 'Coach AI']);
    expect(SECTIONS.map(s => s.title)).toContain('Libreria');
  });
});
