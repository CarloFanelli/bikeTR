// Il piano della settimana in Allenamento: quali giorni sono duri, lunghi, facili,
// di recupero o di riposo, con il workout di ciascuno.

import { dayOffsetIso } from '../dates.ts';
import { buildFormTrend } from '../form.ts';
import { fmtTime, isoDay, TYPE_EMOJI } from '../format.ts';
import { isHard, isStrengthActivity } from '../load.ts';
import { MESO_BLOCKS } from '../meso.ts';
import type { WeekRole } from '../meso.ts';
import type { Settings } from '../settings.ts';
import type { Activity } from '../strava-types.ts';
import { v2_workoutForCategory } from '../training-v2.ts';
import { currentMondayOffset, isAvailableDay, isLongRideDay, offsetLabel } from './dates.ts';
import { planHr } from './inputs.ts';
import type { Advice, PlanInputs, PlanProfile } from './inputs.ts';
import { buildTrainingModel } from './model.ts';
import { computeMetrics } from './recommend.ts';

// Forma di un giorno: fitness (CTL), fatica (ATL), freschezza (TSB).
export interface FormCtx {
  ctl: number;
  atl: number;
  tsb: number;
}

// Un giorno del piano mentre lo si costruisce. `category`: DONE e PAST_REST per i giorni
// passati, poi SKIP, REST, LONG, HARD, RECOVERY, EASY, e con la pioggia STRENGTH,
// MOBILITY o REST_RAIN.
interface PlanSlot {
  offset: number;
  iso: string;
  dow: number;
  label: string;
  category: string | null;
  isPast: boolean;
  activity?: Activity;
  hardSeq?: number;
}

// Attività "principale" di un giorno (iso): bici se presente, altrimenti la prima.
// Usata da buildWeekPlan per popolare slot passati con la categoria DONE.
function findPrimaryActivityForDay(activities: Activity[], iso: string): Activity | null {
  const sameDay = activities.filter(a => isoDay(a.start_date_local) === iso);
  if (!sameDay.length) return null;
  const bike = sameDay.find(a => a.type && a.type.includes('Ride'));
  return bike || sameDay[0];
}

// ---- Algoritmo pianificazione settimanale ----
// Principi di massima efficienza:
//  1) La lunga sta su Sat/Sun, non altrove.
//  2) Le sessioni dure sono distanziate ≥48h (Martedì/Giovedì è il layout ideale).
//  3) Giorno dopo HARD o LONG = RECOVERY (mai un altro HARD).
//  4) Giorno prima di LONG = EASY o REST (gambe fresche per la lunga).
//  5) I riposi pianificati dall'utente (SKIP) sono intoccabili.
//  6) Se lo stato di forma è scadente (TSB < -15), sostituisco 1 HARD con EASY.
//  7) Volume totale allineato al weeklyDays dichiarato (inclusa lunga).

function pickHardDays(slotsAll: PlanSlot[], targetHards: number, preferenceOrder: number[]): void {
  // Lavora solo sugli slot futuri/oggi (non tocca i passati)
  const slots = slotsAll.filter(s => !s.isPast);
  const chosen: PlanSlot[] = [];
  // Con 3 HARD/sett: cluster preferito Mar/Mer/Gio (struttura coach italiano).
  // Ogni giorno stimola sistemi diversi (aerobico/forza/potenza), la regola delle 48h
  // si allenta perché solo il giorno POTENZA è realmente stressante al massimo.
  const allowConsec = targetHards >= 3;
  const gap = allowConsec ? 1 : 2;

  // Strategia #1 - se 3 HARD, priorità esplicita: Mar (2), Mer (3), Gio (4)
  const priority = allowConsec ? [2, 3, 4, ...preferenceOrder.filter(d => ![2,3,4].includes(d))] : preferenceOrder;

  for (const dow of priority) {
    if (chosen.length >= targetHards) break;
    const cand = slots.find(s => !s.category && s.dow === dow);
    if (!cand) continue;
    const tooClose = chosen.some(h => Math.abs(h.offset - cand.offset) < gap);
    const adjLongOrSkip = slots.some(x =>
      (x.category === 'LONG' || x.category === 'SKIP')
      && Math.abs(x.offset - cand.offset) <= 1);
    if (!tooClose && !adjLongOrSkip) chosen.push(cand);
  }
  while (chosen.length < targetHards) {
    const cand = slots.find(s => !s.category &&
      !chosen.some(h => Math.abs(h.offset - s.offset) < gap) &&
      !slots.some(x => (x.category === 'LONG' || x.category === 'SKIP')
        && Math.abs(x.offset - s.offset) <= 1));
    if (!cand) break;
    chosen.push(cand);
  }
  // Ordina cronologicamente per rendere chiara la sequenza (Aerobica→Forza→Potenza)
  chosen.sort((a,b) => a.offset - b.offset);
  chosen.forEach((s, i) => { s.category = 'HARD'; s.hardSeq = i; });
}

