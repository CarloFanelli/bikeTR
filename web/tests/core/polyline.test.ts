import { describe, expect, it } from 'vitest';
import { decodePolyline } from '../../src/core/polyline.ts';

describe('percorso di un\'attività', () => {
  it('decodifica l\'esempio della documentazione di Google', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points.map(([lat, lng]) => [+lat.toFixed(5), +lng.toFixed(5)])).toEqual([
      [38.5, -120.2], [40.7, -120.95], [43.252, -126.453],
    ]);
  });

  it('un percorso vuoto non ha punti', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
