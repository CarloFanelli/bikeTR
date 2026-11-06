import {
  loadSettings, saveSettings, getAuthStatus, getAccessToken, purgeLegacyStrava, api,
  applyCachedStreams, hydrateWithStreams, loadPlannedRests, loadRainyDays,
  dayOffsetIso, cycleDayState, escapeHtml, fmtKm, fmtTime, fmtDate, TYPE_EMOJI,
  APP_CONFIG,
} from './strava.js';
import {
  resolveHr, recommend, computeMetrics, buildMonthPlan, findNextNonSkipOffset,
  offsetLabel, renderTrainingCard, renderRestPlanner, renderLoadChart,
  renderTrainingModel, renderWeekPlan, renderLoadSourceBadge, buildProfile,
  personalRecords, renderProfile, initMesocycle, loadMesocycle, MESO_BLOCKS,
} from './training.js';
import {
  buildFormTrend, renderFormTrend, buildPowerCurve, renderPowerCurve,
  buildHrZones, renderHrZones, compositeFatigueScore, renderPowerProfile,
  renderFtpTrend, renderFtpLthrBreakdown, recordFtpPoint,
} from './analysis.js';
import {
  loadSegmentPredictions, hydrateSegmentsFromActivities, clearSegCache,
  renderPredictions, renderSegmentWorkouts,
} from './predictions.js';
import { initCoach } from './coach.js';
import { initExport } from './export.js';

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).hidden = false;
const hide = (id) => $(id).hidden = true;

function showError(msg) {
  const el = $('error');
  el.hidden = false;
  el.querySelector('p').textContent = msg;
}

