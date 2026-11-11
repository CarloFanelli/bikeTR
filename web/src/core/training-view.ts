// Quello che mostra Allenamento: consiglio del giorno, calendario dei 28 giorni, grafico
// del carico e piano del mese, con i loro testi e arrotondamenti.

import { dayOffsetIso } from './dates.ts';
import { dayMonth } from './format.ts';
import type { compositeFatigueScore } from './form.ts';
import type { HrProfile } from './hr.ts';
import { getWeekRoleInBlock, MESO_BLOCKS, type Mesocycle, type WeekRole } from './meso.ts';
import { currentMondayOffset, offsetLabel } from './plan/dates.ts';
import { type Advice, type PlanInputs, type PlanProfile, planHr } from './plan/inputs.ts';
import type { LoadChartDay } from './plan/load-chart.ts';
import type { buildTrainingModel } from './plan/model.ts';
import type { WeekPlan } from './plan/month.ts';
import { computeMetrics, recommend } from './plan/recommend.ts';
import type { Settings } from './settings.ts';
import type { Activity } from './strava-types.ts';

// ---- Consiglio del giorno ----

type DayMetrics = ReturnType<typeof computeMetrics>;

export interface DayAdvice {
  // null per oggi; "Domani" per domani.
  label: string | null;
  rec: Advice;
  metrics: DayMetrics;
}

// Il consiglio di oggi e quello di domani, sempre: un giorno segnato "salto" ha il riposo pianificato.
export function dailyAdvice(
  activities: Activity[], settings: Settings, rests: string[], profile: PlanProfile | null, inputs: PlanInputs,
): { today: DayAdvice; tomorrow: DayAdvice } {
  const { now } = inputs;
  const hr = planHr(settings, activities, inputs);
  const day = (offset: number, label: string | null): DayAdvice => ({
    label,
    rec: recommend(activities, settings, rests, offset, profile, inputs),
    metrics: computeMetrics(activities, hr, offset, now),
  });
  return { today: day(0, null), tomorrow: day(1, offsetLabel(1, now)) };
}

type Fatigue = Pick<ReturnType<typeof compositeFatigueScore>, 'composite' | 'muscularFatigue'>;

// I numeri sotto il consiglio: [nome, valore]. "Prontezza" è il primo, senza il suo stato
// ("pronto", "moderato"…), che la schermata mostra come etichetta colorata.
export function adviceRows(metrics: DayMetrics, fatigue: Fatigue | null, meso: Mesocycle | null): [string, string][] {
  const { restDays } = metrics;
  const freshness = restDays >= 3 ? '🟢 alta' : restDays === 2 ? '🟢 buona' : restDays === 1 ? '🟡 media' : '🔴 bassa';
  const rows: [string, string][] = [];
  if (fatigue) rows.push(['Prontezza', `${fatigue.composite}/100`]);
  rows.push(
    ['Freschezza', freshness],
    ['Gg riposo', String(restDays)],
    ['Carico 7gg', metrics.acute.toFixed(0)],
    ['Media sett.', metrics.chronic.toFixed(0)],
    ['Rapporto', metrics.ratio != null ? metrics.ratio.toFixed(2) : '—'],
    ['Ore 7gg', `${metrics.hoursThisWeek.toFixed(1)}h`],
    ['Dure 7gg', String(metrics.hardsLast7)],
  );
  if (fatigue && fatigue.muscularFatigue > 20) rows.push(['Fatica musc.', `${fatigue.muscularFatigue}/100`]);
  const block = meso ? MESO_BLOCKS.find(b => b.id === meso.blockId) : null;
  if (meso && block) rows.push(['Blocco', `${block.label.split(' ')[0]} ${meso.weekInBlock + 1}/${block.weeks}`]);
  return rows;
}

// ---- Calendario dei prossimi 28 giorni ----

type DayState = 'normal' | 'skip' | 'rain';

const DAY_ICONS: Record<DayState, string> = { normal: '🚴', skip: '⏸️', rain: '🌧️' };

// Quattro settimane da lunedì: la corrente e le tre successive.
export function restCalendar(skip: string[], rain: string[], now: Date) {
  const skipSet = new Set(skip);
  const rainSet = new Set(rain);
  const monday = currentMondayOffset(now);
  return [0, 1, 2, 3].map(w => ({
    label: w === 0 ? 'Settimana corrente' : `Settimana +${w}`,
    days: Array.from({ length: 7 }, (_, i) => {
      const offset = monday + w * 7 + i;
      const iso = dayOffsetIso(offset, now);
      const state: DayState = skipSet.has(iso) ? 'skip' : rainSet.has(iso) ? 'rain' : 'normal';
      return {
        iso,
        label: offset === 0 ? 'Oggi' : offset === 1 ? 'Domani'
          : new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' }),
        state,
        icon: DAY_ICONS[state],
        today: offset === 0,
        past: offset < 0,
      };
    }),
  }));
}

