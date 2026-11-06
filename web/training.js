// Motore "regole semplici" per consigliare l'allenamento.
// Focus: miglioramento soglia/FTP, zone basate su FC.
// Considera: carico 7/28gg, freschezza, sessioni dure recenti, riposi pianificati.
// Supporta "perspective shift" con dayOffset: 0 = oggi, 1 = domani, ecc.
import {
  isoDay, todayIso, dayOffsetIso, escapeHtml, fmtKm, fmtTime, TYPE_EMOJI, BIKE_TYPES,
  safeLoad, safeSave, loadRainyDays,
} from './strava.js';
import { estimatesFromSegments } from './predictions.js';
import { v2_workoutForCategory } from './training_v2.js';
import { buildDateHelpers as dateHelpersFrom } from './src/core/dates.ts';
import { buildFormTrend as formTrendFrom, compositeFatigueScore as compositeFatigueFrom } from './src/core/form.ts';
import { buildFtpTrend as ftpTrendFrom } from './src/core/ftp.ts';
import { estimateFTP as estimateFtpFrom, estimateLTHR, resolveHr as resolveHrFrom } from './src/core/hr.ts';
import {
  TYPE_WEIGHTS, typeWeight, hikeSpecificLoad, muscularFatigueScore as muscularFatigueFrom, activityLoad, isHard,
} from './src/core/load.ts';
import { buildPowerProfile } from './src/core/power.ts';
import {
  levelFromKm, consistencyScore as consistencyFrom, buildProfile as buildProfileFrom, personalRecords,
} from './src/core/profile.ts';
import { loadFtpHistory } from './src/data/storage.ts';

// I calcoli stanno in src/core/ e ricevono tutto come parametro. Queste versioni con i
// nomi e gli argomenti di prima leggono l'orologio, i segmenti salvati e lo storico FTP.
const estimateFTP = (activities) => estimateFtpFrom(activities, new Date());
const consistencyScore = (activities) => consistencyFrom(activities, new Date());
const buildProfile = (stats, activities, settings) => buildProfileFrom(stats, activities, settings, new Date());
const muscularFatigueScore = (activities, daysWindow = 7) => muscularFatigueFrom(activities, daysWindow, new Date());
const buildDateHelpers = (dayOffset) => dateHelpersFrom(dayOffset, new Date());
// I test del servizio Coach (make_reference.mjs) sostituiscono il profilo qui.
function resolveHr(settings, activities) {
  return resolveHrFrom(settings, activities, estimatesFromSegments(), new Date());
}
const buildFormTrend = (activities, settings) =>
  formTrendFrom(activities, resolveHr(settings, activities), new Date());
const compositeFatigueScore = (activities, settings) =>
  compositeFatigueFrom(buildFormTrend(activities, settings), activities, new Date());
const buildFtpTrend = () => ftpTrendFrom(loadFtpHistory());

function renderRecords(recs) {
  if (!recs) return '';
  const row = (label, a, value) => a ? `
    <a class="rec-link" href="activity.html?id=${a.id}">
      <div class="muted" style="font-size:.75rem">${label}</div>
      <div class="rec-val">${value}</div>
      <div class="muted" style="font-size:.75rem">${escapeHtml(a.name)}</div>
    </a>` : '';
  return `
    <h3 style="margin-top:1rem">🏆 I tuoi record (dalle ultime ~60 uscite)</h3>
    <div class="records-grid">
      ${row('Più lunga', recs.longest, fmtTime(recs.longest.moving_time) + ' · ' + fmtKm(recs.longest.distance))}
      ${row('Più dislivello', recs.mostClimb, `↑${Math.round(recs.mostClimb.total_elevation_gain)} m`)}
      ${row('Più veloce (>30km)', recs.fastest, ((recs.fastest?.average_speed||0)*3.6).toFixed(1)+' km/h')}
      ${row('Più dura (Suffer)', recs.mostSuffer, (recs.mostSuffer?.suffer_score||0) + ' SS')}
    </div>
  `;
}

function renderProfile(p, records) {
  const consPct = Math.round(p.consistency * 100);
  return `
    <div class="profile-grid">
      <div class="profile-badge">
        <div class="muted">Livello stimato</div>
        <div class="profile-level">${escapeHtml(p.level.label)}</div>
        <div class="muted" style="font-size:.8rem">${escapeHtml(p.level.note)}</div>
      </div>
      <div class="metrics" style="margin:0">
        <div><span class="muted">Forma</span><b>${escapeHtml(p.form)}</b></div>
        <div><span class="muted">Km all-time</span><b>${Math.round(p.allKm).toLocaleString('it-IT')}</b></div>
        <div><span class="muted">Uscite all-time</span><b>${p.allCount}</b></div>
        <div><span class="muted">Km ult. 4 sett.</span><b>${Math.round(p.recentKm)}</b></div>
        <div><span class="muted">Ore/sett recenti</span><b>${p.weeklyRecent.toFixed(1)}h</b></div>
        <div><span class="muted">Uscite ult. 4 sett.</span><b>${p.recentCount}</b></div>
        <div><span class="muted">Consistenza 8 sett.</span><b>${consPct}%</b></div>
        ${p.wPerKg ? `<div><span class="muted">W/kg (best)</span><b>${p.wPerKg}</b></div>` : ''}
      </div>
    </div>
    ${renderRecords(records)}
  `;
}

// Conversioni dow ISO (1=Lun … 7=Dom) ↔ JS (0=Dom … 6=Sab) e helper calendario.
function jsDowToIso(jsDow) { return jsDow === 0 ? 7 : jsDow; }
// Offset (giorni rispetto a oggi) di lunedì della settimana corrente. Sempre ≤ 0.
// Es. oggi mercoledì → -2. Oggi domenica → -6.
function currentMondayOffset() {
  const dow = new Date().getDay();
  return -(((dow + 6) % 7));
}
// Default longRideDays: sabato (ISO 6) se non configurato.
function _longRideDays(settings) {
  const arr = settings?.longRideDays;
  if (Array.isArray(arr) && arr.length) return arr;
  return [6]; // sabato
}
function _isLongRideDay(jsDow, settings) {
  return _longRideDays(settings).includes(jsDowToIso(jsDow));
}
// Default availableDays: tutti i 7 giorni.
function _availableDays(settings) {
  const arr = settings?.availableDays;
  if (Array.isArray(arr) && arr.length) return arr;
  return [1,2,3,4,5,6,7];
}
function _isAvailableDay(jsDow, settings) {
  return _availableDays(settings).includes(jsDowToIso(jsDow));
}

// Riposo = nessuna attività (di qualsiasi tipo) in quel giorno.
function restStreak(allActs, _plannedSet, dayOffset) {
  const actDays = new Set(allActs.map(a => isoDay(a.start_date_local)));
  const { refIso } = buildDateHelpers(dayOffset);
  let streak = 0;
  for (let i = 1; i <= 14; i++) {
    const iso = refIso(-i);
    if (actDays.has(iso)) break;
    streak++;
  }
  return streak;
}

// Attività "principale" di un giorno (iso): bici se presente, altrimenti la prima.
// Usata da buildWeekPlan per popolare slot passati con la categoria DONE.
function findPrimaryActivityForDay(activities, iso) {
  const sameDay = activities.filter(a => isoDay(a.start_date_local) === iso);
  if (!sameDay.length) return null;
  const bike = sameDay.find(a => a.type && a.type.includes('Ride'));
  return bike || sameDay[0];
}