// Il workout di una categoria del piano, dal catalogo di Training v2 (`v2_workoutForCategory`).
// L'unica categoria propria del piano è PAST_REST: un giorno passato senza attività registrata.
export function workoutForCategory(
  cat: string, settings: Settings | null | undefined, profile: PlanProfile | null | undefined, hardIndex: number,
  formCtx: FormCtx | null, isRecoveryWeek: boolean, totalHardsInWeek: number, inputs: Pick<PlanInputs, 'now' | 'segmentEstimates' | 'meso'>,
): Advice {
  if (cat === 'PAST_REST') return {
    title: '⬜ Riposo (non svolto)',
    detail: 'Nessuna attività registrata quel giorno.',
    reason: 'Giornata passata senza allenamento.',
  };
  // Se il profile non ha hrLthr/ftp risolti, integra qui (v2 si aspetta {hrLthr, ftp})
  const resolved = profile?.hrLthr || profile?.ftp ? profile : { ...(profile || {}), ...planHr(settings, undefined, inputs) };
  return v2_workoutForCategory(cat, settings, resolved, hardIndex, formCtx, isRecoveryWeek, totalHardsInWeek, inputs.meso);
}

// Il piano di 7 giorni da `startOffset` (0 = oggi). `overrideFormCtx` è la forma simulata
// dal piano del mese, `rainyDays` i giorni di pioggia (null = quelli salvati), `weekRole`
// il ruolo della settimana nel mesociclo o nel taper.
export function buildWeekPlan(
  activities: Activity[], settings: Settings | null | undefined, plannedRests: string[] | null | undefined,
  profile: PlanProfile | null | undefined, startOffset: number, overrideFormCtx: FormCtx | null,
  rainyDays: string[] | null, weekRole: WeekRole | null, inputs: PlanInputs,
) {
  const { now } = inputs;
  const hr = planHr(settings, activities, inputs);
  const plannedSet = new Set(plannedRests || []);
  const rainySet = new Set(rainyDays || inputs.rainyDays);
  const { weeklyDays = 4, longRides = 1 } = settings || {};
  const lvl = profile?.level?.key || 'intermediate';
  // Target base intensità: coach italiano suggerisce 3 sessioni fisse/sett
  // (Aerobica Mar + Forza Mer + Potenza Gio) per chi vuole crescere.
  let targetHards: number;
  if (lvl === 'new') targetHards = 1;
  else if (lvl === 'beginner') targetHards = 2; // aerobica + potenza
  else targetHards = 3; // intermediate+: Aerobica + Forza + Potenza

  const baseHards = targetHards;

  // Stato forma: override da simulazione se presente, altrimenti calcola da storia reale
  const form = buildFormTrend(activities, hr, now);
  const formCtx: FormCtx | null = overrideFormCtx || (form ? {
    ctl: form.ctl[form.DAYS-1],
    atl: form.atl[form.DAYS-1],
    tsb: form.tsb[form.DAYS-1],
  } : null);

  const metrics = computeMetrics(activities, hr, 0, now);
  const model = buildTrainingModel(activities, hr, now);
  // Deload programmato dal mesociclo OPPURE deload retroattivo dal training model.
  // Il primo prevale: è una decisione di periodizzazione, non reattiva al carico storico.
  const isRecoveryWeek = (weekRole?.isDeload === true) || model.needsRecoveryWeek;

  // ---- Riconciliazione con attività REALI della settimana calendario (Lun-Dom) ----
  // Rende il piano dinamico: se hai già fatto hard/lunga, i target residui si riducono.
  let effectiveLongRides = longRides;
  let dynReduceHards = 0;
  let dynNote: string | null = null;
  if (startOffset === 0) {
    const mondayIso = dayOffsetIso(currentMondayOffset(now), now);
    const todayIsoStr = dayOffsetIso(0, now);
    const doneThisWeek = activities.filter(a => {
      const iso = isoDay(a.start_date_local);
      return iso >= mondayIso && iso <= todayIsoStr;
    });
    const bikeDone = doneThisWeek.filter(a => a.type && a.type.includes('Ride'));
    const hardsDone = bikeDone.filter(a => isHard(a, settings?.hrLthr, settings?.ftpDeclared)).length;
    const longsDone = bikeDone.filter(a => (a.moving_time||0) >= 120*60).length;
    if (longsDone > 0) effectiveLongRides = Math.max(0, longRides - longsDone);
    if (hardsDone > 0) dynReduceHards = hardsDone;
    if (hardsDone > 0 || longsDone > 0) {
      const parts = [];
      if (hardsDone > 0) parts.push(`${hardsDone} hard già fatti da Lunedì`);
      if (longsDone > 0) parts.push(`${longsDone} lunga/e già fatta/e`);
      dynNote = parts.join(' · ');
    }
  }

  // Riduzione SINGOLA (non cumulativa) basata sulla condizione più severa.
  // Principio: solo un reale stato di sovraccarico azzera l'intensità.
  // Situazioni normali mantengono l'intensità completa.
  // TSB normalizzato rispetto al CTL (invariante di scala): -0.5 = TSB è 50% sotto CTL.
  const tsbNorm = (formCtx && formCtx.ctl > 1) ? formCtx.tsb / formCtx.ctl : 0;

  let reduction = 0;
  let reductionReason: string | null = null;
  if (tsbNorm < -0.6) { reduction = 2; reductionReason = 'sovraccarico severo (TSB ben sotto CTL)'; }
  else if (weekRole?.isDeload) { reduction = baseHards >= 3 ? 2 : 1; reductionReason = `deload programmato (${weekRole.label})`; }
  else if (isRecoveryWeek) { reduction = 1; reductionReason = 'settimana di scarico (retroattivo)'; }
  else if (tsbNorm < -0.3) { reduction = 1; reductionReason = 'forma bassa (TSB 30%+ sotto CTL)'; }
  else if (metrics.ratio !== null && metrics.ratio > 1.7) { reduction = 1; reductionReason = 'spike di carico'; }
  else if (model.polarization && model.polarization.hardPct > 0.4) { reduction = 1; reductionReason = 'polarizzazione sbilanciata (>40% hard)'; }

  // FLOOR: sempre almeno 1 HARD, azzera solo in sovraccarico severo.
  const floor = tsbNorm < -0.6 ? 0 : 1;
  targetHards = Math.max(floor, baseHards - reduction);
  // Block periodization override: il pattern Rønnestad forza N HARD specifici per
  // settimana (5/1/2/1), indipendentemente dal baseHards del livello. Rispetta floor
  // solo in caso di sovraccarico severo.
  if (weekRole?.hardOverride != null && tsbNorm >= -0.6) {
    targetHards = weekRole.hardOverride;
    reductionReason = `${weekRole.label} (forza ${targetHards} HARD/sett)`;
  }
  // Sottrai hard già fatti nella settimana calendario corrente
  if (dynReduceHards > 0) {
    targetHards = Math.max(0, targetHards - dynReduceHards);
    reductionReason = (reductionReason ? reductionReason + ' + ' : '') + `già fatti ${dynReduceHards} hard`;
  }

  const slots: PlanSlot[] = [];
  for (let i = 0; i < 7; i++) {
    const globalOffset = startOffset + i;
    const iso = dayOffsetIso(globalOffset, now);
    const d = new Date(iso);
    slots.push({
      offset: globalOffset, iso, dow: d.getDay(),
      label: offsetLabel(globalOffset, now),
      category: null,
      isPast: globalOffset < 0,
    });
  }

  // Slot PASSATI: mostra l'attività reale svolta (se c'è) o PAST_REST
  slots.forEach(s => {
    if (!s.isPast) return;
    const act = findPrimaryActivityForDay(activities, s.iso);
    if (act) {
      s.category = 'DONE';
      s.activity = act;
    } else {
      s.category = 'PAST_REST';
    }
  });

  // 1) Skip dall'utente (solo su slot non già DONE/PAST_REST)
  slots.forEach(s => { if (!s.category && plannedSet.has(s.iso)) s.category = 'SKIP'; });

  // 1bis) Giorni NON disponibili (settings.availableDays): auto-skip su slot futuri vuoti.
  slots.forEach(s => {
    if (s.category || s.isPast) return;
    if (!isAvailableDay(s.dow, settings)) s.category = 'REST';
  });

  // 2) Lunghe sui giorni configurati (settings.longRideDays, default sabato) — solo su slot NON passati
  const longCandidates = slots.filter(s => isLongRideDay(s.dow, settings) && !s.category && !s.isPast);
  longCandidates.slice(0, effectiveLongRides).forEach(s => s.category = 'LONG');

  // 3) Hard: usa giorni storici preferiti, fallback alle preferenze standard
  const hardPreference = [
    ...model.hardDowHistorical,
    ...[2, 4, 3, 1, 5].filter(d => !model.hardDowHistorical.includes(d)),
  ];
  pickHardDays(slots, targetHards, hardPreference);

  // 4) Giorno dopo HARD/LONG/DONE-hard → RECOVERY (solo slot futuri)
  slots.forEach(s => {
    if (s.category || s.isPast) return;
    const prev = slots.find(x => x.offset === s.offset - 1);
    if (!prev) return;
    const prevWasHardOrLong = prev.category === 'HARD' || prev.category === 'LONG';
    const prevWasRealHard = prev.category === 'DONE' && prev.activity &&
      (isHard(prev.activity, settings?.hrLthr, settings?.ftpDeclared) || (prev.activity.moving_time||0) >= 120*60);
    if (prevWasHardOrLong || prevWasRealHard) {
      s.category = 'RECOVERY';
    }
  });

  // 5) Riempi con EASY solo su slot futuri, preferibilmente sui giorni storici
  const countTraining = () => slots.filter(s =>
    ['LONG','HARD','EASY','RECOVERY','DONE'].includes(s.category as string)).length;
  const preferredSet = new Set(model.preferredDays);
  for (const s of slots) {
    if (s.isPast) continue;
    if (countTraining() >= weeklyDays) break;
    if (!s.category && preferredSet.has(s.dow)) s.category = 'EASY';
  }
  for (const s of slots) {
    if (s.isPast) continue;
    if (countTraining() >= weeklyDays) break;
    if (!s.category) s.category = 'EASY';
  }

  // 6) Resto (futuri) → REST
  slots.forEach(s => { if (!s.category) s.category = 'REST'; });

  // 7) PIOGGIA: trasforma la categoria per i giorni di pioggia
  //    SKIP → resta SKIP (non si sovrascrive la scelta utente)
  //    RECOVERY → REST_RAIN (Z1 scarico + pioggia = riposo totale, come richiesto)
  //    Tutto il resto (LONG/HARD/EASY/REST) → STRENGTH (corpo libero)
  // Evita 2 sessioni di forza consecutive controllando:
  //   (a) il giorno prima nella stessa settimana pianificata
  //   (b) attività REALI di forza registrate ieri (WeightTraining/Workout/Crossfit)
  const recentStrengthIsos = new Set(
    activities
      .filter(isStrengthActivity)
      .map(a => isoDay(a.start_date_local))
  );
  slots.forEach((s, i) => {
    if (!rainySet.has(s.iso)) return;
    if (s.category === 'SKIP') return;
    if (s.category === 'RECOVERY') { s.category = 'REST_RAIN'; return; }
    const prev = slots[i-1];
    const prevIso = (() => {
      const d = new Date(s.iso); d.setDate(d.getDate() - 1);
      return isoDay(d);
    })();
    const prevPlannedStrength = prev && (prev.category === 'STRENGTH' || prev.category === 'MOBILITY');
    const prevRealStrength = recentStrengthIsos.has(prevIso);
    if (prevPlannedStrength || prevRealStrength) {
      s.category = 'MOBILITY';
    } else {
      s.category = 'STRENGTH';
    }
  });

  // Assegna indici progressivi per rotazione HARD
  const totalHardsInWeek = slots.filter(s => s.category === 'HARD').length;
  const days = slots.map(s => {
    // Dal passo 6 ogni giorno ha una categoria, e ogni giorno HARD il suo indice.
    const category = s.category as string;
    let rec: Advice;
    if (category === 'DONE' && s.activity) {
      rec = buildDoneRec(s.activity, settings, inputs);
    } else {
      rec = workoutForCategory(
        category, settings, profile,
        category === 'HARD' ? s.hardSeq as number : 0,
        formCtx, isRecoveryWeek, totalHardsInWeek, inputs
      );
    }
    return {
      offset: s.offset, label: s.label, iso: s.iso,
      rec, category,
      activity: s.activity || null,
      isPast: s.isPast,
    };
  });
  // Summary diagnostico
  const categoryCount: Record<string, number> = { HARD:0, LONG:0, EASY:0, RECOVERY:0, REST:0, SKIP:0, STRENGTH:0, REST_RAIN:0, MOBILITY:0, DONE:0, PAST_REST:0 };
  days.forEach(d => { categoryCount[d.category] = (categoryCount[d.category]||0)+1; });

  // Mesocycle info
  const meso = inputs.meso;
  const mesoBlock = meso ? MESO_BLOCKS.find(b => b.id === meso.blockId) : null;

  return {
    days, model, formCtx, plannedRests: Array.from(plannedSet),
    isRecoveryWeek, startOffset, weekRole,
    mesocycle: meso ? {
      blockId: meso.blockId,
      blockLabel: mesoBlock?.label || meso.blockId,
      weekInBlock: weekRole ? weekRole.weekInBlock : meso.weekInBlock,
      totalWeeks: mesoBlock?.weeks || 4,
      focus: mesoBlock?.focus || 'general',
      description: mesoBlock?.description || '',
      role: weekRole?.role || null,
      roleLabel: weekRole?.label || null,
      loadMul: weekRole?.loadMul || null,
    } : null,
    debug: {
      baseHards, targetHards, reduction, reductionReason,
      lvl, tsb: formCtx?.tsb?.toFixed(0), ratio: metrics.ratio != null ? metrics.ratio.toFixed(2) : null,
      polHardPct: model.polarization ? (model.polarization.hardPct*100).toFixed(0)+'%' : null,
      categoryCount,
      dynReconciliation: dynNote,
      effectiveLongRides,
      weekRole: weekRole?.role || null,
    },
  };
}

