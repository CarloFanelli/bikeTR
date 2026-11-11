import { describe, expect, it } from 'vitest';
import { routePath } from '../../src/core/route-path.ts';

const coords = (d: string) => d.slice(1).split(/ L /).map(p => p.trim().split(' ').map(Number));

describe('mini mappa', () => {
  it('il percorso riempie il riquadro, con il nord in alto e il margine ai lati', () => {
    // Da sud a nord: la linea va dal basso verso l'alto.
    const d = routePath([[45, 9], [45.01, 9]], 64, 48, 4)!;
    const [[, y0], [, y1]] = coords(d);
    expect(y0).toBe(44);
    expect(y1).toBe(4);
  });

  it('mantiene le proporzioni e centra il percorso nel riquadro', () => {
    // Est-ovest: più largo che alto, centrato in verticale.
    const [[x0, y0], [x1, y1]] = coords(routePath([[0, 0], [0, 1]], 64, 48, 4)!);
    expect([x0, x1]).toEqual([4, 60]);
    expect(y0).toBe(24);
    expect(y1).toBe(24);
  });

  it('meno di due punti o tutti nello stesso posto: niente linea', () => {
    expect(routePath([], 64, 48, 4)).toBeNull();
    expect(routePath([[45, 9]], 64, 48, 4)).toBeNull();
    expect(routePath([[45, 9], [45, 9]], 64, 48, 4)).toBeNull();
  });
});
