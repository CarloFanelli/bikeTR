// Giorni del calendario del piano: lunedì della settimana in corso, etichette dei giorni,
// giorni disponibili e giorni della lunga scelti nelle impostazioni.

import type { Settings } from '../settings.ts';

// Conversioni dow ISO (1=Lun … 7=Dom) ↔ JS (0=Dom … 6=Sab) e helper calendario.
export function jsDowToIso(jsDow: number): number { return jsDow === 0 ? 7 : jsDow; }

// Offset (giorni rispetto a oggi) di lunedì della settimana corrente. Sempre ≤ 0.
// Es. oggi mercoledì → -2. Oggi domenica → -6.
export function currentMondayOffset(now: Date): number {
  const dow = now.getDay();
  return -(((dow + 6) % 7));
}

// "Oggi", "Domani", poi per esteso: "lunedì 9 nov".
export function offsetLabel(offset: number, now: Date): string {
  if (offset === 0) return 'Oggi';
  if (offset === 1) return 'Domani';
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
}

// Default longRideDays: sabato (ISO 6) se non configurato.
function longRideDays(settings: Settings | null | undefined): number[] {
  const arr = settings?.longRideDays;
  if (Array.isArray(arr) && arr.length) return arr;
  return [6]; // sabato
}
export function isLongRideDay(jsDow: number, settings: Settings | null | undefined): boolean {
  return longRideDays(settings).includes(jsDowToIso(jsDow));
}

// Default availableDays: tutti i 7 giorni.
function availableDays(settings: Settings | null | undefined): number[] {
  const arr = settings?.availableDays;
  if (Array.isArray(arr) && arr.length) return arr;
  return [1,2,3,4,5,6,7];
}
export function isAvailableDay(jsDow: number, settings: Settings | null | undefined): boolean {
  return availableDays(settings).includes(jsDowToIso(jsDow));
}
