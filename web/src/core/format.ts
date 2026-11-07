// Formattazione di distanze, velocità, durate e date per le schermate, e giorno locale di una data.

type DateInput = string | number | Date;

export function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(1) + ' km';
}

// Velocità di Strava (metri al secondo) in km/h, con un decimale.
export const kmh = (metersPerSecond: number): string => (metersPerSecond * 3.6).toFixed(1);

export function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// "07 mag 2026"; con `year: '2-digit'` "07 mag 26".
export function fmtDate(date: DateInput, { year = 'numeric' }: { year?: 'numeric' | '2-digit' } = {}): string {
  return new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year });
}

// "2026-05-07", nel fuso orario del browser.
export function isoDay(date: DateInput): string {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Icona di ogni tipo di attività di Strava; gli altri tipi usano '•'.
export const TYPE_EMOJI: Record<string, string> = {
  Ride: '🚴', VirtualRide: '🚴', EBikeRide: '🚴',
  MountainBikeRide: '🚵', GravelRide: '🚵',
  Run: '🏃', VirtualRun: '🏃', TrailRun: '🏃',
  Swim: '🏊', Walk: '🚶', Hike: '🥾', Workout: '💪',
};
