// Testi e numeri delle card di Analisi, già arrotondati: le
// schermate li mostrano e basta. Tutto arriva come parametro.

import { displayName } from './activity-view.ts';
import { dayOffsetIso } from './dates.ts';
import type { FormTrend } from './form.ts';
import { dayMonth, fmtDate } from './format.ts';
import type { buildFtpBreakdown, buildLthrBreakdown, FtpTrend } from './ftp.ts';
import type { buildHrZones, HrProfile } from './hr.ts';
import type { buildPowerCurve, buildPowerProfile } from './power.ts';
import type { SegmentEstimates } from './segments.ts';
import type { Activity } from './strava-types.ts';

type Row = [label: string, value: string];
type PowerCurve = NonNullable<ReturnType<typeof buildPowerCurve>>;
type PowerProfile = NonNullable<ReturnType<typeof buildPowerProfile>>;

const wkg = (watts: number, weight: number | null | undefined) => (watts && weight) ? ` · ${(watts / weight).toFixed(2)} W/kg` : '';
const minutes = (sec: number | undefined) => Math.round((sec || 0) / 60);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

// Le frasi sotto i grafici dicono a parole quello che il grafico mostra (anche a chi usa un
// lettore di schermo): al massimo 25 parole, senza emoji.

// Forma, fitness e fatica di oggi, e quanto è cambiata la fitness nelle ultime 4 settimane.
export function formSummary(form: FormTrend): string {
  const last = form.DAYS - 1;
  if (form.ctl.every(v => !v) && form.atl.every(v => !v)) {
    return `Nessun carico negli ultimi ${form.DAYS} giorni: fitness e fatica sono a zero.`;
  }
  const change = Math.round(form.ctl[last] - form.ctl[Math.max(0, last - 28)]);
  const trend = change > 0 ? `è salita di ${change}` : change < 0 ? `è scesa di ${-change}` : 'è rimasta uguale';
  return `Forma oggi ${signed(Math.round(form.tsb[last]))}: fitness ${form.ctl[last].toFixed(0)}, `
    + `fatica ${form.atl[last].toFixed(0)}. In 4 settimane la fitness ${trend}.`;
}

// L'ultima FTP, la differenza dal primo punto salvato e il picco storico.
export function ftpTrendSummary(trend: FtpTrend): string {
  const first = trend.history[0];
  const last = trend.history[trend.history.length - 1];
  return `FTP ${last.ftp} W, ${signed(last.ftp - first.ftp)} W dal ${dayMonth(first.date)}; picco storico ${trend.peakFtp} W.`;
}

// La FTP usata in tutta l'app, con da dove viene; null senza FTP né dichiarata né stimata.
export function ftpCard(profile: HrProfile, weight: number | null | undefined) {
  const effective = profile.ftpDecl || profile.ftpEst;
  if (!effective) return null;
  const sources: { text: string; strong: boolean }[] = [];
  if (profile.ftpDecl) sources.push({ text: `dichiarata: ${profile.ftpDecl}W`, strong: true });
  if (profile.ftpEstFromActivities) sources.push({ text: `da attività: ${profile.ftpEstFromActivities}W`, strong: false });
  if (profile.ftpEstFromSegments) sources.push({ text: `da segmenti: ${profile.ftpEstFromSegments}W`, strong: false });
  const active = profile.ftpDecl ? 'dichiarata'
    : (profile.ftpEstFromSegments ?? 0) >= (profile.ftpEstFromActivities ?? 0) ? 'segmenti' : 'attività';
  return { value: `${effective} W${wkg(effective, weight)}`, active, sources };
}

// Le durate segnate sull'asse logaritmico della curva di potenza, in secondi.
export const POWER_CURVE_TICKS = [
  { value: 5 * 60, label: '5 min' }, { value: 15 * 60, label: '15 min' }, { value: 30 * 60, label: '30 min' },
  { value: 60 * 60, label: '1 h' }, { value: 120 * 60, label: '2 h' },
];

// Una riga per fascia di durata (il valore porta all'uscita) e i punti del grafico: ogni
// miglior uscita alla sua durata, per l'asse logaritmico.
export function powerCurveView(data: PowerCurve, weight: number | null | undefined) {
  const rows = data.buckets.map(b => ({
    label: b.label, value: b.best ? `${Math.round(b.best.watts)} W` : null, activityId: b.best?.act.id ?? null,
  }));
  const points = data.buckets.flatMap(b => b.best ? [{
    x: b.best.act.moving_time || 1, y: Math.round(b.best.watts),
    title: b.label,
    text: `${Math.round(b.best.watts)} W${wkg(b.best.watts, weight)}`,
    activity: `${displayName(b.best.act.name, b.best.act.id)} · ${fmtDate(b.best.act.start_date_local)} · ${minutes(b.best.act.moving_time)} min`,
  }] : []);
  return { rows, points };
}

