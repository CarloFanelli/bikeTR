// Le righe della lista Attività e del dettaglio di un'attività, con i loro testi e
// arrotondamenti. I nomi da Strava restano come sono scritti.

import { mondayIso } from './dates.ts';
import { emojiIcon, type IconName } from './emoji.ts';
import { fmtClock, fmtDate, fmtKm, fmtTime, isoDay, kmh, TYPE_EMOJI } from './format.ts';
import type { Activity, ActivityDetail, SegmentEffort, Split } from './strava-types.ts';

// Un nome vuoto mostra il numero dell'attività.
export const displayName = (name: string | undefined, id: number): string => name || '#' + id;

// La ricerca di Attività: una parte del nome mostrato, senza badare a maiuscole e accenti
// ("giro" trova "GIRÒ"). Vuota o fatta di spazi tiene tutto.
const plain = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function nameMatches(name: string | undefined, id: number, query: string): boolean {
  const q = plain(query.trim());
  return !q || plain(displayName(name, id)).includes(q);
}

const bpm = (hr: number | undefined): string => hr ? ` · ${Math.round(hr)} bpm` : '';

// L'icona dello sport; uno sport senza icona (yoga, kitesurf…) ha quella generica.
export const sportIcon = (type: string): IconName => emojiIcon(TYPE_EMOJI[type] ?? '') ?? 'activity';

// Una riga della tabella o una card di Attività. Senza distanza (forza, yoga) o dislivello un
// trattino; `route` è il percorso come lo dà Strava, null senza GPS (rulli, palestra).
export function activityRow(a: Activity) {
  const climb = Math.round(a.total_elevation_gain || 0);
  return {
    id: a.id,
    icon: sportIcon(a.type),
    name: displayName(a.name, a.id),
    date: fmtDate(a.start_date_local),
    distance: a.distance ? fmtKm(a.distance) : '—',
    time: fmtTime(a.moving_time),
    climb: climb ? `↑${climb} m` : '—',
    route: a.map?.summary_polyline || null,
  };
}

// Il gruppo del filtro di Attività: ogni variante di bici (rulli, gravel, MTB, e-bike) è
// Bici, ogni corsa è Corsa, il resto (camminate, nuoto, forza…) è Altro.
export type SportGroup = 'bike' | 'run' | 'other';
export const sportGroup = (type: string): SportGroup =>
  type.includes('Ride') ? 'bike' : type.includes('Run') ? 'run' : 'other';

const shortDay = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

// Le attività per settimana, da lunedì a domenica, nell'ordine in cui arrivano (dalla più
// recente). Ogni settimana ha le date, fino a oggi per quella in corso, e i totali delle sue
// attività. Il giorno è quello locale, come nel resto dell'app (vedi `isoDay`).
export function weekGroups(activities: Activity[], now: Date) {
  const weeks = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = mondayIso(isoDay(a.start_date_local));
    weeks.set(key, [...(weeks.get(key) ?? []), a]);
  }
  return [...weeks].map(([key, acts]) => {
    const monday = new Date(`${key}T00:00:00`);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const end = sunday < now ? sunday : now;
    const days = isoDay(end) === key ? shortDay(monday) : `${shortDay(monday)} – ${shortDay(end)}`;
    const sum = (f: (a: Activity) => number) => acts.reduce((s, a) => s + (f(a) || 0), 0);
    const climb = Math.round(sum(a => a.total_elevation_gain));
    return {
      key,
      label: days,
      distance: fmtKm(sum(a => a.distance)),
      time: fmtTime(sum(a => a.moving_time)),
      climb: climb ? `↑${climb} m` : '—',
      activities: acts,
    };
  });
}

// Le prime settimane che contengono almeno `count` attività: Attività ne mostra 60 alla volta,
// sempre a settimane intere, così i totali di ogni settimana mostrata sono completi.
export function firstWeeks<W extends { activities: unknown[] }>(weeks: W[], count: number): W[] {
  const shown: W[] = [];
  let total = 0;
  for (const w of weeks) {
    if (total >= count) break;
    shown.push(w);
    total += w.activities.length;
  }
  return shown;
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
    value: `${fmtClock(s.moving_time)} · ${s.average_speed ? kmh(s.average_speed) : '—'} km/h${bpm(s.average_heartrate)}`,
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
    time: fmtClock(s.moving_time || s.elapsed_time),
  }));
}
