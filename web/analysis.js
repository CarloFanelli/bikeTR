// Analisi approfondita: Power Curve + FTP stimato, Trend forma (CTL/ATL/TSB), Zone FC.
// I calcoli stanno in src/core/ e ricevono tutto come parametro: qui restano le card e
// le versioni con i nomi e gli argomenti di prima, che leggono orologio e valori salvati.
import { escapeHtml, fmtDate } from './strava.js';
import {
  resolveHr, buildFormTrend, compositeFatigueScore, buildFtpTrend,
  loadMesocycle, saveMesocycle, MESO_BLOCKS, athleteResponseCheck,
} from './training.js';
import { estimatesFromSegments } from './predictions.js';
import { formInsights as formInsightsFrom, crossTrainingInsights as crossTrainingFrom } from './src/core/form.ts';
import {
  buildFtpBreakdown as ftpBreakdownFrom, buildFtpInsights, buildLthrBreakdown, nextFtpHistory,
} from './src/core/ftp.ts';
import { buildHrZones as hrZonesFrom } from './src/core/hr.ts';
import { buildPowerCurve, buildPowerProfile } from './src/core/power.ts';
import { loadFtpHistory, saveFtpHistory } from './src/data/storage.ts';

// Le card Forma e Zone FC usano soglia e FTP senza le stime dalle attività: contano
// solo i valori dichiarati e i segmenti (resolveHr senza attività).
function formInsights(data, activities, settings) {
  const { hrLthr, ftp } = resolveHr(settings);
  const meso = loadMesocycle();
  const block = meso && MESO_BLOCKS.find(b => b.id === meso.blockId);
  return formInsightsFrom(data, activities, {
    hrLthr, ftp, now: new Date(),
    ftpTrend: buildFtpTrend(),
    meso: block ? { label: block.label, weeks: block.weeks, description: block.description, weekInBlock: meso.weekInBlock } : null,
    response: athleteResponseCheck(activities, settings),
  });
}
const buildHrZones = (activities, settings) => hrZonesFrom(activities, resolveHr(settings).hrLthr, new Date());
const crossTrainingInsights = (activities) => crossTrainingFrom(activities, new Date());
const buildFtpBreakdown = (activities) => ftpBreakdownFrom(activities, new Date());

// Registra il punto FTP di oggi (chiamato su ogni renderTraining): un salvataggio per
// caricamento, e lo stesso punto negli ultimi 20 del mesociclo.
function recordFtpPoint(settings, activities) {
  const history = nextFtpHistory(loadFtpHistory(), resolveHr(settings, activities), new Date());
  if (!history) return;
  saveFtpHistory(history);
  const meso = loadMesocycle();
  if (meso) {
    const { date, ftp } = history[history.length - 1];
    meso.ftpHistory = [...(meso.ftpHistory || []), { date, ftp }].slice(-20);
    saveMesocycle(meso);
  }
}