// Dalla potenza della durata più breve a quella della più lunga.
export function powerCurveSummary(view: ReturnType<typeof powerCurveView>): string {
  const [first] = view.points;
  const last = view.points[view.points.length - 1];
  if (!first) return 'Nessuna uscita con potenza tra le ultime 60 attività.';
  if (first === last) return `Migliore potenza ${first.y} W su ${first.title}.`;
  return `Migliore potenza da ${first.y} W su ${first.title} a ${last.y} W su ${last.title}.`;
}

// Il trend di forma degli ultimi 90 giorni: un giorno per punto, e i valori di oggi.
export function formView(form: FormTrend, now: Date) {
  const last = form.DAYS - 1;
  const cur = { ctl: form.ctl[last], atl: form.atl[last], tsb: form.tsb[last] };
  const status = cur.tsb > 5 ? '🟢 fresco' : cur.tsb > -10 ? '🟡 neutro' : cur.tsb > -20 ? '🟠 affaticato' : '🔴 sovraccarico';
  const rows: Row[] = [
    ['Fitness (CTL)', cur.ctl.toFixed(0)], ['Fatica (ATL)', cur.atl.toFixed(0)],
    ['Forma (TSB)', cur.tsb.toFixed(0)], ['Stato', status],
  ];
  const labels = form.ctl.map((_, i) => dayOffsetIso(i - last, now));
  return { labels, rows };
}

// Minuti e percentuale per zona, e il giudizio sulla polarizzazione; un messaggio
// senza soglia o senza uscite con FC.
export function hrZonesView(data: ReturnType<typeof buildHrZones>) {
  if (!data) return { message: 'Imposta LTHR nelle impostazioni per vedere la distribuzione zone.' } as const;
  if (!data.total) return { message: 'Nessuna attività con FC nelle ultime 4 settimane.' } as const;
  const { zones, total } = data;
  const rows = zones.map(z => {
    const pct = (z.minutes / total) * 100;
    return { label: z.label, color: z.color, minutes: z.minutes, text: `${Math.round(z.minutes)} min · ${pct.toFixed(0)}%` };
  });
  const easyPct = Math.round((zones[0].minutes + zones[1].minutes) / total * 100);
  const hardPct = Math.round((zones[2].minutes + zones[3].minutes + zones[4].minutes) / total * 100);
  const note = easyPct >= 75
    ? `✅ Distribuzione polarizzata (${easyPct}% easy / ${hardPct}% hard). Buono per FTP.`
    : easyPct >= 60
      ? `🟡 Distribuzione mista (${easyPct}/${hardPct}). Considera più Z2.`
      : `🔴 Troppa intensità (${easyPct}/${hardPct}). Rischio stallo: aumenta il volume easy.`;
  const summary = `Nelle ultime 4 settimane il ${easyPct}% del tempo è facile (Z1-Z2) e il ${hardPct}% duro (Z3-Z5).`;
  return { message: null, rows, note, summary };
}

const PROFILE_LABELS: Record<string, string> = {
  sprint_anaerobic: 'Sprint/Anaerobico',
  vo2max: 'VO2max (5-15 min)',
  sub_threshold: 'Sub-soglia (15-30 min)',
  threshold: 'Soglia (30-60 min)',
  endurance: 'Endurance (1-2h)',
  long_endurance: 'Long (>2h)',
};
const RATIO_LABELS: Record<string, string> = {
  vo2_to_threshold: 'VO2max / Soglia',
  threshold_to_endurance: 'Soglia / Endurance',
  sprint_to_vo2: 'Sprint / VO2max',
};
const FOCUS_LABELS: Record<string, string> = {
  vo2max: 'VO2max (intervalli Seiler 4×8, 4×4, Rønnestad 30/15)',
  threshold: 'Soglia/FTP (Sweet Spot, Over-Unders, ripetute specifiche)',
  neuromuscular: 'Sprint/Forza (partenze, sprint, forza neuromuscolare)',
  endurance: 'Base aerobica (volume Z2 e uscite lunghe)',
};

// Barre per durata (verde forte, giallo nella media, arancio deficit), rapporti, deficit
// con la loro cura, punti di forza e focus consigliato.
export function powerProfileView(pp: PowerProfile) {
  const profile = pp.profile as Record<string, { watts: number; wkg: number; pctOfRef: number } | undefined>;
  const maxPct = Math.max(...Object.values(profile).map(p => p?.pctOfRef ?? 0), 0.5);
  const bars = Object.entries(PROFILE_LABELS).map(([key, label]) => {
    const p = profile[key];
    if (!p) return { label, width: 0, kind: null, value: null };
    const kind = p.pctOfRef >= 0.85 ? 'strength' : p.pctOfRef >= 0.65 ? 'average' : 'deficit';
    return { label, width: Math.round((p.pctOfRef / maxPct) * 100), kind, value: { watts: `${p.watts}W`, wkg: ` · ${p.wkg} W/kg` } };
  });
  const ratios: Row[] = Object.entries(pp.ratios).map(([key, value]) => [RATIO_LABELS[key] || key, String(value)]);
  return {
    bars, ratios, deficits: pp.deficits, strengths: pp.strengths.map(s => s.label),
    focus: pp.recommendedFocus ? FOCUS_LABELS[pp.recommendedFocus] || pp.recommendedFocus : null,
  };
}

