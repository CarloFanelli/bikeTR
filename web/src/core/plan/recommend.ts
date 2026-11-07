// Il consiglio del giorno in Allenamento ("regole semplici") e i numeri sotto.
// Focus: miglioramento soglia/FTP, zone basate su FC.
// Considera: carico 7/28gg, freschezza, sessioni dure recenti, riposi pianificati.
// Supporta "perspective shift" con dayOffset: 0 = oggi, 1 = domani, ecc.

import { buildDateHelpers, dayOffsetIso } from '../dates.ts';
import { buildFormTrend, compositeFatigueScore } from '../form.ts';
import { isoDay } from '../format.ts';
import { buildFtpTrend } from '../ftp.ts';
import type { HrProfile } from '../hr.ts';
import { activityLoad, isHard, isStrengthActivity, muscularFatigueScore, typeWeight } from '../load.ts';
import { buildPowerProfile } from '../power.ts';
import type { Settings } from '../settings.ts';
import type { Activity } from '../strava-types.ts';
import { isLongRideDay } from './dates.ts';
import { planHr } from './inputs.ts';
import type { Advice, PlanInputs, PlanProfile, SyntheticActivity } from './inputs.ts';

// Riposo = nessuna attività (di qualsiasi tipo) in quel giorno.
export function restStreak(allActs: Activity[], _plannedSet: Set<string> | null, dayOffset: number, now: Date): number {
  const actDays = new Set(allActs.map(a => isoDay(a.start_date_local)));
  const { refIso } = buildDateHelpers(dayOffset, now);
  let streak = 0;
  for (let i = 1; i <= 14; i++) {
    const iso = refIso(-i);
    if (actDays.has(iso)) break;
    streak++;
  }
  return streak;
}

// Il primo giorno dopo oggi non segnato come salto, entro `maxAhead` giorni (altrimenti domani).
export function findNextNonSkipOffset(plannedSet: Set<string>, maxAhead: number, now: Date): number {
  for (let i = 1; i <= maxAhead; i++) {
    if (!plannedSet.has(dayOffsetIso(i, now))) return i;
  }
  return 1;
}

