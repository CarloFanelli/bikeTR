// Tab Allenamento: profilo, consiglio del giorno, calendario dei riposi, grafico del carico
// e piano. I calcoli stanno in src/core/ (il piano in src/core/plan/) e ricevono tutto come
// parametro: qui restano le card e le versioni con i nomi e gli argomenti di prima, che
// leggono l'orologio e i valori salvati nel browser.
import { escapeHtml, fmtKm, fmtTime, dayOffsetIso, loadRainyDays } from './strava.js';
import { estimatesFromSegments } from './predictions.js';
import { buildDateHelpers as dateHelpersFrom } from './src/core/dates.ts';
import { buildFormTrend as formTrendFrom, compositeFatigueScore as compositeFatigueFrom } from './src/core/form.ts';
import { buildFtpTrend as ftpTrendFrom } from './src/core/ftp.ts';
import { estimateFTP as estimateFtpFrom, estimateLTHR, resolveHr as resolveHrFrom } from './src/core/hr.ts';
import {
  TYPE_WEIGHTS, typeWeight, hikeSpecificLoad, muscularFatigueScore as muscularFatigueFrom, activityLoad, isHard,
} from './src/core/load.ts';
import {
  MESO_BLOCKS, getTaperPhase, getWeekRoleInBlock, nextMesocycle, deficitToBlock, chooseNextBlock, mesoPhaseForWeek,
  athleteResponseCheck as responseFrom,
} from './src/core/meso.ts';
import { currentMondayOffset, offsetLabel as offsetLabelFrom } from './src/core/plan/dates.ts';
import { loadChartDays } from './src/core/plan/load-chart.ts';
import { buildTrainingModel as modelFrom } from './src/core/plan/model.ts';
import { buildMonthPlan as monthPlanFrom, synthFromWorkout as synthFromWorkoutFrom } from './src/core/plan/month.ts';
import {
  restStreak as restStreakFrom, findNextNonSkipOffset as nextNonSkipFrom, recommend as recommendFrom,
  computeMetrics as metricsFrom, synthActivityFromRec as synthActivityFrom,
} from './src/core/plan/recommend.ts';
import {
  pickHardDays, workoutForCategory as workoutFrom, buildWeekPlan as weekPlanFrom, buildDoneRec as doneRecFrom,
} from './src/core/plan/week.ts';
import {
  levelFromKm, consistencyScore as consistencyFrom, buildProfile as buildProfileFrom, personalRecords,
} from './src/core/profile.ts';
import { loadFtpHistory, loadMesocycle, saveMesocycle } from './src/data/storage.ts';

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

// Quello che il piano legge dal browser: orologio, segmenti, storico FTP, mesociclo, pioggia.
const planInputs = () => ({
  now: new Date(), segmentEstimates: estimatesFromSegments(), ftpHistory: loadFtpHistory(),
  meso: loadMesocycle(), rainyDays: loadRainyDays(),
});
const restStreak = (allActs, plannedSet, dayOffset) => restStreakFrom(allActs, plannedSet, dayOffset, new Date());
const findNextNonSkipOffset = (plannedSet, maxAhead = 7) => nextNonSkipFrom(plannedSet, maxAhead, new Date());
const recommend = (activities, settings, plannedRests, dayOffset = 0, profile = null) =>
  recommendFrom(activities, settings, plannedRests, dayOffset, profile, planInputs());
const computeMetrics = (activities, settings, plannedRests, dayOffset = 0) =>
  metricsFrom(activities, resolveHr(settings, activities), plannedRests, dayOffset, new Date());
const offsetLabel = (offset) => offsetLabelFrom(offset, new Date());
const synthActivityFromRec = (rec, dayOffset, settings) => synthActivityFrom(rec, dayOffset, settings, planInputs());
const athleteResponseCheck = (activities, settings) => responseFrom(buildFormTrend(activities, settings), loadMesocycle());
const buildTrainingModel = (activities, settings) => modelFrom(activities, resolveHr(settings, activities), new Date());
const workoutForCategory = (cat, settings, profile, hardIndex = 0, formCtx = null, isRecoveryWeek = false, totalHardsInWeek = 2) =>
  workoutFrom(cat, settings, profile, hardIndex, formCtx, isRecoveryWeek, totalHardsInWeek, planInputs());
const buildWeekPlan = (activities, settings, plannedRests, profile, startOffset = 0, overrideFormCtx = null, rainyDays = null, weekRole = null) =>
  weekPlanFrom(activities, settings, plannedRests, profile, startOffset, overrideFormCtx, rainyDays, weekRole, planInputs());
const synthFromWorkout = (rec, iso, settings) => synthFromWorkoutFrom(rec, iso, settings, planInputs());
const buildMonthPlan = (activities, settings, plannedRests, profile) =>
  monthPlanFrom(activities, settings, plannedRests, profile, planInputs());
const buildDoneRec = (act, settings) => doneRecFrom(act, settings, planInputs());

// Il mesociclo di oggi; si salva solo alla prima apertura e quando un blocco finisce.
function initMesocycle(activities, settings) {
  const { meso, changed } = nextMesocycle(loadMesocycle(), activities, settings, new Date());
  if (changed) saveMesocycle(meso);
  return meso;
}

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

function renderRestPlanner(plannedRests, rainyDays) {
  const skipSet = new Set(plannedRests || []);
  const rainSet = new Set(rainyDays || []);
  const weeks = [];
  const baseMonday = currentMondayOffset(new Date());
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

// ---- Grafico carico 30 giorni (SVG inline) ----
function renderLoadChart(activities, settings) {
  const bars = loadChartDays(activities, resolveHr(settings, activities), new Date());
  const DAYS = bars.length;
  const maxLoad = bars.reduce((max, b) => Math.max(max, b.load), 0);
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
  renderWeekPlan, TYPE_WEIGHTS, getTaperPhase, getWeekRoleInBlock,
  // Per analysis.js, che li espone con gli altri calcoli della tab Analisi.
  buildFormTrend, compositeFatigueScore, buildFtpTrend,
};
