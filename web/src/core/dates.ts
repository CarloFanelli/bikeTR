// Giorni rispetto a un giorno di riferimento, nel fuso orario del browser.

import { isoDay } from './format.ts';

export interface DateHelpers {
  // Mezzanotte del giorno di riferimento.
  ref: Date;
  // Giorni tra il giorno di riferimento e una data (0 = stesso giorno, 1 = il giorno prima).
  ago: (iso: string) => number;
  // Data AAAA-MM-GG a n giorni dal giorno di riferimento.
  refIso: (n: number) => string;
}

// Il giorno di riferimento è `dayOffset` giorni dopo quello di `now` (0 = oggi, 1 = domani).
export function buildDateHelpers(dayOffset: number, now: Date): DateHelpers {
  const ref = new Date(now);
  ref.setHours(0,0,0,0);
  ref.setDate(ref.getDate() + dayOffset);
  const ago = (iso: string) => {
    const d = new Date(iso); d.setHours(0,0,0,0);
    return Math.round((ref.getTime() - d.getTime()) / 86400000);
  };
  const refIso = (n: number) => {
    const d = new Date(ref);
    d.setDate(d.getDate() + n);
    return isoDay(d);
  };
  return { ref, ago, refIso };
}
