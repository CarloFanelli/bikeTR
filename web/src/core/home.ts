// Quello che mostra Home: precisione dei dati, profilo, record e totali dell'atleta,
// con i loro testi e arrotondamenti.

import { fmtKm, fmtTime, kmh } from './format.ts';
import type { HrProfile } from './hr.ts';
import type { buildProfile, personalRecords } from './profile.ts';
import type { Activity, AthleteStats } from './strava-types.ts';

interface ShownValue {
  value: string;
  // Tra parentesi dopo il valore: "(dichiarata)" o da dove viene la stima.
  note: string;
}

interface DataPrecision {
  // Da dove viene il carico di ogni uscita: icona, parte in grassetto, resto.
  mode: { icon: string; label: string; detail: string };
  ftp: ShownValue;
  lthr: ShownValue;
  withPower: string;
  withHr: string;
  streams: string;
}

const estimate = (value: number, unit: string, parts: string[]): ShownValue =>
  ({ value: `${value} ${unit}`, note: parts.length ? `(${parts.join(' / ')})` : '' });

const NONE: ShownValue = { value: '—', note: '' };

// `maxStreams`: quante uscite al massimo scarica "Aggiorna con streams".
export function dataPrecision(profile: HrProfile, activities: Activity[], maxStreams: number): DataPrecision {
  const bikes = activities.filter(a => a.type?.includes('Ride'));
  // Un'uscita con lo scaricamento fallito non conta.
  const withStreams = bikes.filter(a => a._metrics && !(a._metrics as { _error?: string })._error).length;
  const withPower = bikes.filter(a => a.weighted_average_watts || a.average_watts).length;
  const withHr = bikes.filter(a => a.has_heartrate).length;

  const fromStreams = (name: string) => withStreams > 0
    ? { label: `${name} da streams`, detail: `(${withStreams} attività) + ${name} approssimato` }
    : null;
  const mode = profile.ftp
    ? { icon: '🔋', ...(fromStreams('TSS') || { label: 'TSS approssimato', detail: '(Weighted Avg summary)' }) }
    : profile.hrLthr
    ? { icon: '❤️', ...(fromStreams('hrTSS') || { label: 'hrTSS approssimato', detail: '' }) }
    : { icon: '⚠️', label: 'Proxy HR-max', detail: '(meno preciso, imposta LTHR per upgrade)' };

  const ftpParts = [];
  if (profile.ftpEstFromActivities) ftpParts.push(`${profile.ftpEstFromActivities}W da attività`);
  if (profile.ftpEstFromSegments) ftpParts.push(`${profile.ftpEstFromSegments}W da segmenti`);
  const ftp = profile.ftpDecl ? { value: `${profile.ftpDecl} W`, note: '(dichiarata)' }
    : profile.ftpEst ? estimate(profile.ftpEst, 'W', ftpParts)
    : NONE;

  const lthrParts = [];
  if (profile.lthrEstFromActivities) lthrParts.push(`${profile.lthrEstFromActivities} da attività`);
  if (profile.lthrEstFromSegments) lthrParts.push(`${profile.lthrEstFromSegments} da segmenti`);
  const lthr = profile.lthrSource === 'declared' && profile.lthrDecl ? { value: `${profile.lthrDecl} bpm`, note: '(dichiarata)' }
    : profile.lthrEst ? estimate(profile.lthrEst, 'bpm', lthrParts)
    : NONE;

  return {
    mode, ftp, lthr,
    withPower: `${withPower}/${bikes.length}`,
    withHr: `${withHr}/${bikes.length}`,
    streams: `${withStreams}/${Math.min(maxStreams, bikes.length)}`,
  };
}

// Le righe del profilo atleta: [nome, valore].
export function profileRows(p: ReturnType<typeof buildProfile>): [string, string][] {
  const rows: [string, string][] = [
    ['Forma', p.form],
    ['Km all-time', Math.round(p.allKm).toLocaleString('it-IT')],
    ['Uscite all-time', String(p.allCount)],
    ['Km ult. 4 sett.', String(Math.round(p.recentKm))],
    ['Ore/sett recenti', `${p.weeklyRecent.toFixed(1)}h`],
    ['Uscite ult. 4 sett.', String(p.recentCount)],
    ['Consistenza 8 sett.', `${Math.round(p.consistency * 100)}%`],
  ];
  if (p.wPerKg) rows.push(['W/kg (best)', p.wPerKg]);
  return rows;
}

interface RecordRow {
  label: string;
  activity: Activity;
  value: string;
}

// I record personali; manca la riga di un record senza uscita (es. nessuna sopra 30 km).
export function recordRows(recs: ReturnType<typeof personalRecords>): RecordRow[] {
  if (!recs) return [];
  const rows: [string, Activity | null, (a: Activity) => string][] = [
    ['Più lunga', recs.longest, a => `${fmtTime(a.moving_time)} · ${fmtKm(a.distance)}`],
    ['Più dislivello', recs.mostClimb, a => `↑${Math.round(a.total_elevation_gain)} m`],
    ['Più veloce (>30km)', recs.fastest, a => `${kmh(a.average_speed || 0)} km/h`],
    ['Più dura (Suffer)', recs.mostSuffer, a => `${a.suffer_score || 0} SS`],
  ];
  return rows.flatMap(([label, activity, value]) => activity ? [{ label, activity, value: value(activity) }] : []);
}

// Totali di sempre per bici, corsa e nuoto, solo degli sport con almeno un'attività.
export function athleteTotals(stats: AthleteStats | null) {
  const totals = [
    ['🚴 Bici (all-time)', stats?.all_ride_totals],
    ['🏃 Corsa (all-time)', stats?.all_run_totals],
    ['🏊 Nuoto (all-time)', stats?.all_swim_totals],
  ] as const;
  return totals.flatMap(([label, t]) => t?.count ? [{ label, distance: fmtKm(t.distance), count: t.count }] : []);
}