function renderPrecisionCard(activities, token, stats) {
  const s = loadSettings();
  const profile = resolveHr(s, activities);
  const bikes = activities.filter(a => a.type?.includes('Ride'));
  const withStreams = bikes.filter(a => a._metrics && !a._metrics._error).length;
  const withPower = bikes.filter(a => a.weighted_average_watts || a.average_watts).length;
  const withHR = bikes.filter(a => a.has_heartrate).length;

  const loadMode = profile.ftp
    ? (withStreams > 0 ? `🔋 <b>TSS da streams</b> (${withStreams} attività) + TSS approssimato` : `🔋 <b>TSS approssimato</b> (Weighted Avg summary)`)
    : profile.hrLthr
    ? (withStreams > 0 ? `❤️ <b>hrTSS da streams</b> (${withStreams} attività) + hrTSS approssimato` : `❤️ <b>hrTSS approssimato</b>`)
    : `⚠️ <b>Proxy HR-max</b> (meno preciso, imposta LTHR per upgrade)`;

  const ftpBreakdown = [];
  if (profile.ftpEstFromActivities) ftpBreakdown.push(`${profile.ftpEstFromActivities}W da attività`);
  if (profile.ftpEstFromSegments) ftpBreakdown.push(`${profile.ftpEstFromSegments}W da segmenti`);
  const ftpInfo = profile.ftpDecl
    ? `<b>${profile.ftpDecl} W</b> (dichiarata)`
    : profile.ftpEst
    ? `<b>${profile.ftpEst} W</b>${ftpBreakdown.length ? ' <span class="muted" style="font-size:.75rem">(' + ftpBreakdown.join(' / ') + ')</span>' : ''}`
    : '—';
  const lthrBreakdown = [];
  if (profile.lthrEstFromActivities) lthrBreakdown.push(`${profile.lthrEstFromActivities} da attività`);
  if (profile.lthrEstFromSegments) lthrBreakdown.push(`${profile.lthrEstFromSegments} da segmenti`);
  const lthrInfo = profile.lthrSource === 'declared' && profile.lthrDecl
    ? `<b>${profile.lthrDecl} bpm</b> (dichiarata)`
    : profile.lthrEst
    ? `<b>${profile.lthrEst} bpm</b>${lthrBreakdown.length ? ' <span class="muted" style="font-size:.75rem">(' + lthrBreakdown.join(' / ') + ')</span>' : ''}`
    : '—';

  $('precision-info').innerHTML = `
    <div class="precision-mode">${loadMode}</div>
    <div class="metrics" style="margin-top:.5rem">
      <div><span class="muted">FTP</span>${ftpInfo}</div>
      <div><span class="muted">LTHR</span>${lthrInfo}</div>
      <div><span class="muted">Attività con potenza</span><b>${withPower}/${bikes.length}</b></div>
      <div><span class="muted">Attività con FC</span><b>${withHR}/${bikes.length}</b></div>
      <div><span class="muted">Streams precisi</span><b>${withStreams}/${Math.min(APP_CONFIG.maxStreamsFetch,bikes.length)}</b></div>
    </div>
    <details style="margin-top:.75rem">
      <summary class="muted">Come vengono stimati FTP e LTHR?</summary>
      <div style="font-size:.85rem; margin-top:.5rem; line-height:1.5">
        <p><b>FTP stimata</b> — prende il MAX tra <i>attività</i> e <i>segmenti</i>; se non c'è FTP dichiarata, viene usata questa.</p>
        <p><i>Da attività</i> (<code>estimateFTP</code>): power-duration model su quattro bucket di durata (10–20', 20–40', 40–90', e fallback &lt;10'), best per bucket pesato per recency (half-life ≈ 8 settimane). Coefficiente classico Coggan/Allen <code>×0.95</code> per il bucket 20–40'.</p>
        <p><i>Da segmenti</i> (<code>estimatesFromSegments</code>): quattro metodi, scelto quello con confidenza più alta:</p>
        <ul>
          <li><b>best 15–30'</b> × 0.95 (retrocompatibile, confidenza 0.7)</li>
          <li><b>weighted recent</b> × 0.95: stesso bucket pesato per recency exp(-età/12 settimane) (confidenza 0.75)</li>
          <li><b>suitable climb</b>: best effort 15–40' solo su segmenti di salita 3–12% con ≥40m dislivello e ≥1.5km (elimina drafting/vento, confidenza 0.9)</li>
          <li><b>power-duration model</b>: triangolazione su 5 bucket di durata con fattori specifici, media (confidenza 0.85)</li>
        </ul>
        <p><b>LTHR stimata</b> — prende il MAX tra:</p>
        <ul>
          <li><b>M1</b>: <code>HRmax osservato × 0.91</code> (media letteratura Friel/Coggan/Allen 88–92%)</li>
          <li><b>M2</b>: <code>best avg HR in attività 20–60'</code> × 0.98, solo dove il max HR era ≥ 90% dell'HRmax osservato</li>
          <li><b>M3</b>: <code>best avg HR su segmenti 15–45'</code> × 0.98 — sforzi all-out tipici, più affidabili</li>
        </ul>
        <p><b>Limitazioni senza streams</b>: il <i>Weighted Avg</i> del summary Strava è una NP approssimata, non precisa. Con gli streams (serie secondo-per-secondo) calcolo NP vera con rolling 30s, TSS chirurgico, minuti per zona HR effettivi. Clicca "Aggiorna con streams" per scaricarli (1 chiamata API/attività, rate limit Strava 100/15min).</p>
      </div>
    </details>
  `;
  show('precision-section');

  $('hydrate-btn').onclick = async () => {
    $('hydrate-btn').disabled = true;
    $('hydrate-progress').textContent = 'Avvio…';
    try {
      await hydrateWithStreams(activities, token, profile.ftp, profile.hrLthr, APP_CONFIG.maxStreamsFetch, (d, t) => {
        $('hydrate-progress').textContent = `Scarico streams: ${d}/${t}`;
      });
      $('hydrate-progress').textContent = '✅ Cache aggiornata. Ricalcolo…';
      renderPrecisionCard(activities, token, stats);
      renderTraining(activities, stats);
    } catch (e) {
      $('hydrate-progress').textContent = '❌ ' + e.message;
    } finally {
      $('hydrate-btn').disabled = false;
    }
  };
}


function setView(name) {
  const views = ['home','training','analysis','activities','coach'];
  if (!views.includes(name)) name = 'home';
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  views.forEach(v => {
    document.querySelectorAll('.view-' + v).forEach(el => {
      if (v === name) {
        el.hidden = false;
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  });
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1) || 'home'));
  setView(location.hash.slice(1) || 'home');
  show('main-nav');
}

