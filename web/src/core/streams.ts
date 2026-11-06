// Metriche di un'attività dai suoi stream secondo per secondo: potenza normalizzata
// e carico dalla potenza, tempo in zona e carico dalla frequenza cardiaca.

import { PHYSIO } from './physio.ts';
import type { StreamMetrics, Streams } from './strava-types.ts';

// NP = ((rolling30s^4 avg))^(1/4); IF = NP/FTP; TSS = (seconds × NP × IF) / (FTP × 3600) × 100
export function computeStreamsMetrics(
  streams: Streams, ftp: number | null | undefined, lthr: number | null | undefined,
): StreamMetrics {
  const out: StreamMetrics = {};
  const w = streams.watts?.data;
  const h = streams.heartrate?.data;

  if (w && w.length && ftp) {
    const win = 30;
    let sum = 0;
    const roll: number[] = [];
    for (let i = 0; i < w.length; i++) {
      sum += w[i];
      if (i >= win) sum -= w[i - win];
      if (i >= win - 1) roll.push(sum / win);
    }
    const mean4 = roll.reduce((s, r) => s + r*r*r*r, 0) / Math.max(1, roll.length);
    const np = Math.pow(mean4, 0.25);
    const seconds = w.length;
    const IF = np / ftp;
    const TSS = (seconds * np * IF) / (ftp * 3600) * 100;
    out.NP = Math.round(np);
    out.IF = +IF.toFixed(3);
    out.TSS = Math.round(TSS);
  }

  if (h && h.length && lthr) {
    // Time-in-zone rispetto a LTHR (zone Coggan/Friel)
    const z = [0,0,0,0,0];
    const [z2lo, z2hi] = PHYSIO.Z2_PCT_LTHR;
    const z3hi = PHYSIO.Z3_PCT_LTHR[1];
    const z4hi = PHYSIO.Z4_PCT_LTHR[1];
    h.forEach(hr => {
      const r = hr / lthr;
      const idx = r < z2lo ? 0 : r < z2hi ? 1 : r < z3hi ? 2 : r < z4hi ? 3 : 4;
      z[idx]++;
    });
    out.hrZones = z;
    const avgHR = h.reduce((s, x) => s + x, 0) / h.length;
    const hours = h.length / 3600;
    out.hrTSS = Math.round(Math.pow(avgHR / lthr, 2) * hours * 100);
  }
  return out;
}