function renderPowerCurve(data, profile, settings) {
  if (!data) return '<p class="muted">Nessuna attività con dati di potenza. Serve un misuratore di potenza sulla bici.</p>';
  const max = Math.max(...data.buckets.filter(b => b.best).map(b => b.best.watts), 1);
  const rows = data.buckets.map(b => {
    if (!b.best) return `<div class="pdc-row"><span class="pdc-label">${b.label}</span><span class="muted">— nessun dato</span><span></span></div>`;
    const pct = (b.best.watts / max) * 100;
    return `<div class="pdc-row">
      <span class="pdc-label">${b.label}</span>
      <span class="pdc-bar"><span style="width:${pct}%"></span></span>
      <a class="pdc-val" href="activity.html?id=${b.best.act.id}">${Math.round(b.best.watts)} W</a>
    </div>`;
  }).join('');

  // Nuova FTP card che rispecchia resolveHr: dichiarata > max(attività, segmenti)
  const weight = settings?.weight;
  const wkg = (w) => (w && weight) ? ` · ${(w/weight).toFixed(2)} W/kg` : '';
  let ftpCard = '';
  if (profile) {
    const effective = profile.ftpDecl || profile.ftpEst;
    if (effective) {
      const sources = [];
      if (profile.ftpDecl) sources.push(`<b>dichiarata: ${profile.ftpDecl}W</b>`);
      if (profile.ftpEstFromActivities) sources.push(`da attività: ${profile.ftpEstFromActivities}W`);
      if (profile.ftpEstFromSegments) sources.push(`da segmenti: ${profile.ftpEstFromSegments}W`);
      const activeSource = profile.ftpDecl ? 'dichiarata'
        : profile.ftpEstFromSegments >= profile.ftpEstFromActivities ? 'segmenti' : 'attività';
      ftpCard = `<div class="ftp-card">
        <div class="muted">FTP effettiva (usata nei calcoli)</div>
        <div class="ftp-value">${effective} W${wkg(effective)}</div>
        <div class="muted" style="font-size:.8rem">Sorgente attiva: <b>${activeSource}</b></div>
        <div class="muted" style="font-size:.75rem; margin-top:.25rem">Tutte le sorgenti: ${sources.join(' · ')}</div>
        <div class="muted" style="font-size:.72rem; margin-top:.4rem">Regola: FTP dichiarata prevale. Altrimenti prendo il MAX tra attività (best WAP 20-60' × 0.95) e segmenti (best avg W 15-30' × 0.95). Per la precisione massima: test FTP dedicato di 20' all-out.</div>
      </div>`;
    }
  } else if (data.ftp) {
    // Fallback se non c'è profile
    ftpCard = `<div class="ftp-card">
      <div class="muted">FTP stimata</div>
      <div class="ftp-value">${data.ftp} W${wkg(data.ftp)}</div>
    </div>`;
  }
  return ftpCard + `<div class="pdc">${rows}</div>`;
}

