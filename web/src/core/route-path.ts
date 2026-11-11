// La mini mappa di Attività: il percorso disegnato come una linea in un riquadro, senza
// tessere della mappa. Il nord sta in alto e le proporzioni restano quelle vere: un grado di
// longitudine si accorcia verso i poli, quindi si moltiplica per il coseno della latitudine.

import type { LatLng } from './polyline.ts';

// Il percorso di una linea SVG ("M x y L x y …") dentro `width` × `height`, con `pad` di margine
// e il disegno centrato; null con meno di due punti o con tutti i punti nello stesso posto.
export function routePath(points: LatLng[], width: number, height: number, pad: number): string | null {
  if (points.length < 2) return null;
  const cos = Math.cos((points[0][0] * Math.PI) / 180);
  const xs = points.map(([, lng]) => lng * cos);
  const ys = points.map(([lat]) => lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!spanX && !spanY) return null;
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const scale = Math.min(spanX ? innerW / spanX : Infinity, spanY ? innerH / spanY : Infinity);
  const left = pad + (innerW - spanX * scale) / 2;
  const top = pad + (innerH - spanY * scale) / 2;
  const round = (v: number) => +v.toFixed(1);
  return points
    .map((_, i) => `${i ? 'L' : 'M'} ${round(left + (xs[i] - minX) * scale)} ${round(top + (maxY - ys[i]) * scale)}`)
    .join(' ');
}