function renderAthlete(a, stats) {
  $('athlete-avatar').src = a.profile;
  $('athlete-name').textContent = `${a.firstname} ${a.lastname}`;
  $('athlete-location').textContent = [a.city, a.country].filter(Boolean).join(', ');
  const s = stats || {};
  const totals = [
    ['🚴 Bici (all-time)', s.all_ride_totals],
    ['🏃 Corsa (all-time)', s.all_run_totals],
    ['🏊 Nuoto (all-time)', s.all_swim_totals],
  ].filter(([_, t]) => t && t.count);
  $('athlete-stats').innerHTML = totals.map(([label, t]) =>
    `<div>${label}: <b>${fmtKm(t.distance)}</b> · ${t.count} att.</div>`
  ).join('');
  show('athlete');
}

function renderActivities(list) {
  $('activities-list').innerHTML = list.map(a => `
    <li data-id="${a.id}" class="act-row">
      <div>
        <div class="act-title">${TYPE_EMOJI[a.type] || '•'} ${escapeHtml(a.name)}</div>
        <div class="act-meta">${fmtDate(a.start_date_local)} · ${a.type}${a.average_heartrate ? ' · FC ' + Math.round(a.average_heartrate) : ''}</div>
      </div>
      <div class="act-stats">
        <div><b>${fmtKm(a.distance)}</b></div>
        <div class="act-meta">${fmtTime(a.moving_time)} · ↑${Math.round(a.total_elevation_gain)}m</div>
      </div>
    </li>
  `).join('');
  document.querySelectorAll('.act-row').forEach(el => {
    el.addEventListener('click', () => {
      window.location.href = 'activity.html?id=' + el.dataset.id;
    });
  });
  show('activities');
}

// DOW: dow ISO con lunedì = 1, domenica = 7. Internamente JS usa 0=Domenica…6=Sabato;
// per UI/persistenza usiamo ISO (1..7). I helper bridge li convertono.
const DOW_LABELS_ISO = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function _renderDowRow(containerId, selectedIsoSet) {
  const el = $(containerId);
  el.innerHTML = DOW_LABELS_ISO.map((lbl, i) => {
    const iso = i + 1;
    const active = selectedIsoSet.has(iso);
    return `<button type="button" class="dow-btn${active ? ' active' : ''}" data-iso="${iso}">${lbl}</button>`;
  }).join('');
  el.querySelectorAll('.dow-btn').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      b.classList.toggle('active');
    });
  });
}
function _readDowRow(containerId) {
  return Array.from($(containerId).querySelectorAll('.dow-btn.active')).map(b => +b.dataset.iso);
}

function bindSettings(activities, stats) {
  const s = loadSettings();
  const profile = resolveHr(s, activities);
  $('hr-max').value = s.hrMax || '';
  $('hr-lthr').value = s.hrLthr || '';
  $('hr-lthr-est').value = profile.lthrEst || '';
  $('lthr-source').value = s.lthrSource || (s.hrLthr ? 'declared' : 'estimated');
  $('ftp-decl').value = s.ftpDeclared || '';
  $('ftp-est').value = profile.ftpEst || '';
  $('ftp-source').value = s.ftpSource || 'estimated';
  $('weekly-hours').value = s.weeklyHours || 6;
  $('weekly-days').value = s.weeklyDays || 4;
  $('long-rides').value = s.longRides ?? 1;
  $('weight').value = s.weight || '';
  $('strength-level').value = s.strengthLevel || 2;
  $('long-ride-max-min').value = s.longRideMaxMin || '';
  _renderDowRow('available-days-row', new Set(s.availableDays || [1,2,3,4,5,6,7]));
  _renderDowRow('long-ride-days-row', new Set(s.longRideDays || [6]));
  $('race-date').value = s.raceDate || '';
  $('race-name').value = s.raceName || '';
  $('has-compression').checked = !!s.hasCompression;
  $('has-massage-gun').checked = !!s.hasMassageGun;
  $('save-settings').addEventListener('click', () => {
    const next = {
      hrMax: +$('hr-max').value || undefined,
      hrLthr: +$('hr-lthr').value || undefined,
      weeklyHours: +$('weekly-hours').value || 6,
      weeklyDays: +$('weekly-days').value || 4,
      longRides: +$('long-rides').value || 0,
      weight: +$('weight').value || undefined,
      strengthLevel: +$('strength-level').value || 2,
      ftpDeclared: +$('ftp-decl').value || undefined,
      lthrSource: $('lthr-source').value,
      ftpSource: $('ftp-source').value,
      availableDays: _readDowRow('available-days-row'),
      longRideDays: _readDowRow('long-ride-days-row'),
      longRideMaxMin: +$('long-ride-max-min').value || undefined,
      raceDate: $('race-date').value || undefined,
      raceName: $('race-name').value.trim() || undefined,
      hasCompression: $('has-compression').checked,
      hasMassageGun: $('has-massage-gun').checked,
    };
    saveSettings(next);
    renderTraining(activities, stats);
  });
}