function renderFormTrend(data, activities, settings) {
  const { ctl, atl, tsb, DAYS } = data;
  const W = 640, H = 200, PAD = 30;
  const all = [...ctl, ...atl, ...tsb, 0];
  const maxY = Math.max(...all), minY = Math.min(...all);
  const range = Math.max(maxY - minY, 1);
  const xStep = (W - PAD*2) / (DAYS - 1);
  const toY = v => H - PAD - ((v - minY) / range) * (H - PAD*2);
  const path = arr => arr.map((v, i) => `${i===0?'M':'L'}${(PAD + i*xStep).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  const zeroY = toY(0);
  const cur = { ctl: ctl[DAYS-1], atl: atl[DAYS-1], tsb: tsb[DAYS-1] };
  const status = cur.tsb > 5 ? '🟢 fresco' : cur.tsb > -10 ? '🟡 neutro' : cur.tsb > -20 ? '🟠 affaticato' : '🔴 sovraccarico';
  return `
    <svg viewBox="0 0 ${W} ${H}" class="form-chart">
      <line x1="${PAD}" y1="${zeroY}" x2="${W-PAD}" y2="${zeroY}" stroke="#2a2e38" stroke-dasharray="2 2"/>
      <path d="${path(ctl)}" fill="none" stroke="#4ade80" stroke-width="2"/>
      <path d="${path(atl)}" fill="none" stroke="#ff6b6b" stroke-width="2"/>
      <path d="${path(tsb)}" fill="none" stroke="#fc5200" stroke-width="2" stroke-dasharray="4 3"/>
    </svg>
    <div class="chart-legend">
      <span><i style="background:#4ade80"></i> CTL (fitness, 42gg)</span>
      <span><i style="background:#ff6b6b"></i> ATL (fatica, 7gg)</span>
      <span><i style="background:#fc5200"></i> TSB (forma = CTL−ATL)</span>
    </div>
    <div class="metrics" style="margin-top:.75rem">
      <div><span class="muted">Fitness (CTL)</span><b>${cur.ctl.toFixed(0)}</b></div>
      <div><span class="muted">Fatica (ATL)</span><b>${cur.atl.toFixed(0)}</b></div>
      <div><span class="muted">Forma (TSB)</span><b>${cur.tsb.toFixed(0)}</b></div>
      <div><span class="muted">Stato</span><b>${status}</b></div>
    </div>
    <div class="form-insights">
      <div class="insights-title">Perché questo stato?</div>
      <ul>
        ${formInsights(data, activities, settings).map(i =>
          `<li><span class="ins-icon">${i.icon}</span><span>${escapeHtml(i.text)}</span></li>`
        ).join('')}
      </ul>
    </div>
    <p class="muted" style="font-size:.78rem; margin-top:.5rem">
      <b>CTL</b> cresce col volume prolungato (42gg). <b>ATL</b> accumula nei giorni duri (7gg).
      <b>TSB</b> positivo = pronto a performare; negativo = sotto carico di costruzione.
    </p>
  `;
}

function renderHrZones(data) {
  if (!data) return '<p class="muted">Imposta LTHR nelle impostazioni per vedere la distribuzione zone.</p>';
  if (!data.total) return '<p class="muted">Nessuna attività con FC nelle ultime 4 settimane.</p>';
  const rows = data.zones.map(z => {
    const pct = (z.minutes / data.total) * 100;
    return `<div class="zone-row">
      <span class="zone-label" style="border-left: 4px solid ${z.color}">${z.label}</span>
      <span class="zone-bar"><span style="width:${pct.toFixed(1)}%; background:${z.color}"></span></span>
      <span class="zone-val">${Math.round(z.minutes)} min · ${pct.toFixed(0)}%</span>
    </div>`;
  }).join('');
  const easy = data.zones[0].minutes + data.zones[1].minutes;
  const hard = data.zones[2].minutes + data.zones[3].minutes + data.zones[4].minutes;
  const easyPct = Math.round(easy/data.total*100);
  const hardPct = Math.round(hard/data.total*100);
  const note = easyPct >= 75
    ? `✅ Distribuzione polarizzata (${easyPct}% easy / ${hardPct}% hard). Buono per FTP.`
    : easyPct >= 60
    ? `🟡 Distribuzione mista (${easyPct}/${hardPct}). Considera più Z2.`
    : `🔴 Troppa intensità (${easyPct}/${hardPct}). Rischio stallo: aumenta il volume easy.`;
  return rows + `
    <p class="muted" style="font-size:.85rem; margin-top:.5rem">${note}<br>Ideale: ~80% easy / ~20% hard (polarized training).</p>
    <details class="pol-explain">
      <summary>Come viene calcolata la polarizzazione?</summary>
      <div style="font-size:.85rem; margin-top:.5rem; line-height:1.5">
        <p>Per ogni attività delle ultime 4 settimane:</p>
        <ol style="padding-left:1.2rem; margin:.3rem 0">
          <li>Minuti effettivi = <code>moving_time × peso_tipo</code> (bici/corsa = 1×, forza = 0.5×, camminata = 0.2×, ecc.)</li>
          <li>Se c'è la FC: guardo la media dell'attività.
            <ul>
              <li><b>easyMin</b> += minuti se <code>FC_media &lt; 88% LTHR</code> (sotto soglia)</li>
              <li><b>hardMin</b> += minuti se <code>FC_media ≥ 88% LTHR</code> (soglia o sopra)</li>
            </ul>
          </li>
          <li>Senza FC: conto come easy (fallback prudente)</li>
        </ol>
        <p>Alla fine: <code>easyPct = easyMin / (easyMin + hardMin)</code>. Stessa cosa per hard.</p>
        <p><b>Limitazione onesta</b>: uso la FC media dell'intera attività, non i minuti effettivi per zona. Un'uscita con 20' di soglia + 60' di recupero ha media Z2 ma nella realtà ha ~20' hard + 60' easy. Per precisione al minuto servirebbero i "streams" di Strava (costosi in API). L'approssimazione funziona bene se gli allenamenti sono abbastanza omogenei.</p>
        <p><b>Target polarized</b>: ≥75% easy è buono, 80-85% è ideale. Sopra 85% rischio di troppo volume senza stimolo. Sotto 70% = troppa intensità, plateau probabile.</p>
      </div>
    </details>
  `;
}

// ================ RENDER FUNCTIONS ================

// ---- Render Power Profile ----
function renderPowerProfile(activities, weightKg) {
  const pp = buildPowerProfile(activities, weightKg);
  if (!pp) return '<p class="muted">Servono dati di potenza e peso corporeo nelle impostazioni per l\'analisi del power profile.</p>';

  const bucketLabels = {
    sprint_anaerobic: 'Sprint/Anaerobico',
    vo2max: 'VO2max (5-15 min)',
    sub_threshold: 'Sub-soglia (15-30 min)',
    threshold: 'Soglia (30-60 min)',
    endurance: 'Endurance (1-2h)',
    long_endurance: 'Long (>2h)',
  };

  // Barre relative
  const maxPct = Math.max(...Object.values(pp.profile).map(p => p.pctOfRef), 0.5);
  let barsHtml = '<div class="pp-grid">';
  for (const key in bucketLabels) {
    const p = pp.profile[key];
    if (!p) {
      barsHtml += `<div class="pp-row"><span class="muted">${bucketLabels[key]}</span><span class="pp-bar"><span style="width:0%"></span></span><span class="muted">—</span></div>`;
      continue;
    }
    const pctWidth = Math.round((p.pctOfRef / maxPct) * 100);
    const colorClass = p.pctOfRef >= 0.85 ? 'strength' : p.pctOfRef >= 0.65 ? 'average' : 'deficit';
    barsHtml += `<div class="pp-row">
      <span class="muted">${bucketLabels[key]}</span>
      <span class="pp-bar"><span class="${colorClass}" style="width:${pctWidth}%"></span></span>
      <span><b>${p.watts}W</b> · ${p.wkg} W/kg</span>
    </div>`;
  }
  barsHtml += '</div>';

  // Ratios
  let ratiosHtml = '';
  if (Object.keys(pp.ratios).length) {
    const ratioLabels = {
      vo2_to_threshold: 'VO2max / Soglia',
      threshold_to_endurance: 'Soglia / Endurance',
      sprint_to_vo2: 'Sprint / VO2max',
    };
    ratiosHtml = '<div class="metrics" style="margin:.75rem 0">';
    for (const key in pp.ratios) {
      ratiosHtml += `<div><span class="muted">${ratioLabels[key] || key}</span><b>${pp.ratios[key]}</b></div>`;
    }
    ratiosHtml += '</div>';
  }

  // Deficit
  let deficitHtml = '';
  if (pp.deficits.length) {
    deficitHtml = '<div class="pp-deficits"><div class="muted" style="margin-bottom:.4rem">Deficit identificati:</div>';
    for (const d of pp.deficits) {
      deficitHtml += `<div class="pp-deficit-card severity-${d.severity}">
        <div><b>${d.label}</b> <span class="muted">(${d.severity})</span></div>
        <div style="margin:.3rem 0">${escapeHtml(d.description)}</div>
        <div style="font-size:.85rem">💊 ${escapeHtml(d.prescription)}</div>
      </div>`;
    }
    deficitHtml += '</div>';
  }

  // Strengths
  let strengthHtml = '';
  if (pp.strengths.length) {
    strengthHtml = pp.strengths.map(s =>
      `<div class="pp-strength-card">✅ <b>${s.label}</b></div>`
    ).join('');
  }

  // Recommended focus
  const focusLabels = {
    vo2max: 'VO2max (intervalli Seiler 4×8, 4×4, Rønnestad 30/15)',
    threshold: 'Soglia/FTP (Sweet Spot, Over-Unders, ripetute specifiche)',
    neuromuscular: 'Sprint/Forza (partenze, sprint, forza neuromuscolare)',
    endurance: 'Base aerobica (volume Z2 e uscite lunghe)',
  };
  const focusNote = pp.recommendedFocus
    ? `<div class="meso-banner" style="margin-top:.75rem"><b>Focus consigliato:</b> ${focusLabels[pp.recommendedFocus] || pp.recommendedFocus}</div>`
    : '';

  return barsHtml + ratiosHtml + deficitHtml + strengthHtml + focusNote;
}

// ---- Render FTP Trend ----
function renderFtpTrend() {
  const trend = buildFtpTrend();
  if (!trend) return '<p class="muted">Servono almeno 2 settimane di dati FTP per mostrare il trend. Torna dopo qualche settimana di utilizzo.</p>';

  // Sparkline SVG
  const W = 400, H = 80, PAD = 10;
  const pts = trend.history;
  const ftps = pts.map(p => p.ftp);
  const minY = Math.min(...ftps) - 5;
  const maxY = Math.max(...ftps) + 5;
  const rangeY = Math.max(maxY - minY, 1);
  const xStep = (W - PAD * 2) / Math.max(pts.length - 1, 1);
  const pathD = pts.map((p, i) => {
    const x = PAD + i * xStep;
    const y = H - PAD - ((p.ftp - minY) / rangeY) * (H - PAD * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const dots = pts.map((p, i) => {
    const x = PAD + i * xStep;
    const y = H - PAD - ((p.ftp - minY) / rangeY) * (H - PAD * 2);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#fc5200"/>`;
  }).join('');
  // Peak line
  const peakY = H - PAD - ((trend.peakFtp - minY) / rangeY) * (H - PAD * 2);

  const chartHtml = `<div class="ftp-trend-chart">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px; height:auto;">
      <line x1="${PAD}" y1="${peakY.toFixed(1)}" x2="${W-PAD}" y2="${peakY.toFixed(1)}" stroke="#ffd700" stroke-dasharray="3 3" stroke-width="1" opacity=".5"/>
      <path d="${pathD}" fill="none" stroke="#fc5200" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
    </svg>
    <div class="chart-legend" style="font-size:.75rem">
      <span><i style="background:#fc5200; display:inline-block; width:12px; height:3px; border-radius:2px; vertical-align:middle; margin-right:4px"></i>FTP</span>
      <span><i style="background:#ffd700; display:inline-block; width:12px; height:1px; border-radius:2px; vertical-align:middle; margin-right:4px"></i>Picco storico (${trend.peakFtp}W)</span>
    </div>
  </div>`;

  // Metrics
  const trendIcon = trend.recentSlope > 1 ? '📈' : trend.recentSlope < -1 ? '📉' : '➡️';
  const delta4wLabel = trend.delta4w >= 0 ? `+${trend.delta4w}W` : `${trend.delta4w}W`;
  const metricsHtml = `<div class="metrics" style="margin:.75rem 0">
    <div><span class="muted">FTP attuale</span><b>${trend.currentFtp}W</b></div>
    <div><span class="muted">Picco storico</span><b>${trend.peakFtp}W</b></div>
    <div><span class="muted">% del picco</span><b>${trend.pctFromPeak}%</b></div>
    <div><span class="muted">Delta 4 sett.</span><b>${delta4wLabel}</b></div>
    <div><span class="muted">Trend</span><b>${trendIcon} ${trend.recentSlope > 0 ? '+' : ''}${trend.recentSlope} W/sett</b></div>
    <div><span class="muted">Punti dati</span><b>${trend.history.length}</b></div>
  </div>`;

  // Plateau alert
  let plateauHtml = '';
  if (trend.isPlateauDetected) {
    plateauHtml = `<div class="ftp-plateau-alert">
      <b>⚠️ Plateau rilevato</b> — FTP stabile da diverse settimane. Considera un cambio di protocollo per sbloccare la progressione (vedi "Focus consigliato" nel Power Profile).
    </div>`;
  }

  // Insights
  let insightsHtml = '';
  if (trend.insights.length) {
    insightsHtml = '<div class="form-insights" style="margin-top:.75rem"><ul>' +
      trend.insights.map(i => `<li><span class="ins-icon">${i.icon}</span><span>${escapeHtml(i.text)}</span></li>`).join('') +
      '</ul></div>';
  }

  return chartHtml + metricsHtml + plateauHtml + insightsHtml;
}