function findNextNonSkipOffset(plannedSet, maxAhead = 7) {
  for (let i = 1; i <= maxAhead; i++) {
    if (!plannedSet.has(dayOffsetIso(i))) return i;
  }
  return 1;
}

function recommend(activities, settings, plannedRests, dayOffset = 0, profile = null) {
  const { hrMax, hrLthr, ftp } = resolveHr(settings, activities);
  const { weeklyHours = 6, weeklyDays = 4, longRides = 1 } = settings || {};
  const levelKey = profile?.level?.key || 'intermediate';
  const allActs = activities.slice();
  const bikeActs = activities.filter(a => a.type && a.type.includes('Ride'));
  const plannedSet = new Set(plannedRests || []);
  const { ref, ago, refIso } = buildDateHelpers(dayOffset);

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
  const _strengthTypesSet = new Set(['WeightTraining', 'Workout', 'Crossfit']);
  const _strengthTitleRx = /corpo\s*libero|corpolibero|bodyweight|body\s*weight|palestra|gym|forza|strength|calistenia|calisthenics|allenamento\s*generico|home\s*workout|circuit|functional|HIIT|tabata|kettlebell|TRX|resistance\s*band|pesi|sala\s*pesi|core\s*training|cross\s*training/i;
  const _isStrength = (a) => _strengthTypesSet.has(a.type) || _strengthTitleRx.test(a.name || '');
  const strengthLast7 = allLast7.filter(_isStrength).length;
  const dow = ref.getDay();
  const isLongRideDay = _isLongRideDay(dow, settings);

  const restDays = restStreak(bikeActs, plannedSet, dayOffset);
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
      : `${escapeHtml(todayAct.name)} · ${Math.round(todayAct.moving_time/60)} min. Conteggio come carico complementare (peso ${typeWeight(todayAct).toFixed(1)}×).`;
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
  try { mFatigue = muscularFatigueScore(allActs, 7); } catch (e) { /* safe */ }
  const isMuscleFatigued = mFatigue > 50;
  let compositeFatigue = null;
  try { compositeFatigue = compositeFatigueScore(allActs, settings); } catch (e) { /* safe */ }

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

  if (yesterday && (isHard(yesterday, hrLthr, ftp) || _isStrength(yesterday))) {
    const note = _isStrength(yesterday)
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
  if (needLong && isLongRideDay) {
    // Durata target: usa longRideMaxMin dell'utente come tetto, scala con freschezza e CTL.
    const userMax = +settings?.longRideMaxMin || 180;
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
    (hardsLast7 < targetHardPerWeek && daysSinceLast >= 1 && ratio < 1.2) ||
    freshBonus || canPushBecauseTomorrowRest;

  if (shouldDoIntensity) {
    const totalHard = last28.filter(a => isHard(a, hrLthr, ftp)).length;
    const s = settings || {};
    // Power profile analysis: identifica deficit per scegliere l'intensità giusta
    const powerProfile = buildPowerProfile(bikeActs, s.weight);
    let deficit = powerProfile?.primaryDeficit?.area;

    // FTP plateau detection: se in plateau, forza un cambio di stimolo
    const ftpTrend = buildFtpTrend();
    if (ftpTrend?.isPlateauDetected && !deficit) {
      // Se in plateau senza deficit chiaro, suggerisci VO2max (il più efficace per sbloccare)
      deficit = 'vo2max';
    }

    // Scelta del tipo di intensità guidata da power profile (se disponibile)
    // altrimenti fallback alla rotazione per livello.
    let phase;
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
    const wattTarget = (pctLow, pctHigh) => ftp
      ? ` (~${Math.round(ftp*pctLow)}–${Math.round(ftp*pctHigh)} W)` : '';

    let rec;
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
    if (deficit) extra.push(`focus: ${powerProfile.primaryDeficit.label}`);
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

function renderTrainingCard(rec, metrics, dayLabel, extraCtx) {
  const freshness = metrics.restDays >= 3 ? '🟢 alta'
    : metrics.restDays === 2 ? '🟢 buona'
    : metrics.restDays === 1 ? '🟡 media'
    : '🔴 bassa';
  const header = dayLabel ? `<div class="rec-day-label">${escapeHtml(dayLabel)}</div>` : '';

  // Composite fatigue / readiness
  const fatigue = extraCtx?.fatigue;
  const readinessHtml = fatigue
    ? `<div><span class="muted">Prontezza</span><b><span class="readiness-badge readiness-${fatigue.readiness}">${fatigue.readiness}</span> ${fatigue.composite}/100</b></div>`
    : '';
  const muscleFatigueHtml = fatigue && fatigue.muscularFatigue > 20
    ? `<div><span class="muted">Fatica musc.</span><b>${fatigue.muscularFatigue}/100</b></div>`
    : '';

  // Mesocycle info
  const meso = extraCtx?.meso;
  let mesoHtml = '';
  try {
    const mesoBlock = meso && typeof MESO_BLOCKS !== 'undefined' ? MESO_BLOCKS.find(b => b.id === meso.blockId) : null;
    mesoHtml = mesoBlock
      ? `<div><span class="muted">Blocco</span><b>${mesoBlock.label.split(' ')[0]} ${meso.weekInBlock+1}/${mesoBlock.weeks}</b></div>`
      : '';
  } catch (e) { /* safe */ }

  return `
    <div class="rec">
      ${header}
      <div class="rec-title">${rec.title}</div>
      <div class="rec-detail">${escapeHtml(rec.detail)}</div>
      <div class="rec-reason muted">${escapeHtml(rec.reason)}</div>
    </div>
    <div class="metrics">
      ${readinessHtml}
      <div><span class="muted">Freschezza</span><b>${freshness}</b></div>
      <div><span class="muted">Gg riposo</span><b>${metrics.restDays}</b></div>
      <div><span class="muted">Carico 7gg</span><b>${metrics.acute.toFixed(0)}</b></div>
      <div><span class="muted">Media sett.</span><b>${metrics.chronic.toFixed(0)}</b></div>
      <div><span class="muted">Rapporto</span><b>${metrics.ratio != null ? metrics.ratio.toFixed(2) : '—'}</b></div>
      <div><span class="muted">Ore 7gg</span><b>${metrics.hoursThisWeek.toFixed(1)}h</b></div>
      <div><span class="muted">Dure 7gg</span><b>${metrics.hardsLast7}</b></div>
      ${muscleFatigueHtml}
      ${mesoHtml}
    </div>
  `;
}

function computeMetrics(activities, settings, plannedRests, dayOffset = 0) {
  const { hrMax, hrLthr, ftp } = resolveHr(settings, activities);
  const allActs = activities.slice();
  const bikeActs = activities.filter(a => a.type && a.type.includes('Ride'));
  const plannedSet = new Set(plannedRests || []);
  const { ago } = buildDateHelpers(dayOffset);
  const allLast7 = allActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 7);
  const allLast28 = allActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 28);
  const last7Bike = bikeActs.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 7);
  const acute = allLast7.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0);
  const chronic = allLast28.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0) / 4;
  const ratio = chronic >= 50 ? acute / chronic : null;
  const hoursThisWeek = allLast7.reduce((s,a) => s + a.moving_time/3600, 0);
  const hardsLast7 = last7Bike.filter(a => isHard(a, hrLthr, ftp)).length;
  const restDays = restStreak(allActs, plannedSet, dayOffset);
  return { acute, chronic, ratio, hoursThisWeek, hardsLast7, restDays };
}

