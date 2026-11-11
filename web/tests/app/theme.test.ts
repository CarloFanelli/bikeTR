import { describe, expect, it } from 'vitest';
import { THEMES } from '../../src/app/theme.ts';

// Contrasto WCAG fra due colori #RRGGBB.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('colori dei grafici', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const colors = theme.colors as Record<string, string>;
    const series = Object.keys(colors).filter(k => k.startsWith('series-') || k.startsWith('load-'));

    it(`tema ${name}: ogni serie arriva almeno a 3:1 sul fondo delle card`, () => {
      expect(series.length).toBeGreaterThan(10);
      for (const key of series) expect(contrast(colors[key], colors.surface), key).toBeGreaterThanOrEqual(3);
    });
  }

  it('i due temi hanno le stesse serie', () => {
    const keys = (t: keyof typeof THEMES) => Object.keys(THEMES[t].colors ?? {}).filter(k => /^(series|load)-/.test(k)).sort();
    expect(keys('dark')).toEqual(keys('light'));
  });
});
