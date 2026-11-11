import { describe, expect, it } from 'vitest';
import { emojiIcon, splitEmoji, withoutEmoji } from '../../src/core/emoji.ts';

describe('emoji iniziale dei testi calcolati', () => {
  it.each([
    ['🔴 Soglia 3×12′', 'hard', 'Soglia 3×12′'],
    ['🟢 Fondo facile', 'easy', 'Fondo facile'],
    ['⏸️ Riposo programmato', 'skip', 'Riposo programmato'],
    ['⏸ Riposo programmato', 'skip', 'Riposo programmato'],
    ['✓ Fatto: Giro lungo', 'done', 'Fatto: Giro lungo'],
    ['🔋 TSS da streams', 'power', 'TSS da streams'],
  ])('"%s" diventa l\'icona %s e il testo senza emoji', (text, icon, rest) => {
    expect(splitEmoji(text)).toEqual({ icon, text: rest });
  });

  it('un emoji senza icona corrispondente si toglie senza icona', () => {
    expect(splitEmoji('🦄 Uscita strana')).toEqual({ icon: null, text: 'Uscita strana' });
    expect(splitEmoji('• Libero')).toEqual({ icon: null, text: 'Libero' });
  });

  it('un testo che comincia con una parola resta com\'è', () => {
    expect(splitEmoji('Soglia 3×12′')).toEqual({ icon: null, text: 'Soglia 3×12′' });
    expect(splitEmoji('3×12′ a soglia')).toEqual({ icon: null, text: '3×12′ a soglia' });
    expect(splitEmoji('')).toEqual({ icon: null, text: '' });
  });

  it('l\'icona di un emoji da solo, con o senza selettore di variante', () => {
    expect(emojiIcon('🌧️')).toBe('rain');
    expect(emojiIcon('🚴')).toBe('ride');
    expect(emojiIcon('🦄')).toBeNull();
  });
});

describe('emoji in mezzo o in fondo al testo', () => {
  it.each([
    ['possibile nuovo PR 🔥', 'possibile nuovo PR'],
    ['📈 +3 W/sett', '+3 W/sett'],
    ['➡️ stabile', 'stabile'],
    ['🟢 fresco', 'fresco'],
    ['📊 12 segmenti · 3 senza tentativi', '12 segmenti · 3 senza tentativi'],
  ])('"%s" diventa "%s"', (text, rest) => {
    expect(withoutEmoji(text)).toBe(rest);
  });

  it('un testo su più righe tiene gli a capo', () => {
    expect(withoutEmoji('🔥 Riscaldamento 10′\n⚡ 4×4′ a soglia\nDefaticamento')).toBe('Riscaldamento 10′\n4×4′ a soglia\nDefaticamento');
  });

  it('frecce, segni e numeri restano', () => {
    expect(withoutEmoji('→ stabile · ↑120 m · 3×12′')).toBe('→ stabile · ↑120 m · 3×12′');
  });
});

describe('icone delle osservazioni', () => {
  it.each([['💡', 'idea'], ['🚀', 'boost'], ['🛌', 'sleep'], ['🦵', 'legs'], ['⬇️', 'down'], ['💪', 'strength'], ['📊', 'chart']])(
    '%s ha l\'icona %s', (emoji, icon) => {
      expect(emojiIcon(emoji)).toBe(icon);
    },
  );
});