function renderFtpLthrBreakdown(activities, settings) {
  const ftp = buildFtpBreakdown(activities);
  const lthr = buildLthrBreakdown(activities);
  const segEst = estimatesFromSegments() || {};
  const profile = resolveHr(settings, activities);

  const fmtMin = sec => Math.round((sec || 0) / 60);
  const actLink = a => `<a href="activity.html?id=${a.id}">${escapeHtml(a.name || ('#' + a.id))}</a>`;

  // ---- FTP block ----
  let ftpHtml = `<h3 style="margin-top:0">⚡ FTP attuale: <span style="color:var(--accent)">${profile.ftp || '—'} W</span> <span class="muted" style="font-size:.85rem">(${profile.ftpDecl ? 'dichiarata' : (profile.ftpEst ? 'stimata' : '—')})</span></h3>`;
  if (profile.ftpDecl) {
    ftpHtml += `<p class="muted" style="font-size:.9rem">Hai dichiarato manualmente <b>${profile.ftpDecl}W</b> nei settings — prevale su qualunque stima.</p>`;
  }
  if (ftp && (profile.ftpEst || profile.ftpEstFromSegments)) {
    ftpHtml += `<details ${profile.ftpDecl ? '' : 'open'}>
      <summary>Dettaglio stima da attività (${profile.ftpEstFromActivities || '—'} W) e segmenti (${profile.ftpEstFromSegments || '—'} W)</summary>
      <p class="muted" style="font-size:.85rem; margin-top:.5rem">Per ogni bucket di durata cerco la migliore <i>weighted average power</i> con peso esponenziale (half-life 12 settimane). Il fattore corregge il fatto che WAP su una uscita lunga è ≈ FTP, mentre uno sforzo breve è ben sopra FTP.</p>
      <table class="ftp-table">
        <thead><tr>
          <th>Durata</th><th>Attività</th><th>WAP</th><th>Decay</th><th>× Fattore</th><th>= FTP candidato</th>
        </tr></thead>
        <tbody>`;
    for (const r of ftp.rows) {
      const isWinner = ftp.winning && r === ftp.winning;
      if (r.empty) {
        ftpHtml += `<tr class="ftp-row-empty"><td>${r.bucket}</td><td colspan="5" class="muted">— nessuna attività in questo bucket —</td></tr>`;
      } else {
        ftpHtml += `<tr class="${isWinner ? 'ftp-row-winner' : ''}">
          <td>${r.bucket}${isWinner ? ' 🏆' : ''}</td>
          <td>${actLink(r.act)}<div class="muted" style="font-size:.75rem">${fmtDate(r.act.start_date_local, { year: '2-digit' })} · ${fmtMin(r.act.moving_time)} min</div></td>
          <td><b>${r.rawWatts}</b> W</td>
          <td>${r.decayValue.toFixed(2)}</td>
          <td>× ${r.factor.toFixed(2)}</td>
          <td><b>${r.ftpCandidate}</b> W</td>
        </tr>`;
      }
    }
    ftpHtml += `</tbody></table>`;
    if (segEst?.ftpFromSegments) {
      ftpHtml += `<p style="margin-top:.75rem"><b>FTP da segmenti</b>: ${segEst.ftpFromSegments} W (best avg watts su segmenti 15-30 min × 0.95). Vince il MAX tra attività e segmenti.</p>`;
    }
    ftpHtml += `</details>`;
  } else if (!profile.ftp) {
    ftpHtml += `<p class="muted">Nessuna attività con potenza nei dati: registra uscite con power meter o dichiara FTP nei settings.</p>`;
  }

  // ---- LTHR block ----
  let lthrHtml = `<h3 style="margin-top:1.5rem">❤️ LTHR attuale: <span style="color:var(--accent)">${profile.hrLthr || '—'} bpm</span> <span class="muted" style="font-size:.85rem">(${profile.lthrSource === 'declared' ? 'dichiarata' : (profile.lthrEst ? 'stimata' : '—')})</span></h3>`;
  if (lthr) {
    lthrHtml += `<details ${profile.lthrSource === 'declared' ? '' : 'open'}>
      <summary>Dettaglio stima M1 / M2 / segmenti</summary>
      <p class="muted" style="font-size:.85rem; margin-top:.5rem">Prendo il MAX tra tre metodi indipendenti. Se uno fallisce per dati insufficienti, gli altri reggono la stima.</p>
      <table class="ftp-table">
        <thead><tr><th>Metodo</th><th>Riferimento</th><th>Calcolo</th><th>Risultato</th></tr></thead>
        <tbody>`;
    const isM1Win = lthr.m1Row.value === lthr.final;
    lthrHtml += `<tr class="${isM1Win ? 'ftp-row-winner' : ''}">
      <td>M1${isM1Win ? ' 🏆' : ''}</td>
      <td>${actLink(lthr.m1Row.act)}<div class="muted" style="font-size:.75rem">HRmax osservato ${lthr.m1Row.observedHRmax} bpm · ${fmtDate(lthr.m1Row.act.start_date_local, { year: '2-digit' })}</div></td>
      <td>HRmax × 0.91 (midpoint Friel/Coggan 88–92%)</td>
      <td><b>${lthr.m1Row.value}</b> bpm</td>
    </tr>`;
    if (lthr.m2Row) {
      const isM2Win = lthr.m2Row.value === lthr.final;
      lthrHtml += `<tr class="${isM2Win ? 'ftp-row-winner' : ''}">
        <td>M2${isM2Win ? ' 🏆' : ''}</td>
        <td>${actLink(lthr.m2Row.act)}<div class="muted" style="font-size:.75rem">avg HR ${lthr.m2Row.rawHr} bpm · ${fmtDate(lthr.m2Row.act.start_date_local, { year: '2-digit' })} · ${fmtMin(lthr.m2Row.act.moving_time)} min</div></td>
        <td>best avg HR (test-like 20-60min) × 0.98</td>
        <td><b>${lthr.m2Row.value}</b> bpm</td>
      </tr>`;
    } else {
      lthrHtml += `<tr><td>M2</td><td colspan="3" class="muted">— nessuna attività test-like 20-60 min con HR vicino al max —</td></tr>`;
    }
    if (segEst?.lthrFromSegments) {
      const isSegWin = segEst.lthrFromSegments === lthr.final;
      lthrHtml += `<tr class="${isSegWin ? 'ftp-row-winner' : ''}">
        <td>Segmenti${isSegWin ? ' 🏆' : ''}</td>
        <td class="muted">best avg HR su segmenti 15-45 min</td>
        <td>× 0.98</td>
        <td><b>${segEst.lthrFromSegments}</b> bpm</td>
      </tr>`;
    }
    lthrHtml += `</tbody></table></details>`;
  } else {
    lthrHtml += `<p class="muted">Nessuna attività con FC: collega un cardiofrequenzimetro o dichiara LTHR nei settings.</p>`;
  }

  return ftpHtml + lthrHtml;
}

export {
  buildPowerCurve, renderPowerCurve, buildFormTrend, formInsights, renderFormTrend,
  buildHrZones, renderHrZones, loadFtpHistory, saveFtpHistory, recordFtpPoint,
  buildFtpTrend, buildFtpInsights, compositeFatigueScore, buildPowerProfile,
  crossTrainingInsights, renderPowerProfile, renderFtpTrend, buildFtpBreakdown,
  buildLthrBreakdown, renderFtpLthrBreakdown,
};