// Un giorno passato con un'attività: che cosa è stato fatto.
export function buildDoneRec(
  act: Activity, settings: Settings | null | undefined, inputs: Pick<PlanInputs, 'now' | 'segmentEstimates'>,
): Advice {
  const { hrLthr, ftp } = planHr(settings, undefined, inputs);
  const isBike = act.type && act.type.includes('Ride');
  const emoji = TYPE_EMOJI[act.type] || '•';
  const hard = isBike && isHard(act, hrLthr, ftp);
  const long = isBike && (act.moving_time||0) >= 120*60;
  let badge = '';
  if (long) badge = '🟠 lunga';
  else if (hard) badge = '🔴 dura';
  else if (isBike) badge = '🟢 bici easy';
  else badge = '💪 cross-training';
  const parts = [
    `${(act.distance/1000).toFixed(1)} km`,
    fmtTime(act.moving_time),
    `↑${Math.round(act.total_elevation_gain||0)}m`,
  ];
  if (act.average_heartrate) parts.push(`FC ${Math.round(act.average_heartrate)}`);
  if (act.average_watts) parts.push(`${Math.round(act.average_watts)} W`);
  return {
    title: `✓ ${emoji} ${act.name || act.type}`,
    detail: `${badge} · ${parts.join(' · ')}`,
    reason: null,
    _isDone: true,
    _activityId: act.id,
  };
}
