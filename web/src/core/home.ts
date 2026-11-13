// I testi e gli arrotondamenti di Home (settimana, ultima uscita) e della scheda Profilo e
// dati di Analisi (precisione dei dati, profilo, record e totali dell'atleta).

import { displayName } from './activity-view.ts';
import { dayOffsetIso, mondayIso } from './dates.ts';
import { fmtDate, fmtKm, fmtTime, isoDay, kmh } from './format.ts';
import type { HrProfile } from './hr.ts';
import { activityLoad } from './load.ts';
import type { buildProfile, personalRecords } from './profile.ts';
import type { DetailsProgress } from './coach-types.ts';
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
}

const estimate = (value: number, unit: string, parts: string[]): ShownValue =>
  ({ value: `${value} ${unit}`, note: parts.length ? `(${parts.join(' / ')})` : '' });

const NONE: ShownValue = { value: '—', note: '' };

export function dataPrecision(profile: HrProfile, activities: Activity[]): DataPrecision {
  const bikes = activities.filter(a => a.type?.includes('Ride'));
  const withPower = bikes.filter(a => a.weighted_average_watts || a.average_watts).length;
  const withHr = bikes.filter(a => a.has_heartrate).length;

  // Il carico lo calcola il servizio Coach, dai dettagli corsa che ha scaricato e, senza, dal riepilogo.
  const mode = profile.ftp
    ? { icon: '🔋', label: 'TSS dai dettagli corsa', detail: '(senza dettagli: Weighted Avg summary)' }
    : profile.hrLthr
    ? { icon: '❤️', label: 'hrTSS dai dettagli corsa', detail: '(senza dettagli: FC media)' }
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
  };
}

// L'avanzamento del download in sottofondo dei dettagli corsa, per Profilo e dati.
export const detailsLine = (p: DetailsProgress): string =>
  (p.done >= p.total ? 'Dettagli completi' : `${p.done} su ${p.total}`);

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

// L'ultima uscita in bici: la più recente per data, perché la lista di Strava non garantisce
// l'ordine. Senza uscite in bici il messaggio dice se mancano solo fra quelle caricate.
export function lastRide(activities: Activity[]) {
  const rides = activities.filter(a => a.type?.includes('Ride'));
  if (!rides.length) {
    const empty = activities.length ? `Nessuna uscita in bici tra le tue ${activities.length} attività` : 'Nessuna uscita ancora';
    return { ride: null, empty };
  }
  const a = rides.reduce((last, r) => (r.start_date > last.start_date ? r : last));
  return {
    ride: {
      id: a.id, name: displayName(a.name, a.id), date: fmtDate(a.start_date_local),
      distance: fmtKm(a.distance), time: fmtTime(a.moving_time),
    },
    empty: null,
  };
}

// Le tre caselle in cima a Home: km, ore e carico da lunedì a oggi, e quanto cambiano dagli
// stessi giorni della settimana prima (da lunedì allo stesso giorno). Il carico è quello di
// ogni attività in tutta l'app. La differenza ha sempre il segno, mai una percentuale: una
// settimana prima vuota non è un caso a parte.
export function weekTiles(activities: Activity[], hr: Pick<HrProfile, 'hrMax' | 'hrLthr' | 'ftp'>, now: Date) {
  const today = isoDay(now);
  const monday = mondayIso(today);
  const back = (iso: string) => dayOffsetIso(-7, new Date(`${iso}T00:00:00`));
  const within = (from: string, to: string) => activities.filter(a => {
    const day = isoDay(a.start_date_local);
    return day >= from && day <= to;
  });
  const totals = (acts: Activity[]) => ({
    km: acts.reduce((s, a) => s + (a.distance || 0), 0) / 1000,
    seconds: acts.reduce((s, a) => s + (a.moving_time || 0), 0),
    load: Math.round(acts.reduce((s, a) => s + activityLoad(a, hr.hrMax, hr.hrLthr, hr.ftp), 0)),
  });
  const cur = totals(within(monday, today));
  const prev = totals(within(back(monday), back(today)));
  // Il segno viene dalla differenza già arrotondata come si mostra: mai "−0.0 km".
  const sign = (n: number) => (n < 0 ? '−' : '+');
  const km = Math.round((cur.km - prev.km) * 10) / 10;
  const minutes = Math.round((cur.seconds - prev.seconds) / 60);
  const load = cur.load - prev.load;
  return [
    { label: 'Km', value: `${cur.km.toFixed(1)} km`, change: `${sign(km)}${Math.abs(km).toFixed(1)} km` },
    { label: 'Ore', value: fmtTime(cur.seconds), change: `${sign(minutes)}${fmtTime(Math.abs(minutes) * 60)}` },
    { label: 'Carico', value: String(cur.load), change: `${sign(load)}${Math.abs(load)}` },
  ];
}