// Il consiglio del giorno `dayOffset` (0 = oggi). Il testo è semplice: chi lo mostra lo
// rende sicuro per la pagina (il nome di un'attività può contenere < e &).
export function recommend(
  activities: Activity[], settings: Settings | null | undefined, plannedRests: string[] | null | undefined,
  dayOffset: number, profile: PlanProfile | null | undefined, inputs: Pick<PlanInputs, 'now' | 'segmentEstimates' | 'ftpHistory'>,
): Advice {
  const { now } = inputs;
  const hr = planHr(settings, activities, inputs);
  const { hrMax, hrLthr, ftp } = hr;
  const { weeklyHours = 6, weeklyDays = 4, longRides = 1 } = settings || {};
  const levelKey = profile?.level?.key || 'intermediate';
  const allActs = activities.slice();
  const bikeActs = activities.filter(a => a.type && a.type.includes('Ride'));
  const plannedSet = new Set(plannedRests || []);
  const { ref, ago, refIso } = buildDateHelpers(dayOffset, now);

  const allLast7 = allActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 7);
  const allLast28 = allActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 28);
  const last7 = bikeActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 7);
  const last28 = bikeActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 28);

  // Carico: somma su TUTTI i tipi di attività (con peso per tipo)
  const acute = allLast7.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0);
  const chronic = allLast28.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0) / 4;
  // ratio = null se il campione cronico è troppo magro (atleta nuovo): non
  // possiamo dichiarare "overreaching" su base statistica con quasi-zero storia.
  // I trigger basati su hard% e fatica muscolare restano comunque attivi.
  const ratio = chronic >= 50 ? acute / chronic : null;

  // "Yesterday" e "today" considerano qualsiasi attività (sport trasversali)
  const daysSinceLast = allActs.length ? Math.max(0, ago(allActs[0].start_date_local)) : 99;
  const yesterday = allActs.find(a => ago(a.start_date_local) === 1);
  const todayAct = dayOffset === 0 ? allActs.find(a => ago(a.start_date_local) === 0) : null;

  // Ore settimanali: tutte le attività eccetto le uscite lunghe (≥2h in bici)
  const hoursThisWeek = allLast7
    .filter(a => !(a.type && a.type.includes('Ride') && (a.moving_time || 0) >= 120*60))
    .reduce((s,a) => s + a.moving_time/3600, 0);
  const hardsLast7 = last7.filter(a => isHard(a, hrLthr, ftp)).length;
  const longRidesLast7 = last7.filter(a => (a.moving_time || 0) >= 120*60).length;
  const dow = ref.getDay();
  const longRideDay = isLongRideDay(dow, settings);

  const restDays = restStreak(bikeActs, plannedSet, dayOffset, now);
  const restTomorrow = plannedSet.has(refIso(1));
  const skipThisDay = plannedSet.has(refIso(0));

  // Target intensità calibrato sul livello: principianti max 1, intermedi+ possono 2
  const targetHardPerWeek = (levelKey === 'new' || levelKey === 'beginner') ? 1
    : (weeklyDays >= 4 ? 2 : 1);

  if (todayAct) {
    const isBike = todayAct.type && todayAct.type.includes('Ride');
    const label = isBike ? '✅ Hai già pedalato oggi'
      : `✅ Attività oggi: ${todayAct.type}`;
    const body = isBike
      ? `${(todayAct.distance/1000).toFixed(1)} km · ${Math.round(todayAct.moving_time/60)} min. Bel lavoro.`
      : `${todayAct.name} · ${Math.round(todayAct.moving_time/60)} min. Conteggio come carico complementare (peso ${typeWeight(todayAct).toFixed(1)}×).`;
    return { title: label, detail: body, reason: 'Ricomincio a consigliare domani.' };
  }

  if (skipThisDay) {
    return {
      title: '⏸️ Riposo pianificato',
      detail: 'Hai marcato oggi come giornata di stop.',
      reason: 'Il prossimo allenamento tiene conto del recupero extra.',
    };
  }

  if (restDays >= 4) {
    return {
      title: '🟢 Riattivazione',
      detail: `60 min facili in Z2 con 4×30"/30" allunghi (no sprint, risveglio neuromuscolare). FC ${hrLthr ? `< ${Math.round(hrLthr*0.85)}` : 'comoda'} bpm.`,
      reason: `${restDays} giorni di stop: serve una giornata di ripresa prima di tornare a spingere.`,
    };
  }

  // Fatigue composito: cardio (TSB) + muscolare (D+, forza, eccentrico)
  let mFatigue = 0;
  try { mFatigue = muscularFatigueScore(allActs, 7, now); } catch { /* safe */ }
  const isMuscleFatigued = mFatigue > 50;
  let compositeFatigue = null;
  try { compositeFatigue = compositeFatigueScore(buildFormTrend(allActs, hr, now), allActs, now); } catch { /* safe */ }

  if ((ratio !== null && ratio > 1.5) || hardsLast7 >= 3 || (isMuscleFatigued && ratio !== null && ratio > 1.2)) {
    const muscleNote = isMuscleFatigued
      ? ` Fatica muscolare elevata (${mFatigue}/100) da dislivello/forza recente.`
      : '';
    const compositeNote = compositeFatigue
      ? ` Prontezza: ${compositeFatigue.readiness} (${compositeFatigue.composite}/100).`
      : '';
    return {
      title: '😌 Riposo',
      detail: `Oggi fermo o mobilità leggera (20–30 min).${muscleNote}${compositeNote}`,
      reason: `Carico alto (${acute.toFixed(0)} vs media ${chronic.toFixed(0)}). Serve recupero.`,
    };
  }

  // Cross-training: hike impegnativa ieri = gambe affaticate (eccentrico/D+)
  const hikeYesterday = yesterday && (yesterday.type === 'Hike' || yesterday.type === 'Walk')
    && (yesterday.total_elevation_gain || 0) > 400;
  const trailRunYesterday = yesterday && yesterday.type === 'TrailRun'
    && (yesterday.total_elevation_gain || 0) > 300;
  if (hikeYesterday || trailRunYesterday) {
    const elevY = yesterday.total_elevation_gain || 0;
    const actType = hikeYesterday ? 'escursione' : 'trail run';
    const recoveryNote = elevY > 1000
      ? `${actType} alpina con ${Math.round(elevY)}m D+ — gambe sotto stress eccentrico serio, 48h recupero ideali.`
      : `${actType} con ${Math.round(elevY)}m D+ — stress muscolare da gestire.`;
    if (elevY > 1000) {
      return {
        title: '😌 Riposo post-' + actType,
        detail: `Nessuna attività o mobilità leggera (30 min stretching). ${recoveryNote}`,
        reason: `Cross-training: lo stress eccentrico da dislivello (discesa) causa micro-danni muscolari nei quadricipiti. Servono 36-48h prima di sessioni dure in bici.`,
      };
    }
    return {
      title: '🟢 Z2 leggero post-' + actType,
      detail: `45–60 min Z2 leggero${hrLthr ? ` (FC ${Math.round(hrLthr*0.75)}–${Math.round(hrLthr*0.85)} bpm)` : ''}. Niente intensità.`,
      reason: recoveryNote,
    };
  }

  if (yesterday && (isHard(yesterday, hrLthr, ftp) || isStrengthActivity(yesterday))) {
    const note = isStrengthActivity(yesterday)
      ? 'Ieri hai fatto forza/corpo libero → gambe potenzialmente indolenzite.'
      : 'Ieri sessione dura → oggi recupero attivo.';
    return {
      title: '🟢 Recupero attivo Z1',
      detail: `45–60 min facili in Z1 (FC < ${hrLthr ? Math.round(hrLthr*0.75) : '—'} bpm). Gambe sciolte.`,
      reason: note,
    };
  }

  if (bikeActs.length === 0) {
    return {
      title: '🟡 Fondo medio Z2',
      detail: `60–75 min in Z2 (FC ${hrLthr ? `${Math.round(hrLthr*0.75)}–${Math.round(hrLthr*0.88)}` : 'aerobica comoda'} bpm).`,
      reason: 'Nessun dato storico: partiamo da aerobico puro.',
    };
  }

  const needLong = longRidesLast7 < longRides;
  if (needLong && longRideDay) {
    // Durata target: usa longRideMaxMin dell'utente come tetto, scala con freschezza e CTL.
    const userMax = Number(settings?.longRideMaxMin) || 180;
    const freshOk = restDays >= 1 && ratio !== null && ratio < 1.2;
    const ctlGood = chronic > 120;
    const targetMin = (ctlGood && freshOk) ? userMax
                    : ctlGood ? Math.max(120, userMax - 30)
                    : 120;
    return {
      title: '🟠 Uscita lunga Z2',
      detail: `${targetMin} min in Z2${hrLthr ? ` (FC ${Math.round(hrLthr*0.75)}–${Math.round(hrLthr*0.88)} bpm)` : ''}. Costante, mangia/bevi. Opzionale: 2×10' Sweet Spot a metà giro.`,
      reason: `Giorno di lunga + lunga da fare (${longRidesLast7}/${longRides}). Tetto utente: ${userMax} min.`,
    };
  }

  const freshBonus = restDays >= 2;
  const canPushBecauseTomorrowRest = restTomorrow && restDays >= 1;
  const shouldDoIntensity =
    // Come in JavaScript, un rapporto assente conta 0.
    (hardsLast7 < targetHardPerWeek && daysSinceLast >= 1 && (ratio ?? 0) < 1.2) ||
    freshBonus || canPushBecauseTomorrowRest;

  if (shouldDoIntensity) {
    const totalHard = last28.filter(a => isHard(a, hrLthr, ftp)).length;
    const s = settings || {};
    // Power profile analysis: identifica deficit per scegliere l'intensità giusta
    const powerProfile = buildPowerProfile(bikeActs, s.weight);
    let deficit: string | undefined = powerProfile?.primaryDeficit?.area;

    // FTP plateau detection: se in plateau, forza un cambio di stimolo
    const ftpTrend = buildFtpTrend(inputs.ftpHistory);
    if (ftpTrend?.isPlateauDetected && !deficit) {
      // Se in plateau senza deficit chiaro, suggerisci VO2max (il più efficace per sbloccare)
      deficit = 'vo2max';
    }

    // Scelta del tipo di intensità guidata da power profile (se disponibile)
    // altrimenti fallback alla rotazione per livello.
    let phase: number;
    if (levelKey === 'new' || levelKey === 'beginner') {
      phase = 0; // solo Sweet Spot
    } else if (deficit) {
      // Deficit-driven: scegli la fase che colma la lacuna
      if (deficit === 'vo2max') {
        phase = freshBonus ? 2 : 1; // VO2 se fresco, Soglia se stanco (preparazione)
      } else if (deficit === 'threshold') {
        phase = freshBonus ? 1 : 0; // Soglia se fresco, SST se stanco
      } else if (deficit === 'neuromuscular') {
        phase = freshBonus ? 2 : (totalHard % 2); // VO2/sprint se fresco
      } else if (deficit === 'endurance') {
        phase = 0; // SST: costruisce base senza distrurre
      } else {
        phase = totalHard % 3; // fallback rotazione
      }
    } else if (levelKey === 'intermediate') {
      phase = freshBonus ? 1 : (totalHard % 2);
    } else {
      phase = freshBonus ? (totalHard % 2 === 0 ? 1 : 2) : (totalHard % 3);
    }

    // Target watt se FTP disponibile
    const wattTarget = (pctLow: number, pctHigh: number) => ftp
      ? ` (~${Math.round(ftp*pctLow)}–${Math.round(ftp*pctHigh)} W)` : '';

    let rec: Advice;
    if (phase === 0) {
      rec = {
        title: '🔴 Sweet Spot',
        detail: `Risc 15' → 3×12' @ 88–93% LTHR${hrLthr ? ` (~${Math.round(hrLthr*0.88)}–${Math.round(hrLthr*0.93)} bpm)` : ''}${wattTarget(0.88, 0.93)}, rec 4' → defat 10'. Totale ~75 min.`,
        reason: deficit === 'threshold'
          ? 'Sweet Spot: costruisce soglia per colmare il deficit FTP identificato dal tuo power profile.'
          : 'Sweet Spot costruisce soglia senza bruciare energia.',
      };
    } else if (phase === 1) {
      rec = {
        title: '🔴 Soglia (Threshold)',
        detail: `Risc 15' → 4×8' @ 95–100% LTHR${hrLthr ? ` (~${Math.round(hrLthr*0.95)}–${hrLthr} bpm)` : ''}${wattTarget(0.95, 1.0)}, rec 4' → defat 10'. Totale ~75 min.`,
        reason: deficit === 'threshold'
          ? 'Lavoro specifico soglia: il tuo power profile mostra margine di crescita FTP rispetto al VO2max.'
          : 'Lavoro specifico di soglia per alzare FTP.',
      };
    } else {
      rec = {
        title: '🔴 VO2max',
        detail: `Risc 20' → 6×3' @ massimo sostenibile (FC > ${hrLthr ? Math.round(hrLthr*1.02) : 'molto alta'} bpm)${wattTarget(1.10, 1.20)}, rec 3' → defat 10'. Totale ~70 min.`,
        reason: deficit === 'vo2max'
          ? 'VO2max prioritario: il tuo power profile mostra un "tetto" aerobico che limita la crescita della soglia.'
          : 'VO2max: alza il tetto da cui la soglia può crescere.',
      };
    }
    const extra = [];
    if (freshBonus) extra.push(`${restDays} gg riposo → qualità alta`);
    if (canPushBecauseTomorrowRest && !freshBonus) extra.push('domani riposo → puoi spingere');
    // Con il deficit scelto dal plateau FTP e nessun deficit nel power profile questa riga
    // lancia un errore, tenuto finché le formule non si correggono: Allenamento non mostra il consiglio.
    if (deficit) extra.push(`focus: ${powerProfile!.primaryDeficit!.label}`);
    if (isMuscleFatigued) extra.push(`fatica muscolare ${mFatigue}/100`);
    if (extra.length) rec.reason += ' · ' + extra.join(' · ');
    return rec;
  }

  // Allenamenti rimanenti nella settimana (escludendo la lunga)
  const nonLongSessionsDone = last7.filter(a => (a.moving_time||0) < 120*60).length;
  const remainingDays = Math.max(1, (weeklyDays - longRides) - nonLongSessionsDone);
  const durMin = Math.min(120, Math.max(60, Math.round((weeklyHours*60 - hoursThisWeek*60) / remainingDays)));
  return {
    title: '🟡 Fondo Z2',
    detail: `${durMin} min in Z2${hrLthr ? ` (FC ${Math.round(hrLthr*0.75)}–${Math.round(hrLthr*0.88)} bpm)` : ''}, cadenza 85–95, costante.`,
    reason: `Volume aerobico. Ore settimana: ${hoursThisWeek.toFixed(1)}/${weeklyHours}.`,
  };
}