function renderTraining(activities, stats) {
  const s = loadSettings();
  const rests = loadPlannedRests();
  const plannedSet = new Set(rests);
  const profile = buildProfile(stats, activities, s);

  // Inizializza/aggiorna mesociclo
  try { initMesocycle(activities, s); }
  catch (e) { console.warn('[BikeTR] initMesocycle error:', e); }
  // Registra punto FTP per trend tracking
  try { recordFtpPoint(s, activities); }
  catch (e) { console.warn('[BikeTR] recordFtpPoint error:', e); }

  const records = personalRecords(activities);
  $('profile-card').innerHTML = renderProfile(profile, records);
  show('profile-section');

  // Contesto extra per la training card (prontezza, mesociclo)
  const extraCtx = {
    fatigue: compositeFatigueScore(activities, s),
    meso: loadMesocycle(),
  };

  let html = '';
  const rec = recommend(activities, s, rests, 0, profile);
  const metrics = computeMetrics(activities, s, rests, 0);
  html += renderTrainingCard(rec, metrics, null, extraCtx);

  if (plannedSet.has(dayOffsetIso(0))) {
    const nextOffset = findNextNonSkipOffset(plannedSet);
    const recNext = recommend(activities, s, rests, nextOffset, profile);
    const metricsNext = computeMetrics(activities, s, rests, nextOffset);
    html += `<h3 style="margin-top:1.25rem">Anteprima prossimo allenamento</h3>`;
    html += renderTrainingCard(recNext, metricsNext, offsetLabel(nextOffset), extraCtx);
  }

  $('training-card').innerHTML = html;
  $('rest-planner-wrap').innerHTML = renderRestPlanner(rests, loadRainyDays());

  $('load-chart').innerHTML = renderLoadChart(activities, s);
  show('load-chart-section');

  $('form-trend').innerHTML = renderFormTrend(buildFormTrend(activities, s), activities, s);
  show('form-trend-section');

  $('power-curve').innerHTML = renderPowerCurve(buildPowerCurve(activities, s.weight), resolveHr(s, activities), s);
  show('power-curve-section');

  $('hr-zones').innerHTML = renderHrZones(buildHrZones(activities, s));
  show('hr-zones-section');

  $('power-profile').innerHTML = renderPowerProfile(activities, s.weight);
  show('power-profile-section');

  $('ftp-trend').innerHTML = renderFtpTrend();
  show('ftp-trend-section');

  $('ftp-lthr-breakdown').innerHTML = renderFtpLthrBreakdown(activities, s);
  show('ftp-lthr-breakdown-section');

  const monthPlan = buildMonthPlan(activities, s, rests, profile);
  const firstWeek = monthPlan[0];
  const hrProfile = resolveHr(s, activities);
  let planHtml = renderTrainingModel(firstWeek.model, firstWeek.plannedRests, firstWeek.isRecoveryWeek, hrProfile, firstWeek.weekRole);
  monthPlan.forEach((wp, i) => {
    const start = new Date(wp.days[0].iso);
    const end = new Date(wp.days[6].iso);
    const fmt = d => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    const label = `Settimana ${i + 1} (${fmt(start)} → ${fmt(end)})`;
    // Banner ruolo: deload mostrato in verde, peak in arancio, build in giallo/azzurro.
    let roleBanner = '';
    if (wp.weekRole) {
      const r = wp.weekRole;
      const emojiMap = { build1: '🔵', build2: '🟡', peak: '🟠', deload: '🟢', block_load: '🔴', block_lit1: '🟦', block_lit2: '🟦', taper1: '🏁', taper2: '🏁', taper3: '🏁', race_week: '🏆' };
      const emoji = emojiMap[r.role] || '🔵';
      const detail = r.blockPattern === 'taper'
        ? `· ${r.daysToRace} giorni alla gara${s.raceName ? ` (${escapeHtml(s.raceName)})` : ''} · volume ×${r.loadMul.toFixed(2)}`
        : `· sett. ${r.weekInBlock + 1}/${r.totalWeeks} del blocco · volume ×${r.loadMul.toFixed(2)}`;
      roleBanner = `<div class="recovery-banner role-${r.role}" style="margin-bottom:.5rem">${emoji} <b>${r.label}</b> ${detail}</div>`;
    } else if (wp.isRecoveryWeek) {
      roleBanner = `<div class="recovery-banner" style="margin-bottom:.5rem">🔄 Settimana di scarico (retroattivo)</div>`;
    }
    const dbg = wp.debug;
    const counts = Object.entries(dbg.categoryCount).filter(([,v])=>v>0).map(([k,v])=>`${k}:${v}`).join(' · ');
    const reasonLine = dbg.reductionReason ? ` · riduzione: ${dbg.reductionReason}` : '';
    const dynLine = dbg.dynReconciliation ? `<br>🔄 Riconciliazione settimana: ${dbg.dynReconciliation}` : '';
    const diag = `<div class="week-diag muted">🎯 HARD target: ${dbg.targetHards}/${dbg.baseHards} · livello: ${dbg.lvl} · TSB: ${dbg.tsb ?? '—'} · ratio: ${dbg.ratio}${dbg.polHardPct ? ' · pol hard: ' + dbg.polHardPct : ''}${reasonLine}${dynLine}<br>Composizione: ${counts}</div>`;
    planHtml += `<details class="week-block" ${i === 0 ? 'open' : ''}>
      <summary>${label}</summary>
      ${roleBanner}
      ${diag}
      ${renderWeekPlan(wp.days)}
    </details>`;
  });
  $('week-plan').innerHTML = planHtml;
  show('week-plan-section');
  document.querySelectorAll('.rest-day').forEach(btn => {
    btn.addEventListener('click', () => {
      cycleDayState(btn.dataset.iso);
      renderTraining(activities, stats);
    });
  });
  show('training');
}