// I numeri sotto il grafico della FTP nel tempo.
export function ftpTrendRows(trend: FtpTrend): Row[] {
  const icon = trend.recentSlope > 1 ? '📈' : trend.recentSlope < -1 ? '📉' : '➡️';
  return [
    ['FTP attuale', `${trend.currentFtp}W`],
    ['Picco storico', `${trend.peakFtp}W`],
    ['% del picco', `${trend.pctFromPeak}%`],
    ['Delta 4 sett.', trend.delta4w >= 0 ? `+${trend.delta4w}W` : `${trend.delta4w}W`],
    ['Trend', `${icon} ${trend.recentSlope > 0 ? '+' : ''}${trend.recentSlope} W/sett`],
    ['Punti dati', String(trend.history.length)],
  ];
}

const activityRef = (a: Activity) => ({ id: a.id, name: displayName(a.name, a.id) });
const shortDate = (a: Activity) => fmtDate(a.start_date_local, { year: '2-digit' });

// FTP e LTHR usate in tutta l'app, con le tabelle dei metodi che le stimano.
export function ftpLthrView(
  ftp: ReturnType<typeof buildFtpBreakdown>, lthr: ReturnType<typeof buildLthrBreakdown>,
  segEst: Partial<SegmentEstimates>, profile: HrProfile,
) {
  const ftpTable = ftp && (profile.ftpEst || profile.ftpEstFromSegments) ? {
    open: !profile.ftpDecl,
    summary: `Dettaglio stima da attività (${profile.ftpEstFromActivities || '—'} W) e segmenti (${profile.ftpEstFromSegments || '—'} W)`,
    rows: ftp.rows.map(r => r.empty ? { bucket: r.bucket, empty: true as const } : {
      bucket: r.bucket, empty: false as const, winner: r === ftp.winning, activity: activityRef(r.act),
      sub: `${shortDate(r.act)} · ${minutes(r.act.moving_time)} min`, watts: String(r.rawWatts),
      decay: r.decayValue.toFixed(2), factor: `× ${r.factor.toFixed(2)}`, candidate: String(r.ftpCandidate),
    }),
    fromSegments: segEst.ftpFromSegments || null,
  } : null;

  // Senza un'uscita adatta a M2 la sua riga lo dice; quella dei segmenti c'è solo con la stima.
  const lthrRows = lthr ? [
    {
      method: 'M1', winner: lthr.m1Row.value === lthr.final, activity: activityRef(lthr.m1Row.act),
      sub: `HRmax osservato ${lthr.m1Row.observedHRmax} bpm · ${shortDate(lthr.m1Row.act)}`,
      calc: 'HRmax × 0.91 (midpoint Friel/Coggan 88–92%)', value: lthr.m1Row.value,
    },
    lthr.m2Row ? {
      method: 'M2', winner: lthr.m2Row.value === lthr.final, activity: activityRef(lthr.m2Row.act),
      sub: `avg HR ${lthr.m2Row.rawHr} bpm · ${shortDate(lthr.m2Row.act)} · ${minutes(lthr.m2Row.act.moving_time)} min`,
      calc: 'best avg HR (test-like 20-60min) × 0.98', value: lthr.m2Row.value,
    } : { method: 'M2', empty: '— nessuna attività test-like 20-60 min con HR vicino al max —' },
    ...(segEst.lthrFromSegments ? [{
      method: 'Segmenti', winner: segEst.lthrFromSegments === lthr.final, activity: null,
      sub: 'best avg HR su segmenti 15-45 min', calc: '× 0.98', value: segEst.lthrFromSegments,
    }] : []),
  ] : null;

  return {
    ftp: {
      value: `${profile.ftp || '—'} W`,
      kind: profile.ftpDecl ? 'dichiarata' : (profile.ftpEst ? 'stimata' : '—'),
      declared: profile.ftpDecl || null,
      table: ftpTable,
      missing: !ftpTable && !profile.ftp,
    },
    lthr: {
      value: `${profile.hrLthr || '—'} bpm`,
      kind: profile.lthrSource === 'declared' ? 'dichiarata' : (profile.lthrEst ? 'stimata' : '—'),
      table: lthrRows ? { open: profile.lthrSource !== 'declared', rows: lthrRows } : null,
    },
  };
}