// I numeri sotto il consiglio del giorno `dayOffset`: carico 7 e 28 giorni, ore, sessioni dure, giorni di riposo.
export function computeMetrics(
  activities: Activity[], hr: Pick<HrProfile, 'hrMax' | 'hrLthr' | 'ftp'>, plannedRests: string[] | null | undefined,
  dayOffset: number, now: Date,
) {
  const { hrMax, hrLthr, ftp } = hr;
  const allActs = activities.slice();
  const bikeActs = activities.filter(a => a.type && a.type.includes('Ride'));
  const plannedSet = new Set(plannedRests || []);
  const { ago } = buildDateHelpers(dayOffset, now);
  const allLast7 = allActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 7);
  const allLast28 = allActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 28);
  const last7Bike = bikeActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 7);
  const acute = allLast7.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0);
  const chronic = allLast28.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0) / 4;
  const ratio = chronic >= 50 ? acute / chronic : null;
  const hoursThisWeek = allLast7.reduce((s,a) => s + a.moving_time/3600, 0);
  const hardsLast7 = last7Bike.filter(a => isHard(a, hrLthr, ftp)).length;
  const restDays = restStreak(allActs, plannedSet, dayOffset, now);
  return { acute, chronic, ratio, hoursThisWeek, hardsLast7, restDays };
}