// Il server di autenticazione, al ritorno da Strava, rimanda qui con ?auth_error=…
const AUTH_CALLBACK_ERRORS = {
  denied: 'Autorizzazione negata su Strava: BikeTR non è stato collegato.',
  state: 'Ritorno da Strava non valido o scaduto: riprova con "Collega Strava".',
  rejected: 'Strava ha rifiutato il collegamento. Controlla STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET nel file .env, poi esegui di nuovo docker compose up -d.',
  unreachable: 'Strava non raggiungibile durante il collegamento. Riprova tra poco.',
};

// Senza credenziali nel .env indica quali mancano, altrimenti offre "Collega Strava".
function showSetup(missing) {
  $('setup-missing-names').textContent = missing.join(' e ');
  $('setup-missing').hidden = !missing.length;
  $('connect-strava').hidden = missing.length > 0;
  show('setup');
}

async function main() {
  purgeLegacyStrava();

  $('connect-strava').addEventListener('click', () => {
    window.location.href = '/auth/login';
  });
  $('logout').addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
    // Le corse salvate dal servizio Coach appartengono al collegamento. Dopo il
    // logout nessuna richiesta del Coach può ottenere un nuovo token.
    await fetch('/coach/forget', { method: 'POST' }).catch(() => {});
    window.location.reload();
  });

  const params = new URLSearchParams(window.location.search);
  const authError = params.get('auth_error');
  if (authError) {
    const detail = params.get('detail');
    showError((AUTH_CALLBACK_ERRORS[authError] || authError) + (detail ? ` Risposta di Strava: ${detail}.` : ''));
    // Una ricarica della pagina non ripete il messaggio.
    window.history.replaceState({}, '', window.location.pathname);
  }

  show('loading');
  try {
    const status = await getAuthStatus();
    if (status.missing.length || !status.connected) {
      hide('loading');
      showSetup(status.missing);
      return;
    }
    const token = await getAccessToken();
    const athlete = await api('/athlete', token);
    const stats = await api(`/athletes/${athlete.id}/stats`, token);
    // Carico 60 attività per avere abbastanza storico per il consiglio
    const activities = await api('/athlete/activities?per_page=60', token);
    hide('loading');
    $('auth-status').textContent = `Connesso come ${athlete.firstname}`;
    $('logout').hidden = false;

    // Applica metriche da streams già in cache (ricariche successive sono istantanee)
    applyCachedStreams(activities);
    renderPrecisionCard(activities, token, stats);

    bindSettings(activities, stats);
    renderTraining(activities, stats);
    renderAthlete(athlete, stats);
    renderActivities(activities.slice(0, 15));
    try { initCoach(activities); }
    catch (e) { console.warn('[BikeTR] initCoach error:', e); }
    try { initExport({ athlete, stats }); }
    catch (e) { console.warn('[BikeTR] initExport error:', e); }
    initNav();

    show('predictions-section');
    loadSegmentPredictions(token, (done, total, errors) => {
      $('predictions-loading').textContent = `Carico segmenti ${done}/${total}${errors ? ' (errori: ' + errors + ')' : ''}…`;
    }).then(async ({list, diag}) => {
      $('predictions-loading').style.display = 'none';
      const starredIdsForHydrate = list.map(e => e.segment.id).concat(diag.errors.map(e => e.id));

      $('hydrate-segments-btn').onclick = async () => {
        $('hydrate-segments-btn').disabled = true;
        $('hydrate-segments-progress').textContent = 'Scarico dettagli attività…';
        // Recupera tutti gli ID dei preferiti per il filtro
        const allStarred = [];
        for (let page = 1; page <= 10; page++) {
          const batch = await api(`/segments/starred?per_page=50&page=${page}`, token);
          allStarred.push(...batch.map(s => s.id));
          if (batch.length < 50) break;
        }
        const result = await hydrateSegmentsFromActivities(activities, token, APP_CONFIG.maxSegmentsHydrate, allStarred, (d, t) => {
          $('hydrate-segments-progress').textContent = `Attività ${d}/${t}…`;
        });
        $('hydrate-segments-progress').textContent = `✅ Scaricate ${result.fetched} attività, aggiunti ${result.addedEfforts} efforts. Ricarico…`;
        setTimeout(() => window.location.reload(), 800);
      };
      const s = loadSettings();
      const form = buildFormTrend(activities, s);
      const formCtx = { ctl: form.ctl[form.DAYS-1], tsb: form.tsb[form.DAYS-1] };
      // Diagnostica pubblicata sopra le card
      const errList = diag.errors.length
        ? `<details style="margin:.5rem 0"><summary class="muted">⚠️ ${diag.errors.length} errori (click per dettagli)</summary>
             <pre style="font-size:.7rem; white-space:pre-wrap; margin-top:.3rem">${diag.errors.slice(0,20).map(e=>`${e.name}: ${e.msg}`).join('\n')}</pre>
           </details>`
        : '';
      const diagLine = `<div class="muted" style="font-size:.8rem; margin-bottom:.5rem">
        📊 ${diag.totalStarred} segmenti preferiti · ${diag.withEfforts} con tentativi · ${diag.noEfforts} senza tentativi · ${diag.errors.length} errori · ${diag.fromCache} da cache / ${diag.fetched} scaricati ora
        <button id="clear-seg-cache" style="margin-left:.5rem; font-size:.75rem; padding:.2rem .5rem">🔄 Svuota cache e ricarica</button>
      </div>${errList}`;
      $('predictions').innerHTML = diagLine + renderPredictions(list, formCtx);
      const clearBtn = document.getElementById('clear-seg-cache');
      if (clearBtn) clearBtn.onclick = () => { clearSegCache(); window.location.reload(); };

      // Segment-targeted workouts
      if (list.length > 0) {
        const hrProf = resolveHr(s, activities);
        $('segment-workouts').innerHTML = renderSegmentWorkouts(list, hrProf.ftp, hrProf.hrLthr);
        show('segment-workouts-section');
      }

      renderPrecisionCard(activities, token, stats);
    }).catch(e => {
      $('predictions-loading').textContent = 'Errore caricamento segmenti: ' + e.message;
    });
  } catch (e) {
    hide('loading');
    if (e.code === 'not_connected') showSetup([]);
    else showError(e.message);
  }
}

main();
