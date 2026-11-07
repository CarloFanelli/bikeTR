// Le righe della lista Attività e del dettaglio di un'attività, con i testi e gli
// arrotondamenti dell'app di oggi. I nomi da Strava restano come sono scritti.

import { fmtDate, fmtKm, fmtTime, TYPE_EMOJI } from './format.ts';
import type { Activity, ActivityDetail, SegmentEffort, Split } from './strava-types.ts';

// Un nome vuoto mostra il numero, come i link alle attività di oggi.
export const displayName = (name: string | undefined, id: number): string => name || '#' + id;

const kmh = (metersPerSecond: number): string => (metersPerSecond * 3.6).toFixed(1);
const bpm = (hr: number | undefined): string => hr ? ` · ${Math.round(hr)} bpm` : '';

export function activityRow(a: Activity) {
  return {
    title: `${TYPE_EMOJI[a.type] || '•'} ${displayName(a.name, a.id)}`,
    meta: `${fmtDate(a.start_date_local)} · ${a.type}${a.average_heartrate ? ' · FC ' + Math.round(a.average_heartrate) : ''}`,
    distance: fmtKm(a.distance),
    sub: `${fmtTime(a.moving_time)} · ↑${Math.round(a.total_elevation_gain)}m`,
  };
}

// I numeri in testa al dettaglio: [nome, valore].
export function detailMetrics(a: ActivityDetail): [string, string][] {
  const rows: [string, string][] = [
    ['Distanza', fmtKm(a.distance)],
    ['Tempo mov.', fmtTime(a.moving_time)],
    ['Tempo tot.', fmtTime(a.elapsed_time)],
    ['Dislivello', `↑${Math.round(a.total_elevation_gain)} m`],
    ['Vel. media', kmh(a.average_speed || 0) + ' km/h'],
    ['Vel. max', kmh(a.max_speed || 0) + ' km/h'],
  ];
  if (a.has_heartrate) {
    rows.push(['FC media', Math.round(a.average_heartrate || 0) + ' bpm']);
    rows.push(['FC max', Math.round(a.max_heartrate || 0) + ' bpm']);
  }
  if (a.average_watts) rows.push(['Potenza media', Math.round(a.average_watts) + ' W']);
  if (a.kilojoules) rows.push(['Energia', Math.round(a.kilojoules) + ' kJ']);
  if (a.suffer_score) rows.push(['Suffer Score', String(a.suffer_score)]);
  return rows;
}

// Un km per riga; `pct` è la lunghezza della barra, 100 per il km più lento.
export function splitRows(splits: Split[]) {
  const slowest = Math.max(...splits.map(s => s.moving_time));
  return splits.map((s, i) => ({
    km: `km ${i + 1}`,
    pct: (s.moving_time / slowest) * 100,
    value: `${fmtTime(s.moving_time)} · ${s.average_speed ? kmh(s.average_speed) : '—'} km/h${bpm(s.average_heartrate)}`,
  }));
}

// I segmenti dal più lungo; `kom` e `pr` sono la posizione in classifica, se c'è.
export function segmentRows(efforts: SegmentEffort[]) {
  return [...efforts].sort((x, y) => y.distance - x.distance).map(s => ({
    id: s.id,
    name: displayName(s.name, s.segment?.id ?? s.id),
    kom: s.kom_rank || null,
    pr: s.pr_rank || null,
    meta: `${(s.distance / 1000).toFixed(2)} km${bpm(s.average_heartrate)}${s.average_watts ? ` · ${Math.round(s.average_watts)} W` : ''}`,
    time: fmtTime(s.moving_time || s.elapsed_time),
  }));
}