// ---- Grafico del carico degli ultimi 30 giorni ----

// `color` è il nome di un colore del tema: cambia fra chiaro e scuro. `pattern` distingue
// dure e lunghe anche senza colori (daltonismo, stampa).
export type LoadPattern = 'stripes' | 'dots' | null;
export const LOAD_KINDS: { tag: string; color: string; pattern: LoadPattern }[] = [
  { tag: 'bici easy', color: 'load-easy', pattern: null },
  { tag: 'bici dura', color: 'load-hard', pattern: 'stripes' },
  { tag: 'lunga', color: 'load-long', pattern: 'dots' },
  { tag: 'cross-training', color: 'load-cross', pattern: null },
  { tag: 'riposo', color: 'load-rest', pattern: null },
];

const kindOf = (b: LoadChartDay) => LOAD_KINDS[b.long ? 2 : b.hard ? 1 : b.bike ? 0 : b.nonBike ? 3 : 4];

export function loadChartView(days: LoadChartDay[]) {
  return {
    labels: days.map(d => d.iso),
    loads: days.map(d => d.load),
    colors: days.map(d => kindOf(d).color),
    tags: days.map(d => kindOf(d).tag),
    patterns: days.map(d => kindOf(d).pattern),
    average: days.reduce((s, d) => s + d.load, 0) / days.length,
  };
}

// La frase sotto il grafico: la media giornaliera e il giorno più carico, senza emoji.
export function loadSummary(view: ReturnType<typeof loadChartView>): string {
  const n = view.labels.length;
  const max = Math.max(0, ...view.loads);
  if (!max) return `Nessun carico negli ultimi ${n} giorni.`;
  const day = dayMonth(view.labels[view.loads.indexOf(max)]);
  return `Media di ${Math.round(view.average)} al giorno negli ultimi ${n} giorni; il giorno più carico è il ${day}, con ${Math.round(max)}.`;
}

// ---- Piano del mese ----

// Da dove viene il carico di ogni uscita, e quali FTP e LTHR usa il piano.
export function loadSourceLine(p: HrProfile): string {
  const ftpSource = p.ftpDecl ? `FTP dichiarata ${p.ftpDecl}W`
    : p.ftpSource === 'estimated' && p.ftpEst ? `FTP stimata ${p.ftpEst}W (TSS)`
    : 'FTP non usata';
  const lthr = p.lthrSource === 'estimated' && p.lthrEst ? `LTHR stimata ${p.lthrEst} bpm`
    : p.hrLthr ? `LTHR dichiarata ${p.hrLthr} bpm` : '—';
  const mode = p.ftp ? '🔋 Load = TSS (potenza)' : p.hrLthr ? '❤️ Load = hrTSS (LTHR)' : '⚠️ Load = proxy HR max';
  return `${mode} · ${ftpSource} · ${lthr}`;
}

const DOW = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

// Il modello di allenamento delle ultime 6 settimane: [nome, valore].
export function modelRows(model: ReturnType<typeof buildTrainingModel>): [string, string][] {
  const trend = model.progressionPerWeek > 5 ? `📈 +${model.progressionPerWeek.toFixed(0)}/sett (crescita)`
    : model.progressionPerWeek < -5 ? `📉 ${model.progressionPerWeek.toFixed(0)}/sett (calo)`
    : '➡️ stabile';
  const pol = model.polarization;
  const polStatus = !pol ? '' : pol.easyPct >= 0.75 ? '✅' : pol.easyPct >= 0.6 ? '🟡' : '🔴';
  const polText = pol ? `${Math.round(pol.easyPct * 100)}% easy / ${Math.round(pol.hardPct * 100)}% hard` : '—';
  return [
    ['Giorni di allenamento abituali',
      model.preferredDays.length ? model.preferredDays.map(d => DOW[d]).join(', ') : 'nessun pattern regolare rilevato'],
    ['Giorni di qualità storici',
      model.hardDowHistorical.length ? model.hardDowHistorical.slice(0, 3).map(d => DOW[d]).join(', ') : '—'],
    ['Carico medio settimanale', model.avgWeeklyLoad.toFixed(0)],
    ['Progressione', trend],
    ['Polarizzazione attuale', `${polStatus} ${polText}`.trim()],
    ['Target carico prox sett.', model.targetWeeklyLoad.toFixed(0)],
  ];
}

interface MesoBanner {
  icon: string;
  title: string;
  // Il ruolo della settimana, mostrato come etichetta colorata.
  role: { role: string; label: string } | null;
  lines: string[];
}

type RoleLike = Pick<WeekRole, 'role' | 'label' | 'blockPattern' | 'loadMul' | 'daysToRace'> & Partial<WeekRole>;