function renderRestPlanner(plannedRests, rainyDays) {
  const skipSet = new Set(plannedRests || []);
  const rainSet = new Set(rainyDays || []);
  const weeks = [];
  const baseMonday = currentMondayOffset();
  for (let w = 0; w < 4; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const offset = baseMonday + w*7 + i;
      const iso = dayOffsetIso(offset);
      const d = new Date(iso);
      const isToday = offset === 0;
      const isPast = offset < 0;
      const label = isToday ? 'Oggi'
        : offset === 1 ? 'Domani'
        : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
      const isSkip = skipSet.has(iso);
      const isRain = rainSet.has(iso);
      const cls = [isSkip ? 'skip' : isRain ? 'rain' : '', isToday ? 'today' : '', isPast ? 'past' : ''].filter(Boolean).join(' ');
      const icon = isSkip ? '⏸️' : isRain ? '🌧️' : '🚴';
      days.push(`<button class="rest-day ${cls}" data-iso="${iso}" title="Click: normale → skip → pioggia">
        <span class="rest-label">${label}</span>
        <span class="rest-icon">${icon}</span>
      </button>`);
    }
    const weekLabel = w === 0 ? 'Settimana corrente' : `Settimana +${w}`;
    weeks.push(`<div class="rest-week-label">${weekLabel}</div><div class="rest-planner">${days.join('')}</div>`);
  }
  return weeks.join('') + `<div class="planner-legend muted">Settimana lun → dom. Click per ciclare: 🚴 allenati → ⏸️ salto → 🌧️ piove (corpo libero).</div>`;
}

function offsetLabel(offset) {
  if (offset === 0) return 'Oggi';
  if (offset === 1) return 'Domani';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
}

// ---- Grafico carico 30 giorni (SVG inline) ----
function renderLoadChart(activities, settings) {
  const { hrMax, hrLthr, ftp } = resolveHr(settings, activities);
  const DAYS = 30;
  const bars = [];
  let maxLoad = 0;
  for (let i = DAYS - 1; i >= 0; i--) {
    const iso = dayOffsetIso(-i);
    const acts = activities.filter(a => isoDay(a.start_date_local) === iso);
    const load = acts.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0);
    const bikeAct = acts.find(a => a.type && a.type.includes('Ride'));
    const hard = !!bikeAct && isHard(bikeAct, hrLthr, ftp);
    const long = acts.some(a => a.type && a.type.includes('Ride') && (a.moving_time||0) >= 120*60);
    const nonBike = acts.some(a => !(a.type && a.type.includes('Ride')));
    maxLoad = Math.max(maxLoad, load);
    bars.push({ iso, load, hard, long, hasActivity: acts.length > 0, nonBike, bike: !!bikeAct });
  }
  const W = 640, H = 150, PAD = 24;
  const bw = (W - PAD*2) / DAYS;
  const scale = maxLoad > 0 ? (H - PAD*2) / maxLoad : 0;
  const svgBars = bars.map((b, i) => {
    const x = PAD + i * bw + 1;
    const h = Math.max(b.load * scale, b.hasActivity ? 2 : 0);
    const y = H - PAD - h;
    const color = b.long ? '#fc5200' : b.hard ? '#ff6b6b'
      : b.bike ? '#4ade80'
      : b.nonBike ? '#8b5cf6'
      : '#2a2e38';
    const tag = b.long ? 'lunga' : b.hard ? 'bici dura' : b.bike ? 'bici easy' : b.nonBike ? 'cross-training' : 'riposo';
    return `<rect x="${x}" y="${y}" width="${bw - 2}" height="${h}" fill="${color}" rx="2">
      <title>${b.iso}: carico ${b.load.toFixed(0)} · ${tag}</title>
    </rect>`;
  }).join('');
  const avgLoad = bars.reduce((s,b) => s + b.load, 0) / DAYS;
  const avgY = H - PAD - avgLoad * scale;
  const avgLine = `<line x1="${PAD}" y1="${avgY}" x2="${W-PAD}" y2="${avgY}" stroke="#9aa0aa" stroke-dasharray="3 3" stroke-width="1" />`;
  const lbl = `<text x="${W-PAD}" y="${avgY-4}" text-anchor="end" fill="#9aa0aa" font-size="10">media giornaliera ${avgLoad.toFixed(0)}</text>`;
  return `
    <svg viewBox="0 0 ${W} ${H}" class="load-chart" preserveAspectRatio="none">
      ${avgLine}${svgBars}${lbl}
    </svg>
    <div class="chart-legend">
      <span><i style="background:#4ade80"></i> bici easy</span>
      <span><i style="background:#ff6b6b"></i> bici dura</span>
      <span><i style="background:#fc5200"></i> lunga</span>
      <span><i style="background:#8b5cf6"></i> cross-training</span>
      <span><i style="background:#2a2e38"></i> riposo</span>
    </div>
  `;
}