// Per proiettare il piano, aggiungo un'"attività sintetica" per ogni giorno pianificato,
// così il giorno successivo considera il lavoro ipotetico di quello precedente.
export function synthActivityFromRec(
  rec: Pick<Advice, 'title'>, dayOffset: number, settings: Settings | null | undefined, inputs: Pick<PlanInputs, 'now' | 'segmentEstimates'>,
): SyntheticActivity | null {
  const { hrLthr } = planHr(settings, undefined, inputs);
  const t = rec.title;
  const make = (minutes: number, hrFactor: number): SyntheticActivity => {
    const d = new Date(inputs.now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(9,0,0,0);
    return {
      type: 'Ride',
      start_date_local: d.toISOString(),
      moving_time: minutes * 60,
      distance: minutes * 500,
      total_elevation_gain: 0,
      has_heartrate: !!hrLthr,
      average_heartrate: hrLthr ? hrLthr * hrFactor : undefined,
      _synthetic: true,
    };
  };
  if (t.includes('Riposo') || t.includes('pianificato')) return null;
  if (t.includes('Recupero')) return make(50, 0.70);
  if (t.includes('VO2') || t.includes('Soglia') || t.includes('Sweet Spot')) return make(75, 0.93);
  if (t.includes('lunga')) return make(150, 0.80);
  if (t.includes('Riattivazione')) return make(60, 0.75);
  if (t.includes('Fondo') || t.includes('Z2')) return make(75, 0.78);
  if (t.includes('pedalato')) return null;
  return null;
}