// Il banner sopra il piano: il taper nelle 3 settimane prima della gara, altrimenti il mesociclo.
export function mesoBanner(meso: Pick<Mesocycle, 'blockId' | 'weekInBlock'> | null, weekRole: RoleLike | null): MesoBanner | null {
  if (weekRole && weekRole.blockPattern === 'taper') {
    return {
      icon: '🏁', title: `Fase Taper — ${weekRole.daysToRace} giorni alla gara`,
      role: { role: weekRole.role, label: weekRole.label },
      lines: [`Volume scalato (×${weekRole.loadMul.toFixed(2)}), intensità mantenuta. Niente nuovi stimoli, mantieni le sensazioni.`],
    };
  }
  const block = meso ? MESO_BLOCKS.find(b => b.id === meso.blockId) : null;
  if (!meso || !block) return null;
  const role = weekRole || getWeekRoleInBlock(meso, 0);
  const next = getWeekRoleInBlock(meso, 1);
  const week = (role?.weekInBlock ?? 0) + 1;
  const total = role?.totalWeeks ?? block.weeks;
  return {
    icon: '📋', title: `Mesociclo: ${block.label} · settimana ${week}/${total}`,
    role: role ? { role: role.role, label: role.label } : null,
    lines: [block.description, ...(next ? [`Prossima settimana: ${next.label} (loadMul ${next.loadMul.toFixed(2)}×).`] : [])],
  };
}

const ROLE_EMOJI: Record<string, string> = {
  build1: '🔵', build2: '🟡', peak: '🟠', deload: '🟢', block_load: '🔴', block_lit1: '🟦', block_lit2: '🟦',
  taper1: '🏁', taper2: '🏁', taper3: '🏁', race_week: '🏆',
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

// Una settimana del piano: titolo con le date, ruolo nel blocco, diagnostica del piano.
export function weekBlock(wp: WeekPlan, index: number, raceName: string | undefined) {
  const r = wp.weekRole;
  const banner = r ? {
    role: r.role as string | null,
    emoji: ROLE_EMOJI[r.role] || '🔵',
    label: r.label,
    detail: r.blockPattern === 'taper'
      ? `· ${r.daysToRace} giorni alla gara${raceName ? ` (${raceName})` : ''} · volume ×${r.loadMul.toFixed(2)}`
      : `· sett. ${r.weekInBlock + 1}/${r.totalWeeks} del blocco · volume ×${r.loadMul.toFixed(2)}`,
  } : wp.isRecoveryWeek ? { role: null, emoji: '🔄', label: '', detail: 'Settimana di scarico (retroattivo)' } : null;

  const dbg = wp.debug;
  const counts = Object.entries(dbg.categoryCount).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(' · ');
  const diag = [
    `🎯 HARD target: ${dbg.targetHards}/${dbg.baseHards} · livello: ${dbg.lvl} · TSB: ${dbg.tsb ?? '—'} · ratio: ${dbg.ratio}`
      + `${dbg.polHardPct ? ' · pol hard: ' + dbg.polHardPct : ''}${dbg.reductionReason ? ` · riduzione: ${dbg.reductionReason}` : ''}`,
    ...(dbg.dynReconciliation ? [`🔄 Riconciliazione settimana: ${dbg.dynReconciliation}`] : []),
    `Composizione: ${counts}`,
  ];
  return {
    title: `Settimana ${index + 1} (${shortDate(wp.days[0].iso)} → ${shortDate(wp.days[6].iso)})`,
    banner, diag,
  };
}

// Un giorno per riga: l'icona è il primo pezzo del titolo ("🔴 Soglia" → "🔴", "Soglia").
// Un giorno passato con un'attività porta al suo dettaglio.
// Il tipo di un giorno del piano, con i colori del grafico del carico: dura, lunga, facile,
// forza o mobilità, riposo. Un giorno fatto prende il tipo dell'uscita, scritto all'inizio del dettaglio.
const PLAN_KIND: Record<string, number> = {
  EASY: 0, RECOVERY: 0, HARD: 1, LONG: 2, STRENGTH: 3, MOBILITY: 3,
};
const DONE_KIND: Record<string, number> = { '🟢': 0, '🔴': 1, '🟠': 2, '💪': 3 };
function planKind(category: string | null, detail: string) {
  const i = category === 'DONE' ? DONE_KIND[detail.split(' ')[0]] : PLAN_KIND[category ?? ''];
  return LOAD_KINDS[i ?? 4];
}

export function planRows(days: Pick<WeekPlan['days'][number], 'label' | 'rec' | 'isPast' | 'offset' | 'category'>[]) {
  return days.map(d => {
    const icon = d.rec.title.match(/^(\S+)\s/)?.[1] || '•';
    return {
      label: d.label,
      icon,
      title: d.rec.title.replace(/^\S+\s/, ''),
      detail: d.rec.detail,
      past: d.isPast,
      today: d.offset === 0,
      activityId: d.rec._isDone ? d.rec._activityId ?? null : null,
      kind: planKind(d.category, d.rec.detail),
    };
  });
}
