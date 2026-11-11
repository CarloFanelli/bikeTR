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

// Tempi di segmenti e km all'orologio, con i secondi: "9:58", "1:02:03". I tempi dei segmenti
// differiscono di pochi secondi: "9m" li renderebbe tutti uguali.
export function fmtClock(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "07 mag 2026"; con `year: '2-digit'` "07 mag 26".
export function fmtDate(date: DateInput, { year = 'numeric' }: { year?: 'numeric' | '2-digit' } = {}): string {
  return new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year });
}

// "1 settembre" da "2026-09-01".
export const dayMonth = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

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