// ---- Pianificazione 7 giorni con simulazione ----
// Per proiettare il piano, aggiungo un'"attività sintetica" per ogni giorno pianificato,
// così il giorno successivo considera il lavoro ipotetico di quello precedente.
function synthActivityFromRec(rec, dayOffset, settings) {
  const { hrLthr } = resolveHr(settings);
  const t = rec.title;
  const make = (minutes, hrFactor) => {
    const d = new Date();
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

// ---- Algoritmo pianificazione settimanale ----
// Principi di massima efficienza:
//  1) La lunga sta su Sat/Sun, non altrove.
//  2) Le sessioni dure sono distanziate ≥48h (Martedì/Giovedì è il layout ideale).
//  3) Giorno dopo HARD o LONG = RECOVERY (mai un altro HARD).
//  4) Giorno prima di LONG = EASY o REST (gambe fresche per la lunga).
//  5) I riposi pianificati dall'utente (SKIP) sono intoccabili.
//  6) Se lo stato di forma è scadente (TSB < -15), sostituisco 1 HARD con EASY.
//  7) Volume totale allineato al weeklyDays dichiarato (inclusa lunga).

function pickHardDays(slotsAll, targetHards, preferenceOrder) {
  // Lavora solo sugli slot futuri/oggi (non tocca i passati)
  const slots = slotsAll.filter(s => !s.isPast);
  const chosen = [];
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

// ---- Periodizzazione Mesociclica ----
// Onda 3:1 dentro ogni blocco — 4 settimane: 3 di build progressivo + 1 di deload.
// Pattern classico Coggan/Friel/Issurin (raccomandato anche da Seiler systematic review 2023).
//   week 0 — build1: carico base del blocco
//   week 1 — build2: carico +8% (volume cresce)
//   week 2 — peak: carico +15% rispetto a build1 (massima qualità della fase)
//   week 3 — deload: 65% del peak, intensità mantenuta ma volume tagliato a metà
// Le 4 fasi `phases` controllano il tipo di workout HARD per settimana del blocco
// (es. base = solo SST; threshold cresce SST→Soglia→Potenza→SST scarico).
const MESO_STORAGE = 'biketr_mesocycle';

function loadMesocycle() {
  return safeLoad(MESO_STORAGE, null, (x) => x === null || (typeof x === 'object' && !Array.isArray(x)));
}
function saveMesocycle(m) { safeSave(MESO_STORAGE, m); }

// Moltiplicatori di volume/intensità per settimana del blocco.
// Pattern 'wave' = 3:1 classico (Coggan/Friel). Pattern 'block' = Rønnestad 2014.
const WAVE_PATTERN = {
  loadMul: [1.00, 1.08, 1.15, 0.65],
  roles:   ['build1', 'build2', 'peak', 'deload'],
  // Hard sessions override (null = usa calcolo standard di buildWeekPlan).
  hardOverride: [null, null, null, null],
};
const BLOCK_PATTERN = {
  // Rønnestad 2014: sett 1 carico HIT concentrato, 2-3 LIT/sostegno, 4 scarico.
  loadMul: [1.25, 0.75, 0.75, 0.60],
  roles:   ['block_load', 'block_lit1', 'block_lit2', 'deload'],
  // Sett 1: 5 sessioni HIT. Sett 2-3: max 2 HIT (preferibilmente 1). Sett 4: 1 HIT.
  hardOverride: [5, 1, 2, 1],
};
const BLOCK_WEEK_LABELS = {
  build1: 'Build 1 — carico base',
  build2: 'Build 2 — progressione',
  peak: 'Peak — massima qualità',
  deload: 'Scarico — consolidamento',
  block_load: 'Block — carico HIT concentrato',
  block_lit1: 'Block — recupero attivo (LIT 1)',
  block_lit2: 'Block — recupero attivo (LIT 2)',
};

// Blocchi disponibili: ogni blocco dura sempre 4 settimane (3 build + 1 deload).
// `phases` definisce il workout HARD prevalente per settimana del blocco (4 elementi).
// `pattern`: 'wave' (3:1 classico Coggan/Friel) o 'block' (Rønnestad 2014 — 5 HIT concentrato).
const MESO_BLOCKS = [
  {
    id: 'base', label: 'Base aerobica + Sweet Spot', weeks: 4,
    focus: 'endurance', phases: [0, 0, 1, 0], // SST → SST → Soglia → scarico SST
    pattern: 'wave',
    description: 'Costruzione volume Z2 e Sweet Spot. Poche sessioni intense, molto fondo.',
  },
  {
    id: 'threshold', label: 'Soglia + Over-Unders', weeks: 4,
    focus: 'threshold', phases: [0, 1, 2, 0], // SST → Soglia → Potenza → scarico SST
    pattern: 'wave',
    description: 'Lavoro specifico di soglia. Over-Unders e ripetute FTP per alzare la potenza sostenibile.',
  },
  {
    id: 'vo2max', label: 'VO2max + Potenza', weeks: 4,
    focus: 'vo2max', phases: [1, 2, 2, 0], // Soglia → VO2 → VO2 → scarico SST
    pattern: 'wave',
    description: 'Intervalli ad alta intensità: Seiler 4×8, 4×4, 30/15. Alza il tetto aerobico.',
  },
  {
    id: 'neuromuscular', label: 'Sprint + Forza', weeks: 4,
    focus: 'neuromuscular', phases: [0, 1, 2, 0], // base → forza → potenza → scarico
    pattern: 'wave',
    description: 'Partenze, sprint, forza neuromuscolare. Migliora potenza massima e reattività.',
  },
  {
    // Rønnestad et al. 2014 — Block periodization of HIT.
    // Settimana 1: 5 sessioni HIT concentrate (Lun/Mar/Mer/Gio/Ven) + 2 giorni LIT.
    // Settimane 2-3: solo LIT (Z2 prevalente, max 2 hard sostenuti). Settimana 4: deload.
    // Mostrato superiore al pattern distribuito in ciclisti già allenati (CTL > 70 raccomandato).
    id: 'ronnestad_block', label: 'Block periodization (Rønnestad 2014)', weeks: 4,
    focus: 'vo2max', phases: [2, 0, 0, 0], // sett 1 = VO2 concentrato, 2-3 = SST/LIT, 4 = scarico
    pattern: 'block',
    description: 'Pattern Rønnestad: settimana 1 con 5 sessioni HIT (VO2/soglia) + Z2, settimane 2-3 solo Z2/LIT a ricarica, settimana 4 deload. Raccomandato per atleti allenati (CTL ≥ 70).',
  },
];

// Taper Mujika (Mujika 2018): le 3 settimane prima della gara hanno volume -20/-40/-55%
// con intensità mantenuta. Hard sessions ridotte ma non eliminate (mantenere la
// "qualità" per evitare detraining).
//   Settimana -3 (15–21 giorni prima): taper1 — volume -20%, 2 HARD, durate -25%
//   Settimana -2 (8–14 giorni prima):  taper2 — volume -40%, 2 HARD, durate -40%
//   Settimana -1 (1–7 giorni prima):   taper3 — volume -55%, 1 HARD (opener),
//                                       lunghe corte, race-day off completo
// `raceDateIso` = stringa ISO 'YYYY-MM-DD'. `weekStartIso` = lunedì della settimana
// per cui calcoliamo il ruolo. Restituisce null se non in finestra taper.
function getTaperPhase(raceDateIso, weekStartIso) {
  if (!raceDateIso || !weekStartIso) return null;
  const race = new Date(raceDateIso); race.setHours(0,0,0,0);
  const monday = new Date(weekStartIso); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  // Se la settimana è completamente dopo la gara, non più taper.
  if (monday > race) return null;
  // Giorni dalla domenica della settimana alla data gara.
  const daysToRaceFromMon = Math.round((race - monday) / 86400000);
  if (daysToRaceFromMon > 21) return null;
  let phase, loadMul, hardOverride, label;
  if (daysToRaceFromMon >= 15) { phase = 'taper1'; loadMul = 0.80; hardOverride = 2; label = 'Taper 1 — volume -20%, intensità ok'; }
  else if (daysToRaceFromMon >= 8) { phase = 'taper2'; loadMul = 0.60; hardOverride = 2; label = 'Taper 2 — volume -40%, mantieni qualità'; }
  else if (daysToRaceFromMon >= 1) { phase = 'taper3'; loadMul = 0.45; hardOverride = 1; label = 'Taper 3 — opener + recovery, gara questa settimana'; }
  else { phase = 'race_week'; loadMul = 0.30; hardOverride = 0; label = 'Settimana gara — riposo+opener'; }
  return {
    phase, loadMul, hardOverride,
    daysToRace: daysToRaceFromMon,
    label,
    role: phase, // riusato dal banner UI
    weekInBlock: 0, totalWeeks: 4, // placeholder per compatibilità banner
    blockId: 'taper', blockLabel: 'Taper Mujika',
    blockPattern: 'taper',
    isDeload: true, // taper si comporta come deload per isRecoveryWeek
  };
}

// Dato il mesociclo corrente (con weekInBlock 0..3) e un offset di settimane futuro
// (0 = settimana corrente, 1 = prossima, ecc.), calcola il ruolo della settimana
// nel blocco. Se l'offset supera la fine del blocco corrente, "rolla" sul blocco
// successivo (build1 di nuovo). Restituisce null se mesociclo non inizializzato.
function getWeekRoleInBlock(meso, weekOffset = 0) {
  if (!meso) return null;
  const block = MESO_BLOCKS.find(b => b.id === meso.blockId) || MESO_BLOCKS[0];
  const w = ((meso.weekInBlock || 0) + weekOffset) % block.weeks;
  const pattern = block.pattern === 'block' ? BLOCK_PATTERN : WAVE_PATTERN;
  const role = pattern.roles[w] || pattern.roles[0];
  return {
    role,
    loadMul: pattern.loadMul[w] ?? 1,
    hardOverride: pattern.hardOverride[w], // null = calcolo standard, num = forza N HARD
    weekInBlock: w,
    totalWeeks: block.weeks,
    blockId: block.id,
    blockLabel: block.label,
    blockPattern: block.pattern || 'wave',
    phase: block.phases[w],
    isDeload: role === 'deload',
    label: BLOCK_WEEK_LABELS[role] || '',
  };
}

function initMesocycle(activities, settings) {
  let meso = loadMesocycle();
  const now = new Date();
  now.setHours(0,0,0,0);

  // Power profile per deficit-driven block selection
  const powerProfile = buildPowerProfile(activities.filter(a => a.type?.includes('Ride')), settings?.weight);

  if (!meso || !meso.startDate) {
    // Prima inizializzazione: scegli blocco in base al deficit
    const blockId = deficitToBlock(powerProfile?.recommendedFocus);
    meso = {
      startDate: isoDay(now),
      blockIndex: 0,
      blockId,
      weekInBlock: 0,
      blockHistory: [],
      ftpHistory: [],
    };
    saveMesocycle(meso);
    return meso;
  }

  // Calcola settimana corrente del blocco
  const start = new Date(meso.startDate);
  start.setHours(0,0,0,0);
  const daysSinceStart = Math.round((now - start) / 86400000);
  const weeksSinceStart = Math.floor(daysSinceStart / 7);
  const currentBlock = MESO_BLOCKS.find(b => b.id === meso.blockId) || MESO_BLOCKS[0];

  if (weeksSinceStart >= currentBlock.weeks) {
    // Blocco completato → avanza al prossimo
    meso.blockHistory.push({
      blockId: meso.blockId,
      startDate: meso.startDate,
      endDate: isoDay(now),
      weeks: weeksSinceStart,
    });

    // Scegli prossimo blocco: segui la sequenza o adatta al deficit attuale
    const nextBlockId = chooseNextBlock(meso, powerProfile);
    meso.blockIndex++;
    meso.blockId = nextBlockId;
    meso.startDate = isoDay(now);
    meso.weekInBlock = 0;
    saveMesocycle(meso);
  } else {
    meso.weekInBlock = weeksSinceStart;
  }

  return meso;
}

function deficitToBlock(deficit) {
  if (!deficit) return 'base';
  const map = {
    'vo2max': 'vo2max',
    'threshold': 'threshold',
    'neuromuscular': 'neuromuscular',
    'endurance': 'base',
  };
  return map[deficit] || 'base';
}

function chooseNextBlock(meso, powerProfile) {
  // Se power profile identifica un deficit, prioritizza quello
  if (powerProfile?.primaryDeficit) {
    const deficitBlock = deficitToBlock(powerProfile.primaryDeficit.area);
    // Non ripetere lo stesso blocco due volte di fila
    if (deficitBlock !== meso.blockId) return deficitBlock;
  }

  // Sequenza naturale: base → threshold → vo2max → base (periodizzazione classica)
  const sequence = ['base', 'threshold', 'vo2max'];
  const currentIdx = sequence.indexOf(meso.blockId);
  return sequence[(currentIdx + 1) % sequence.length];
}

// Ritorna la fase (0/1/2) consigliata per la settimana corrente del mesociclo
function mesoPhaseForWeek(meso) {
  const block = MESO_BLOCKS.find(b => b.id === meso.blockId) || MESO_BLOCKS[0];
  const week = Math.min(meso.weekInBlock, block.phases.length - 1);
  return block.phases[week];
}

// Adatta il segment trend alla risposta dell'atleta
// Se i tempi sui segmenti migliorano → conferma protocollo
// Se peggiorano nonostante CTL stabile → overreaching → forza scarico
function athleteResponseCheck(activities, settings) {
  // estimatesFromSegments è sempre disponibile (import statico)
  const segEst = estimatesFromSegments();
  const form = buildFormTrend(activities, settings);
  if (!form) return null;

  const ctl = form.ctl[form.DAYS - 1];
  const ctlPrev = form.ctl[Math.max(0, form.DAYS - 15)];
  const ctlTrend = ctl - ctlPrev;

  // Controlla se FTP stimata è in calo nonostante CTL stabile/crescente
  const meso = loadMesocycle();
  if (meso?.ftpHistory?.length >= 2) {
    const recent = meso.ftpHistory.slice(-2);
    const ftpTrend = recent[1].ftp - recent[0].ftp;
    if (ftpTrend < -5 && ctlTrend >= 0) {
      return {
        status: 'overreaching',
        message: 'FTP in calo nonostante CTL stabile/crescente. Possibile sovrallenamento funzionale. Consiglio: settimana di scarico.',
        ftpTrend,
        ctlTrend: +ctlTrend.toFixed(1),
      };
    }
    if (ftpTrend > 5 && ctlTrend > 0) {
      return {
        status: 'responding',
        message: 'FTP in crescita, il protocollo funziona. Continua il blocco corrente.',
        ftpTrend,
        ctlTrend: +ctlTrend.toFixed(1),
      };
    }
  }

  return {
    status: 'stable',
    message: 'Nessun segnale chiaro di risposta positiva o negativa. Mantieni il piano.',
    ctlTrend: +ctlTrend.toFixed(1),
  };
}

// ---- Training model: analizza 42gg per costruire un profilo di allenamento ----
function buildTrainingModel(activities, settings) {
  const { hrMax, hrLthr, ftp } = resolveHr(settings, activities);
  const now = new Date(); now.setHours(0,0,0,0);
  const daysFromIso = (iso) => {
    const d = new Date(iso); d.setHours(0,0,0,0);
    return Math.round((now - d) / 86400000);
  };
  const WINDOW = 42;
  const acts = activities.filter(a => {
    const da = daysFromIso(a.start_date_local);
    return da >= 0 && da < WINDOW;
  });
  const weeks = WINDOW / 7;

  // 1) Pattern settimanale: per ogni dow conta frequenza e load medio
  const dowStats = Array(7).fill(null).map(() => ({ count: 0, load: 0, hards: 0 }));
  acts.forEach(a => {
    const d = new Date(a.start_date_local);
    const dow = d.getDay();
    dowStats[dow].count++;
    dowStats[dow].load += activityLoad(a, hrMax, hrLthr, ftp);
    if (a.type?.includes('Ride') && isHard(a, hrLthr, ftp)) dowStats[dow].hards++;
  });

  // Giorni preferiti per allenamento: frequenza >= 50%
  const preferredDays = dowStats
    .map((st, dow) => ({ dow, ...st, frequency: st.count / weeks }))
    .filter(d => d.frequency >= 0.5)
    .sort((a, b) => b.frequency - a.frequency)
    .map(d => d.dow);

  // Giorni dow dove metti intensità storicamente (ordinati per frequenza)
  const hardDowHistorical = dowStats
    .map((st, dow) => ({ dow, hards: st.hards, load: st.load }))
    .filter(d => d.hards > 0)
    .sort((a, b) => b.hards - a.hards)
    .map(d => d.dow);

  // 2) Carico settimanale ultime 6 settimane → progressione
  const weeklyLoads = [];
  for (let w = 0; w < weeks; w++) {
    const wk = acts.filter(a => {
      const da = daysFromIso(a.start_date_local);
      return da >= w*7 && da < (w+1)*7;
    });
    weeklyLoads.push(wk.reduce((s,a) => s + activityLoad(a, hrMax, hrLthr, ftp), 0));
  }
  const avgWeeklyLoad = weeklyLoads.reduce((s,l) => s+l, 0) / weeks;
  // Regressione lineare su weekIdx → load (weekIdx 0 = questa settimana)
  const points = weeklyLoads.map((l,i) => ({ x: -i, y: l }));
  const n = points.length;
  const sX = points.reduce((s,p)=>s+p.x,0);
  const sY = points.reduce((s,p)=>s+p.y,0);
  const sXY = points.reduce((s,p)=>s+p.x*p.y,0);
  const sX2 = points.reduce((s,p)=>s+p.x*p.x,0);
  const denom = n*sX2 - sX*sX;
  const progressionPerWeek = denom ? (n*sXY - sX*sY) / denom : 0;

  // 3) Polarizzazione effettiva
  let easyMin = 0, hardMin = 0;
  acts.forEach(a => {
    const mins = (a.moving_time||0) / 60 * typeWeight(a);
    if (hrLthr && a.has_heartrate && a.average_heartrate) {
      if (a.average_heartrate >= hrLthr * 0.88) hardMin += mins;
      else easyMin += mins;
    } else {
      easyMin += mins;
    }
  });
  const totalMin = easyMin + hardMin;
  const polarization = totalMin > 0
    ? { easyPct: easyMin / totalMin, hardPct: hardMin / totalMin, totalMin }
    : null;

  // 4) Target carico settimanale (progressione safe +3% vs media, ±10% se progressione già buona)
  const targetWeeklyLoad = Math.max(avgWeeklyLoad * 1.03, avgWeeklyLoad + 10);

  // 5) Recovery week solo se: 4+ settimane consecutive ad alto carico,
  //    nessuno scarico recente, progressione in crescita. Evita false recovery in stati stabili.
  let consecLoad = 0;
  for (let i = 0; i < weeks; i++) {
    if (weeklyLoads[i] >= avgWeeklyLoad * 0.9) consecLoad++;
    else break;
  }
  const recentWeeks = weeklyLoads.slice(0, 4);
  const hasRecentDeload = recentWeeks.some(l => l < avgWeeklyLoad * 0.65);
  const needsRecoveryWeek = consecLoad >= 4 && !hasRecentDeload && progressionPerWeek > 0;

  return {
    window: WINDOW, weeks,
    preferredDays, hardDowHistorical, dowStats,
    weeklyLoads, avgWeeklyLoad, progressionPerWeek,
    polarization, targetWeeklyLoad,
    consecLoad, needsRecoveryWeek,
  };
}

// `workoutForCategory` è ora un thin wrapper su `v2_workoutForCategory`
// (catalogo evidence-based con citazioni Seiler/Rønnestad/Coggan/Hunter Allen).
// I motivi del passaggio sono in METHODOLOGY.md changelog 2026-05-14.
// L'unica categoria custom è PAST_REST: rappresenta uno slot calendario passato
// senza attività registrata, concetto v1-only legato a buildWeekPlan.
function workoutForCategory(cat, settings, profile, hardIndex = 0, formCtx = null, isRecoveryWeek = false, totalHardsInWeek = 2) {
  if (cat === 'PAST_REST') return {
    title: '⬜ Riposo (non svolto)',
    detail: 'Nessuna attività registrata quel giorno.',
    reason: 'Giornata passata senza allenamento.',
  };
  // Se il profile non ha hrLthr/ftp risolti, integra qui (v2 si aspetta {hrLthr, ftp})
  const resolved = profile?.hrLthr || profile?.ftp ? profile : { ...(profile || {}), ...resolveHr(settings) };
  return v2_workoutForCategory(cat, settings, resolved, hardIndex, formCtx, isRecoveryWeek, totalHardsInWeek);
}

function buildWeekPlan(activities, settings, plannedRests, profile, startOffset = 0, overrideFormCtx = null, rainyDays = null, weekRole = null) {
  const plannedSet = new Set(plannedRests || []);
  const rainySet = new Set(rainyDays || loadRainyDays());
  const { weeklyDays = 4, longRides = 1 } = settings || {};
  const lvl = profile?.level?.key || 'intermediate';
  // Target base intensità: coach italiano suggerisce 3 sessioni fisse/sett
  // (Aerobica Mar + Forza Mer + Potenza Gio) per chi vuole crescere.
  let targetHards;
  if (lvl === 'new') targetHards = 1;
  else if (lvl === 'beginner') targetHards = 2; // aerobica + potenza
  else targetHards = 3; // intermediate+: Aerobica + Forza + Potenza

  const baseHards = targetHards;

  // Stato forma: override da simulazione se presente, altrimenti calcola da storia reale
  const form = buildFormTrend(activities, settings);
  const formCtx = overrideFormCtx || (form ? {
    ctl: form.ctl[form.DAYS-1],
    atl: form.atl[form.DAYS-1],
    tsb: form.tsb[form.DAYS-1],
  } : null);

  const metrics = computeMetrics(activities, settings, plannedRests, 0);
  const model = buildTrainingModel(activities, settings);
  // Deload programmato dal mesociclo OPPURE deload retroattivo dal training model.
  // Il primo prevale: è una decisione di periodizzazione, non reattiva al carico storico.
  const isRecoveryWeek = (weekRole?.isDeload === true) || model.needsRecoveryWeek;
  // Nelle settimane peak riduce le hard di 1 solo se l'utente è realmente sotto-recuperato
  // (TSB normalizzato basso). Nelle settimane build1/build2 il piano cresce normalmente.
  // Nelle settimane deload, riduce sempre la quantità di HARD a 1 (mantieni intensità,
  // taglia volume) salvo livello 'new' che resta a 0.

  // ---- Riconciliazione con attività REALI della settimana calendario (Lun-Dom) ----
  // Rende il piano dinamico: se hai già fatto hard/lunga, i target residui si riducono.
  let effectiveLongRides = longRides;
  let dynReduceHards = 0;
  let dynNote = null;
  if (startOffset === 0) {
    const todayDate = new Date(); todayDate.setHours(0,0,0,0);
    const dow = todayDate.getDay();
    const daysFromMonday = (dow + 6) % 7;
    const monday = new Date(todayDate);
    monday.setDate(monday.getDate() - daysFromMonday);
    const mondayIso = isoDay(monday);
    const todayIsoStr = isoDay(todayDate);
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
  let reductionReason = null;
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

  const slots = [];
  for (let i = 0; i < 7; i++) {
    const globalOffset = startOffset + i;
    const iso = dayOffsetIso(globalOffset);
    const d = new Date(iso);
    slots.push({
      offset: globalOffset, iso, dow: d.getDay(),
      label: offsetLabel(globalOffset),
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
    if (!_isAvailableDay(s.dow, settings)) s.category = 'REST';
  });

  // 2) Lunghe sui giorni configurati (settings.longRideDays, default sabato) — solo su slot NON passati
  const longCandidates = slots.filter(s => _isLongRideDay(s.dow, settings) && !s.category && !s.isPast);
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
    ['LONG','HARD','EASY','RECOVERY','DONE'].includes(s.category)).length;
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
  const strengthTypes = new Set(['WeightTraining', 'Workout', 'Crossfit']);
  const strengthTitleRx = /corpo\s*libero|corpolibero|bodyweight|body\s*weight|palestra|gym|forza|strength|calistenia|calisthenics|allenamento\s*generico|home\s*workout|circuit|functional|HIIT|tabata|kettlebell|TRX|resistance\s*band|pesi|sala\s*pesi|core\s*training|cross\s*training/i;
  const isStrengthAct = (a) => strengthTypes.has(a.type) || strengthTitleRx.test(a.name || '');
  const recentStrengthIsos = new Set(
    activities
      .filter(isStrengthAct)
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
    // Diagnostica: espone il check nella console per debug
    if (startOffset === 0 && s.offset === 0) {
      console.log('[BikeTR rainy-check]', {
        today: s.iso, prevIso,
        prevPlannedStrength, prevRealStrength,
        strengthIsosDetected: Array.from(recentStrengthIsos).sort().slice(-7),
        recentActivities: activities.slice(0,5).map(a => ({
          date: isoDay(a.start_date_local),
          type: a.type,
          name: a.name,
          isStrengthMatch: isStrengthAct(a),
        })),
      });
    }
    if (prevPlannedStrength || prevRealStrength) {
      s.category = 'MOBILITY';
    } else {
      s.category = 'STRENGTH';
    }
  });

  // Assegna indici progressivi per rotazione HARD
  const totalHardsInWeek = slots.filter(s => s.category === 'HARD').length;
  const days = slots.map(s => {
    let rec;
    if (s.category === 'DONE' && s.activity) {
      rec = buildDoneRec(s.activity, settings);
    } else {
      rec = workoutForCategory(
        s.category, settings, profile,
        s.category === 'HARD' ? s.hardSeq : 0,
        formCtx, isRecoveryWeek, totalHardsInWeek
      );
    }
    return {
      offset: s.offset, label: s.label, iso: s.iso,
      rec, category: s.category,
      activity: s.activity || null,
      isPast: s.isPast,
    };
  });
  // Summary diagnostico
  const categoryCount = { HARD:0, LONG:0, EASY:0, RECOVERY:0, REST:0, SKIP:0, STRENGTH:0, REST_RAIN:0, MOBILITY:0, DONE:0, PAST_REST:0 };
  days.forEach(d => { categoryCount[d.category] = (categoryCount[d.category]||0)+1; });

  // Mesocycle info
  const meso = loadMesocycle();
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

// Genera sinteticamente un'attività corrispondente a un workout pianificato.
// Le FC usate sono MEDIE realistiche dell'intera sessione (comprende warmup+rec+defat),
// NON la FC durante gli intervalli (sarebbe più alta). Così load/polarizzazione
// nelle settimane future simulate restano realistici.
function synthFromWorkout(rec, iso, settings) {
  const { hrLthr } = resolveHr(settings);
  const t = rec?.title || '';
  const d = new Date(iso); d.setHours(9,0,0,0);
  const make = (min, hrFrac) => ({
    type: 'Ride',
    start_date_local: d.toISOString(),
    moving_time: min * 60,
    distance: min * 500,
    total_elevation_gain: 0,
    has_heartrate: !!hrLthr,
    average_heartrate: hrLthr ? hrLthr * hrFrac : undefined,
    _synthetic: true,
  });
  if (t.includes('pianificato') || t.includes('😴 Riposo')) return null;
  if (t.includes('Recupero')) return make(50, 0.68);
  if (t.includes('Sweet Spot')) return make(75, 0.83);
  if (t.includes('Over-Unders')) return make(70, 0.85);
  if (t.includes('Soglia')) return make(75, 0.86);
  if (t.includes('VO2 30/30') || t.includes('Intermittenti')) return make(65, 0.85);
  if (t.includes('VO2')) return make(70, 0.87);
  if (t.includes('Capacità Aerobica')) return make(80, 0.82);
  if (t.includes('Forza')) return make(60, 0.75); // sprint brevi: HR media moderata
  if (t.includes('soglia')) return make(75, 0.86);
  if (t.includes('lunga')) return make(135, 0.78);
  if (t.includes('Fondo')) return make(90, 0.77);
  if (t.includes('Riattivazione')) return make(60, 0.73);
  if (t.includes('Corpo libero')) {
    // Circuito a corpo libero: trattato come WeightTraining (peso 0.5)
    const d2 = new Date(iso); d2.setHours(9,0,0,0);
    return {
      type: 'WeightTraining',
      start_date_local: d2.toISOString(),
      moving_time: 45 * 60,
      distance: 0,
      total_elevation_gain: 0,
      has_heartrate: !!hrLthr,
      average_heartrate: hrLthr ? hrLthr * 0.75 : undefined,
      _synthetic: true,
    };
  }
  return null;
}

// Piano 4 settimane: evolve TSB/CTL/ATL giorno per giorno usando i workout simulati,
// così le settimane future riflettono lo stato di forma che AVRESTI seguendo il piano.
function buildMonthPlan(activities, settings, plannedRests, profile) {
  let acts = activities.slice();
  const weeks = [];
  const { hrMax, hrLthr, ftp } = resolveHr(settings, activities);
  const kCTL = 1 - Math.exp(-1/42);
  const kATL = 1 - Math.exp(-1/7);

  // Stato forma iniziale dalla storia reale
  const form0 = buildFormTrend(activities, settings);
  let simCtx = form0 ? {
    ctl: form0.ctl[form0.DAYS-1],
    atl: form0.atl[form0.DAYS-1],
    tsb: form0.tsb[form0.DAYS-1],
  } : null;

  // La settimana 0 inizia dal LUNEDÌ della settimana corrente (può essere offset negativo).
  // Esempio: oggi mercoledì → mondayOffset = -2; settimana 1 inizia a -2+7 = 5 (lunedì prossimo).
  const baseMonday = currentMondayOffset();
  // Mesociclo corrente: ogni settimana w (0..3) eredita un ruolo nell'onda 3:1
  // (build1 / build2 / peak / deload). Se il mesociclo non è inizializzato, weekRole = null
  // e si applica la logica reattiva precedente (model.needsRecoveryWeek).
  // Race date: se nelle ultime 3 settimane prima della gara, override del weekRole
  // con il taper Mujika (prevale sul mesociclo perché finalizzato all'evento).
  const meso = loadMesocycle();
  for (let w = 0; w < 4; w++) {
    const weekStartIso = dayOffsetIso(baseMonday + w * 7);
    const taper = getTaperPhase(settings?.raceDate, weekStartIso);
    const weekRole = taper || getWeekRoleInBlock(meso, w);
    const plan = buildWeekPlan(acts, settings, plannedRests, profile, baseMonday + w * 7, simCtx ? {...simCtx} : null, null, weekRole);
    weeks.push(plan);
    // Avanza simCtx giorno per giorno in base al workout proposto
    plan.days.forEach(d => {
      const synth = synthFromWorkout(d.rec, d.iso, settings);
      const load = synth ? activityLoad(synth, hrMax, hrLthr, ftp) : 0;
      if (simCtx) {
        simCtx.ctl += (load - simCtx.ctl) * kCTL;
        simCtx.atl += (load - simCtx.atl) * kATL;
        simCtx.tsb = simCtx.ctl - simCtx.atl;
      }
      if (synth) acts = [synth, ...acts];
    });
  }
  return weeks;
}

function renderLoadSourceBadge(profile) {
  if (!profile) return '';
  const ftpSrc = profile.ftpDecl ? 'FTP dichiarata ' + profile.ftpDecl + 'W'
    : profile.ftpSource === 'estimated' && profile.ftpEst ? 'FTP stimata ' + profile.ftpEst + 'W (TSS)'
    : null;
  const lthrLabel = profile.lthrSource === 'estimated' && profile.lthrEst
    ? 'LTHR stimata ' + profile.lthrEst + ' bpm'
    : profile.hrLthr ? 'LTHR dichiarata ' + profile.hrLthr + ' bpm' : '—';
  const loadMode = profile.ftp ? '🔋 Load = TSS (potenza)'
    : profile.hrLthr ? '❤️ Load = hrTSS (LTHR)' : '⚠️ Load = proxy HR max';
  return `<div class="load-source muted">
    ${loadMode} · ${ftpSrc || 'FTP non usata'} · ${lthrLabel}
  </div>`;
}

function renderTrainingModel(model, plannedRests, isRecoveryWeek, profile, weekRole = null) {
  if (!model) return '';
  const dowName = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  const skipLine = plannedRests && plannedRests.length
    ? `<div class="muted" style="font-size:.8rem; margin-bottom:.5rem">⏸️ Giorni skip: ${plannedRests.sort().join(', ')}</div>`
    : '';
  const recoveryBanner = isRecoveryWeek
    ? `<div class="recovery-banner">🔄 <b>Settimana di scarico</b> — hai accumulato ${model.consecLoad} settimane di carico consecutive. Questa settimana riduco intensità e volume per consolidare gli adattamenti (principio 3:1 load/recovery).</div>`
    : '';
  const prefDays = model.preferredDays.length
    ? model.preferredDays.map(d => dowName[d]).join(', ')
    : 'nessun pattern regolare rilevato';
  const hardDays = model.hardDowHistorical.length
    ? model.hardDowHistorical.slice(0,3).map(d => dowName[d]).join(', ')
    : '—';
  const progTrend = model.progressionPerWeek > 5 ? `📈 +${model.progressionPerWeek.toFixed(0)}/sett (crescita)`
    : model.progressionPerWeek < -5 ? `📉 ${model.progressionPerWeek.toFixed(0)}/sett (calo)`
    : `➡️ stabile`;
  const pol = model.polarization
    ? `${Math.round(model.polarization.easyPct*100)}% easy / ${Math.round(model.polarization.hardPct*100)}% hard`
    : '—';
  const polStatus = model.polarization
    ? (model.polarization.easyPct >= 0.75 ? '✅' : model.polarization.easyPct >= 0.6 ? '🟡' : '🔴')
    : '';
  // Banner: priorità a taper (se siamo nelle 3 settimane prima della gara), altrimenti mesociclo.
  const meso = loadMesocycle();
  const mesoBlock = meso ? MESO_BLOCKS.find(b => b.id === meso.blockId) : null;
  let mesoBanner = '';
  if (weekRole && weekRole.blockPattern === 'taper') {
    const roleBadge = `<span class="meso-role meso-role-${weekRole.role}">${weekRole.label}</span>`;
    mesoBanner = `<div class="meso-banner">🏁 <b>Fase Taper — ${weekRole.daysToRace} giorni alla gara</b> ${roleBadge}<div class="muted" style="font-size:.78rem; margin-top:.25rem">Volume scalato (×${weekRole.loadMul.toFixed(2)}), intensità mantenuta. Niente nuovi stimoli, mantieni le sensazioni.</div></div>`;
  } else if (mesoBlock && meso) {
    const role = weekRole || getWeekRoleInBlock(meso, 0);
    const nextRole = getWeekRoleInBlock(meso, 1);
    const wIdx = (role?.weekInBlock ?? 0) + 1;
    const wTot = role?.totalWeeks ?? mesoBlock.weeks;
    const roleBadge = role
      ? `<span class="meso-role meso-role-${role.role}">${role.label}</span>`
      : '';
    const nextLine = nextRole
      ? `<div class="muted" style="font-size:.78rem; margin-top:.25rem">Prossima settimana: <b>${nextRole.label}</b> (loadMul ${nextRole.loadMul.toFixed(2)}×).</div>`
      : '';
    mesoBanner = `<div class="meso-banner">📋 <b>Mesociclo: ${mesoBlock.label}</b> · settimana ${wIdx}/${wTot} ${roleBadge}<div class="muted" style="font-size:.78rem; margin-top:.25rem">${mesoBlock.description}</div>${nextLine}</div>`;
  }

  return `
    ${renderLoadSourceBadge(profile)}
    ${skipLine}
    ${recoveryBanner}
    ${mesoBanner}
    <details class="model-details">
      <summary>🧠 Modello di allenamento (analisi 42 giorni)</summary>
      <div class="model-grid">
        <div><span class="muted">Giorni di allenamento abituali</span><b>${prefDays}</b></div>
        <div><span class="muted">Giorni di qualità storici</span><b>${hardDays}</b></div>
        <div><span class="muted">Carico medio settimanale</span><b>${model.avgWeeklyLoad.toFixed(0)}</b></div>
        <div><span class="muted">Progressione</span><b>${progTrend}</b></div>
        <div><span class="muted">Polarizzazione attuale</span><b>${polStatus} ${pol}</b></div>
        <div><span class="muted">Target carico prox sett.</span><b>${model.targetWeeklyLoad.toFixed(0)}</b></div>
      </div>
      <p class="muted" style="font-size:.78rem; margin-top:.5rem">
        Il piano settimanale incrocia questi dati: posiziona le sessioni di qualità sui giorni in cui tipicamente le fai,
        riempie con easy nei giorni abituali, e corregge la polarizzazione se troppo squilibrata verso il hard.
      </p>
    </details>
  `;
}

function buildDoneRec(act, settings) {
  const { hrLthr, ftp } = resolveHr(settings);
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

function renderWeekPlan(plan) {
  return plan.map(p => {
    const iconMatch = p.rec.title.match(/^(\S+)\s/);
    const icon = iconMatch ? iconMatch[1] : '•';
    const titleText = p.rec.title.replace(/^\S+\s/, '');
    const pastClass = p.isPast ? ' plan-past' : '';
    const wrapStart = p.rec._isDone
      ? `<a href="activity.html?id=${p.rec._activityId}" style="text-decoration:none;color:inherit">`
      : '';
    const wrapEnd = p.rec._isDone ? `</a>` : '';
    return `
      <div class="plan-row${pastClass}">
        <div class="plan-day">
          <div class="plan-day-label">${escapeHtml(p.label)}</div>
          <div class="plan-icon">${icon}</div>
        </div>
        ${wrapStart}
        <div class="plan-rec">
          <div class="plan-title">${escapeHtml(titleText)}</div>
          <div class="plan-detail muted">${escapeHtml(p.rec.detail)}</div>
        </div>
        ${wrapEnd}
      </div>
    `;
  }).join('');
}

export {
  estimateFTP, estimateLTHR, resolveHr, levelFromKm, consistencyScore, buildProfile,
  personalRecords, renderRecords, renderProfile, typeWeight, hikeSpecificLoad,
  muscularFatigueScore, activityLoad, isHard, buildDateHelpers, restStreak,
  findNextNonSkipOffset, recommend, renderTrainingCard, computeMetrics, renderRestPlanner,
  offsetLabel, renderLoadChart, synthActivityFromRec, pickHardDays,
  loadMesocycle, saveMesocycle, MESO_BLOCKS, initMesocycle, deficitToBlock,
  chooseNextBlock, mesoPhaseForWeek, athleteResponseCheck, buildTrainingModel,
  workoutForCategory, buildWeekPlan, synthFromWorkout,
  buildMonthPlan, renderLoadSourceBadge, renderTrainingModel, buildDoneRec,
  renderWeekPlan, TYPE_WEIGHTS,
  // Per analysis.js, che li espone con gli altri calcoli della tab Analisi.
  buildFormTrend, compositeFatigueScore, buildFtpTrend,
};
