// Analisi approfondita: Power Curve + FTP stimato, Trend forma (CTL/ATL/TSB), Zone FC.
import { safeLoad, safeSave, isoDay, dayOffsetIso, escapeHtml, fmtTime, fmtDate } from './strava.js';
import {
  resolveHr, isHard, activityLoad, typeWeight, buildDateHelpers,
  levelFromKm, muscularFatigueScore, loadMesocycle, saveMesocycle, MESO_BLOCKS,
  athleteResponseCheck,
} from './training.js';
import { estimatesFromSegments, linearRegression } from './predictions.js';
import { PHYSIO } from './constants.js';

// ---- Power Duration Curve ----
function buildPowerCurve(activities, weightKg) {
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const withPower = bikes.filter(a => a.weighted_average_watts || a.average_watts);
  if (!withPower.length) return null;
  const buckets = [
    { label: '< 5 min', min: 0, max: 5*60 },
    { label: '5–15 min', min: 5*60, max: 15*60 },
    { label: '15–30 min', min: 15*60, max: 30*60 },
    { label: '30–60 min', min: 30*60, max: 60*60 },
    { label: '60–120 min', min: 60*60, max: 120*60 },
    { label: '> 2h', min: 120*60, max: Infinity },
  ];
  buckets.forEach(b => {
    const hits = withPower.filter(a => (a.moving_time||0) >= b.min && (a.moving_time||0) < b.max);
    if (!hits.length) return;
    const best = hits.reduce((x, a) => {
      const w = a.weighted_average_watts || a.average_watts;
      return w > (x?.watts || 0) ? { watts: w, act: a } : x;
    }, null);
    b.best = best;
  });
  const ref = buckets.find(b => b.label === '30–60 min')?.best?.watts
    || buckets.find(b => b.label === '60–120 min')?.best?.watts;
  const ftp = ref ? Math.round(ref * 0.95) : null;
  const wPerKg = (ftp && weightKg) ? (ftp/weightKg).toFixed(2) : null;
  return { buckets, ftp, wPerKg };
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

// ---- CTL / ATL / TSB ----
function buildFormTrend(activities, settings) {
  const { hrMax, hrLthr, ftp } = resolveHr(settings, activities);
  // Usa TUTTE le attività (con peso per tipo via activityLoad)
  const DAYS = 90;
  const daily = new Array(DAYS).fill(0);
  const now = new Date(); now.setHours(0,0,0,0);
  activities.forEach(a => {
    const d = new Date(a.start_date_local); d.setHours(0,0,0,0);
    const delta = Math.round((now - d) / 86400000);
    if (delta >= 0 && delta < DAYS) daily[DAYS - 1 - delta] += activityLoad(a, hrMax, hrLthr, ftp);
  });
  const ctl = [], atl = [];
  let cCTL = 0, cATL = 0;
  const kCTL = 1 - Math.exp(-1/42);
  const kATL = 1 - Math.exp(-1/7);
  for (let i = 0; i < DAYS; i++) {
    cCTL += (daily[i] - cCTL) * kCTL;
    cATL += (daily[i] - cATL) * kATL;
    ctl.push(cCTL); atl.push(cATL);
  }
  const tsb = ctl.map((c, i) => c - atl[i]);
  return { daily, ctl, atl, tsb, DAYS };
}

function formInsights(data, activities, settings) {
  const { ctl, atl, tsb, daily, DAYS } = data;
  const cur = { ctl: ctl[DAYS-1], atl: atl[DAYS-1], tsb: tsb[DAYS-1] };
  const prevCTL = ctl[Math.max(0, DAYS-15)];
  const load7 = daily.slice(-7).reduce((s,v) => s+v, 0);
  const loadPrev7 = daily.slice(-14, -7).reduce((s,v) => s+v, 0);
  const deltaLoad = load7 - loadPrev7;
  const restDaysLast7 = daily.slice(-7).filter(v => v < 5).length;
  const { hrLthr, ftp } = resolveHr(settings);
  const { ago } = buildDateHelpers(0);
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const last7 = bikes.filter(a => ago(a.start_date_local) < 7);
  const hardsLast7 = last7.filter(a => isHard(a, hrLthr, ftp)).length;
  const longLast7 = last7.filter(a => (a.moving_time||0) >= 120*60).length;

  const out = [];

  // Range PMC classici del coaching basato su TSS:
  // TSB -10 a +10 = forma di gara (pronto a performare)
  // TSB 0 a -20 = carico normale
  // TSB -20 a -30 = fase di carico profondo (costruzione)
  // TSB < -50 = troppo stanco, non rendere
  // TSB > +10 = rischio "imballato" / detraining
  if (cur.tsb < -50) {
    out.push({ icon: '🔴', text: `TSB a ${cur.tsb.toFixed(0)}: sei troppo stanco per rendere al meglio. La fatica (ATL=${cur.atl.toFixed(0)}) ha superato di molto il fitness (CTL=${cur.ctl.toFixed(0)}). Con questi valori le prestazioni crollano del 15-20%: non è il momento di forzare, ma di scaricare per 3-5 giorni prima di riprendere stimoli duri.` });
  } else if (cur.tsb < -30) {
    out.push({ icon: '🟠', text: `TSB a ${cur.tsb.toFixed(0)}: fase di carico profondo. Fatica ${cur.atl.toFixed(0)} supera nettamente fitness ${cur.ctl.toFixed(0)}. È la situazione di una settimana di costruzione intensa: il fitness sta crescendo ma le prestazioni immediate sono compromesse. Continua se è il tuo piano, ma entro 7-10 giorni serve uno scarico per "capitalizzare" il lavoro.` });
  } else if (cur.tsb < -10) {
    out.push({ icon: '🟡', text: `TSB a ${cur.tsb.toFixed(0)}: carico normale di allenamento. Stai accumulando stimolo per migliorare la forma futura — esattamente la zona in cui si costruiscono gli adattamenti senza rompere. Le prestazioni del giorno sono leggermente sotto il potenziale, ma è un prezzo sano da pagare.` });
  } else if (cur.tsb <= 10) {
    out.push({ icon: '🟢', text: `TSB ${cur.tsb > 0 ? '+' : ''}${cur.tsb.toFixed(0)}: forma di gara! Fitness ${cur.ctl.toFixed(0)} e fatica ${cur.atl.toFixed(0)} allineati con margine. Questa è la finestra ideale per un test FTP, un tentativo su un segmento PR, una gara o un'uscita di qualità massima. Sfrutta la freschezza.` });
  } else {
    out.push({ icon: '⚠️', text: `TSB +${cur.tsb.toFixed(0)}: troppo scarico. Ti senti "imballato" — le gambe non rispondono come dovrebbero nonostante la freschezza. Il CTL sta iniziando a scendere: se non hai una gara imminente, torna a stimoli regolari per evitare detraining.` });
  }

  if (loadPrev7 > 10) {
    const pct = Math.round((deltaLoad / loadPrev7) * 100);
    if (pct > 30) out.push({ icon: '📈', text: `Il carico è cresciuto del ${pct}% rispetto alla settimana precedente (${loadPrev7.toFixed(0)} → ${load7.toFixed(0)}). Aumenti oltre il 30% sono considerati "spike" e sono la prima causa di fatica acuta elevata. Se questo è volontario (es. mesociclo di carico) va bene per 1–2 settimane, ma deve essere seguito da uno scarico.` });
    else if (pct < -30) out.push({ icon: '📉', text: `Il carico è sceso del ${Math.abs(pct)}% rispetto alla settimana precedente (${loadPrev7.toFixed(0)} → ${load7.toFixed(0)}). Riduzione consistente: può essere una fase di scarico pianificato, uno stop per malattia/viaggio o semplicemente una settimana meno strutturata. Se prolungata oltre 10 giorni inizia a incidere sul fitness.` });
    else out.push({ icon: '➡️', text: `Carico stabile: ${load7.toFixed(0)} questa settimana vs ${loadPrev7.toFixed(0)} la precedente (${pct >= 0 ? '+' : ''}${pct}%). Progressione fisiologica, nessun spike.` });
  }

  if (hardsLast7 >= 3) {
    out.push({ icon: '🔥', text: `${hardsLast7} sessioni ad alta intensità negli ultimi 7 giorni. Per costruire soglia, il sistema cardiovascolare e muscolare ha bisogno di tempo per adattarsi tra uno stimolo forte e il successivo: 3+ intensità/settimana è un dosaggio da atleta avanzato, e solo se bilanciato con recuperi veri. Se non sei abituato a questo ritmo, il rischio stallo/infortunio è reale.` });
  } else if (hardsLast7 === 2) {
    out.push({ icon: '🎯', text: `2 sessioni dure in 7 giorni: dosaggio classico per migliorare la soglia mantenendo spazio per il recupero. Distribuite bene (con almeno 48h in mezzo e giorni di Z2 tra l'una e l'altra) sono il cuore di un piano per l'FTP.` });
  } else if (hardsLast7 === 0 && cur.tsb < -5) {
    out.push({ icon: '🚴', text: `Nessuna sessione sopra soglia, ma TSB comunque negativo (${cur.tsb.toFixed(0)}): il carico viene quindi dal volume in Z2 o dalle uscite lunghe. Questo tipo di fatica è meno "acuta" ma più cumulativa — ottima per la base aerobica, da monitorare se prolungata.` });
  }

  if (longLast7 > 0) {
    out.push({ icon: '🟠', text: `${longLast7} uscita lunga (≥2h) nell'ultima settimana. Le lunghe sono il contributo singolo più importante al CTL settimanale: una 3h ben fatta genera più carico di due sessioni di intensità da 60'. Ottimo strumento per costruire base aerobica e capacità di utilizzo dei grassi come carburante.` });
  }

  if (restDaysLast7 >= 4) {
    out.push({ icon: '🛌', text: `${restDaysLast7} giorni su 7 senza attività. Riposo consistente: utile per recuperare da un blocco intenso o da un evento, ma se prolungato oltre una settimana il CTL inizia a scendere significativamente.` });
  } else if (restDaysLast7 === 0) {
    out.push({ icon: '⚡', text: `Attivo tutti i 7 giorni. Può funzionare per atleti esperti con sessioni molto calibrate (es. alternanza Z1/Z2/qualità), ma per la maggior parte dei ciclisti 1–2 giorni di riposo completo a settimana migliorano gli adattamenti e riducono il rischio di plateau.` });
  }

  const ctlDelta = cur.ctl - prevCTL;
  if (ctlDelta > 5) out.push({ icon: '💪', text: `Fitness in forte crescita: CTL ${prevCTL.toFixed(0)} → ${cur.ctl.toFixed(0)} (+${ctlDelta.toFixed(0)}) in 2 settimane. Stai costruendo base a un ritmo sostenuto. Attenzione: aumenti superiori a 5–7 punti/settimana sono considerati aggressivi e vanno alternati a settimane di scarico.` });
  else if (ctlDelta > 2) out.push({ icon: '📊', text: `Fitness in crescita graduale: CTL +${ctlDelta.toFixed(0)} in 2 settimane. Progressione sostenibile e sana — è il passo consigliato per costruire senza rompere gli equilibri.` });
  else if (ctlDelta < -5) out.push({ icon: '⬇️', text: `Fitness in calo: CTL ${prevCTL.toFixed(0)} → ${cur.ctl.toFixed(0)} (${ctlDelta.toFixed(0)}) in 2 settimane. Se non è un taper intenzionale verso una gara, ripristina volume al più presto per evitare di perdere il lavoro fatto.` });

  if (cur.tsb < -15) {
    out.push({ icon: '💡', text: `Raccomandazione: inserisci 1–2 giorni di riposo completo o recupero attivo in Z1. Il TSB deve tornare almeno sopra −10 prima di proporre nuove sessioni di qualità, altrimenti lo stimolo viene assorbito male e accumuli solo fatica.` });
  } else if (cur.tsb > 10 && hardsLast7 === 0) {
    out.push({ icon: '💡', text: `Raccomandazione: stato di forma ottimo e nessun lavoro di intensità recente — è il momento per un blocco di Soglia o VO2max. Non sprecare la freschezza in un altro fondo facile.` });
  } else if (cur.tsb > -5 && cur.tsb < 5 && hardsLast7 < 2) {
    out.push({ icon: '💡', text: `Raccomandazione: equilibrio buono con spazio per crescere. Un paio di sessioni di Sweet Spot o Soglia nei prossimi giorni spingono il fitness senza mandare in rosso la fatica.` });
  }

  // Cross-training insights
  const ctInsights = crossTrainingInsights(activities, settings);
  if (ctInsights.insights.length > 0) {
    for (const ins of ctInsights.insights) {
      const icon = ins.type === 'balance' ? '⚖️' : ins.type === 'hiking' ? '🥾' : ins.type === 'strength' ? '💪' : ins.type === 'running' ? '🏃' : '🧘';
      out.push({ icon, text: `${ins.text} ${ins.impact}` });
    }
  }

  // FTP trend
  const ftpTrend = buildFtpTrend();
  if (ftpTrend?.insights?.length) {
    for (const ins of ftpTrend.insights) {
      out.push(ins);
    }
  }

  // Mesocycle info
  const meso = loadMesocycle();
  if (meso) {
    const block = MESO_BLOCKS.find(b => b.id === meso.blockId);
    if (block) {
      out.push({
        icon: '📋',
        text: `Mesociclo attivo: "${block.label}" — settimana ${meso.weekInBlock + 1}/${block.weeks}. ${block.description}`,
      });
    }
  }

  // Athlete response check
  const response = athleteResponseCheck(activities, settings);
  if (response && response.status !== 'stable') {
    out.push({
      icon: response.status === 'overreaching' ? '🔴' : '✅',
      text: response.message,
    });
  }

  // Muscular fatigue score
  const mFatigue = muscularFatigueScore(activities, 7);
  if (mFatigue > 40) {
    out.push({
      icon: '🦵',
      text: `Fatica muscolare elevata (${mFatigue}/100) nelle ultime 7 attività. Cause: dislivello, forza, trail running. Gambe potenzialmente indolenzite — considera questo prima di sessioni di intensità in bici.`,
    });
  }

  return out;
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

// ---- Zone FC ultime 4 settimane ----
function buildHrZones(activities, settings) {
  const { hrLthr } = resolveHr(settings);
  if (!hrLthr) return null;
  const bikes = activities.filter(a =>
    a.type && a.type.includes('Ride') && a.has_heartrate && a.average_heartrate
  );
  const { ago } = buildDateHelpers(0);
  const recent = bikes.filter(a => ago(a.start_date_local) < 28);
  const zones = [
    { label: 'Z1 Recupero', color: '#4ade80', min: 0, max: 0.75, minutes: 0 },
    { label: 'Z2 Aerobico', color: '#22c55e', min: 0.75, max: 0.88, minutes: 0 },
    { label: 'Z3 Tempo', color: '#facc15', min: 0.88, max: 0.94, minutes: 0 },
    { label: 'Z4 Soglia', color: '#fc5200', min: 0.94, max: 1.05, minutes: 0 },
    { label: 'Z5 VO2+', color: '#ff6b6b', min: 1.05, max: 99, minutes: 0 },
  ];
  recent.forEach(a => {
    const r = a.average_heartrate / hrLthr;
    const z = zones.find(z => r >= z.min && r < z.max);
    if (z) z.minutes += (a.moving_time || 0) / 60;
  });
  const total = zones.reduce((s, z) => s + z.minutes, 0);
  return { zones, total };
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

// ---- FTP Trend Tracking ----
// Traccia l'evoluzione della FTP stimata nel tempo.
// Salva un punto ogni settimana se c'è una stima disponibile.
// Permette di identificare plateau e progressione.
const FTP_HISTORY_STORAGE = 'biketr_ftp_history';

function loadFtpHistory() { return safeLoad(FTP_HISTORY_STORAGE, [], Array.isArray); }
function saveFtpHistory(h) { safeSave(FTP_HISTORY_STORAGE, h); }

// Registra il punto FTP corrente (chiamato su ogni renderTraining)
function recordFtpPoint(settings, activities) {
  const { ftp, ftpSource, ftpEst, ftpDecl } = resolveHr(settings, activities);
  const effectiveFtp = ftpDecl || ftpEst || ftp;
  if (!effectiveFtp) return;

  const history = loadFtpHistory();
  const today = isoDay(new Date());

  // Registra max 1 punto a settimana (evita spam)
  const lastEntry = history[history.length - 1];
  if (lastEntry) {
    const daysSinceLast = (new Date(today) - new Date(lastEntry.date)) / 86400000;
    if (daysSinceLast < 5) return; // troppo presto per un nuovo punto
  }

  history.push({
    date: today,
    ftp: effectiveFtp,
    source: ftpDecl ? 'declared' : (ftpSource || 'estimated'),
  });

  // Mantieni max 52 punti (1 anno)
  if (history.length > 52) history.splice(0, history.length - 52);
  saveFtpHistory(history);

  // Aggiorna anche il mesociclo
  const meso = loadMesocycle();
  if (meso) {
    if (!meso.ftpHistory) meso.ftpHistory = [];
    meso.ftpHistory.push({ date: today, ftp: effectiveFtp });
    if (meso.ftpHistory.length > 20) meso.ftpHistory.splice(0, meso.ftpHistory.length - 20);
    saveMesocycle(meso);
  }
}

// Analizza il trend FTP e identifica plateau
function buildFtpTrend() {
  const history = loadFtpHistory();
  if (history.length < 2) return null;

  const points = history.map((h, i) => ({ x: i, y: h.ftp }));
  const reg = linearRegression(points);

  // Trend ultimi N punti
  const recentN = Math.min(6, history.length);
  const recent = history.slice(-recentN);
  const recentPoints = recent.map((h, i) => ({ x: i, y: h.ftp }));
  const recentReg = linearRegression(recentPoints);

  // Plateau detection: se slope < 0.5 W/settimana per 6+ settimane
  const isPlateauDetected = recentN >= 4 && Math.abs(recentReg.slope) < 0.5;

  // Picco storico
  const peakFtp = Math.max(...history.map(h => h.ftp));
  const peakDate = history.find(h => h.ftp === peakFtp)?.date;
  const currentFtp = history[history.length - 1].ftp;
  const pctFromPeak = peakFtp > 0 ? +((currentFtp / peakFtp) * 100).toFixed(0) : 100;

  // Variazione sulle ultime 4 settimane
  const fourWeeksAgo = history.length >= 4 ? history[history.length - 4].ftp : history[0].ftp;
  const delta4w = currentFtp - fourWeeksAgo;

  return {
    history,
    slope: +reg.slope.toFixed(2), // W/punto (≈ W/settimana)
    recentSlope: +recentReg.slope.toFixed(2),
    isPlateauDetected,
    peakFtp,
    peakDate,
    currentFtp,
    pctFromPeak,
    delta4w,
    insights: buildFtpInsights(currentFtp, peakFtp, delta4w, isPlateauDetected, recentReg.slope),
  };
}

function buildFtpInsights(current, peak, delta4w, isPlateau, recentSlope) {
  const out = [];

  if (isPlateau) {
    out.push({
      icon: '⚠️',
      text: `FTP in plateau da diverse settimane (~${current}W). Considera un cambio di protocollo: se fai SST, passa a VO2max. Se fai VO2max, prova Over-Unders. Un nuovo stimolo può sbloccare la progressione.`,
    });
  }

  if (delta4w > 8) {
    out.push({
      icon: '📈',
      text: `FTP cresciuta di ${delta4w}W nelle ultime 4 settimane. Ottima progressione — il protocollo attuale funziona.`,
    });
  } else if (delta4w < -5) {
    out.push({
      icon: '📉',
      text: `FTP calata di ${Math.abs(delta4w)}W nelle ultime 4 settimane. Possibili cause: scarico prolungato, malattia, sovrallenamento. Monitora la situazione.`,
    });
  }

  if (current < peak * 0.92) {
    out.push({
      icon: '🎯',
      text: `Sei al ${Math.round(current / peak * 100)}% del tuo picco storico (${peak}W). Margine di recupero: ${peak - current}W.`,
    });
  }

  if (recentSlope > 2) {
    out.push({
      icon: '🚀',
      text: `Trend FTP in forte crescita (~${recentSlope.toFixed(1)}W/settimana). Mantieni il ritmo ma monitora il recupero.`,
    });
  }

  return out;
}

// ---- Fatigue Score composito (cardio + muscolare) ----
// Combina TSB (fatica cardio) con muscular fatigue score per un indice completo
function compositeFatigueScore(activities, settings) {
  const form = buildFormTrend(activities, settings);
  if (!form) return null;

  const tsb = form.tsb[form.DAYS - 1];
  const ctl = form.ctl[form.DAYS - 1];
  const atl = form.atl[form.DAYS - 1];

  // Muscular fatigue (da training.js)
  const mFatigue = muscularFatigueScore(activities, 7);

  // Normalizza TSB in scala 0-100 (100 = massima fatica)
  // TSB -50 → 100, TSB 0 → 50, TSB +20 → 25
  const cardioFatigue = Math.max(0, Math.min(100, 50 - tsb));

  // Score composito: pesato 60% cardio + 40% muscolare
  const composite = Math.round(cardioFatigue * 0.6 + mFatigue * 0.4);

  // Cross-training impact sulle ultime 48h
  const { ago } = buildDateHelpers(0);
  const last48h = activities.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 2);
  const recentHikeElev = last48h
    .filter(a => a.type === 'Hike' || a.type === 'Walk')
    .reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const recentStrengthHours = last48h
    .filter(a => ['WeightTraining', 'Workout', 'Crossfit'].includes(a.type))
    .reduce((s, a) => s + (a.moving_time || 0) / 3600, 0);

  return {
    composite,
    cardioFatigue: Math.round(cardioFatigue),
    muscularFatigue: mFatigue,
    tsb: +tsb.toFixed(1),
    ctl: +ctl.toFixed(1),
    atl: +atl.toFixed(1),
    recentHikeElev,
    recentStrengthHours: +recentStrengthHours.toFixed(1),
    readiness: composite < 35 ? 'pronto' : composite < 55 ? 'moderato' : composite < 75 ? 'affaticato' : 'sovraccarico',
    canDoHard: composite < 50 && mFatigue < 40,
    shouldRest: composite > 70 || mFatigue > 60,
  };
}

// ---- Power Profile Analysis: identifica deficit e punti di forza ----
// Confronta la power curve dell'atleta con curve di riferimento (De Pauw et al. 2013)
// e identifica dove l'atleta è più debole/forte relativamente al proprio livello.
// Restituisce raccomandazioni specifiche per tipo di lavoro da fare.
function buildPowerProfile(activities, weightKg) {
  const pc = buildPowerCurve(activities, weightKg);
  if (!pc || !weightKg) return null;

  // Referenze W/kg per livello "recreational trained" (De Pauw 2013, semplificato)
  // Sprint (5s), Anaerobic (1min), VO2max (5min), Threshold (20min), Endurance (60min)
  const refBuckets = {
    '< 5 min': { duration: 'sprint_anaerobic', refWkg: 6.5 },
    '5–15 min': { duration: 'vo2max', refWkg: 4.0 },
    '15–30 min': { duration: 'sub_threshold', refWkg: 3.5 },
    '30–60 min': { duration: 'threshold', refWkg: 3.2 },
    '60–120 min': { duration: 'endurance', refWkg: 2.8 },
    '> 2h': { duration: 'long_endurance', refWkg: 2.5 },
  };

  const profile = {};
  let hasData = false;

  for (const b of pc.buckets) {
    if (!b.best) continue;
    hasData = true;
    const ref = refBuckets[b.label];
    if (!ref) continue;
    const wkg = b.best.watts / weightKg;
    const pctOfRef = wkg / ref.refWkg;
    profile[ref.duration] = {
      watts: b.best.watts,
      wkg: +wkg.toFixed(2),
      pctOfRef: +pctOfRef.toFixed(2),
      label: b.label,
    };
  }

  if (!hasData) return null;

  // Calcola ratios chiave per identificare deficit
  const ratios = {};
  const vo2 = profile.vo2max;
  const threshold = profile.threshold || profile.sub_threshold;
  const sprint = profile.sprint_anaerobic;
  const endurance = profile.endurance || profile.long_endurance;

  if (vo2 && threshold) {
    // Rapporto VO2/Soglia: se basso → VO2 debole
    ratios.vo2_to_threshold = +(vo2.wkg / threshold.wkg).toFixed(2);
  }
  if (threshold && endurance) {
    // Rapporto Soglia/Endurance: se basso → soglia debole rispetto a base
    ratios.threshold_to_endurance = +(threshold.wkg / endurance.wkg).toFixed(2);
  }
  if (sprint && vo2) {
    ratios.sprint_to_vo2 = +(sprint.wkg / vo2.wkg).toFixed(2);
  }

  // Identifica deficit e genera raccomandazioni
  const deficits = [];
  const strengths = [];

  if (ratios.vo2_to_threshold && ratios.vo2_to_threshold < 1.15) {
    deficits.push({
      area: 'vo2max',
      label: 'VO2max',
      description: 'La tua potenza a 5 min è bassa rispetto alla soglia. Il "tetto" aerobico limita la crescita FTP.',
      prescription: 'Priorità: sessioni VO2max (Seiler 4×4, 4×8, Rønnestad 30/15). 2 sessioni/settimana per 4-6 settimane.',
      severity: ratios.vo2_to_threshold < 1.08 ? 'high' : 'medium',
    });
  } else if (ratios.vo2_to_threshold && ratios.vo2_to_threshold > 1.35) {
    strengths.push({ area: 'vo2max', label: 'VO2max alto relativo alla soglia' });
    deficits.push({
      area: 'threshold',
      label: 'Soglia/FTP',
      description: 'Hai un buon VO2max ma la soglia non lo sfrutta. C\'è margine per alzare FTP senza toccare il VO2.',
      prescription: 'Priorità: Sweet Spot 3×20 e Over-Unders. Lavoro specifico di soglia per 4-6 settimane.',
      severity: 'medium',
    });
  }

  if (ratios.threshold_to_endurance && ratios.threshold_to_endurance < 1.08) {
    deficits.push({
      area: 'endurance',
      label: 'Resistenza/Base aerobica',
      description: 'La potenza su uscite >1h cala poco rispetto alla soglia — ma è troppo bassa in assoluto. Serve volume.',
      prescription: 'Priorità: uscite lunghe Z2 (2.5-4h) e fondo medio. Costruisci base prima di intensità.',
      severity: 'medium',
    });
  }

  if (sprint && vo2 && ratios.sprint_to_vo2 < 1.4) {
    deficits.push({
      area: 'neuromuscular',
      label: 'Potenza neuromuscolare/Sprint',
      description: 'Potenza massima bassa — limita scatti, partenze e capacità di rispondere agli attacchi.',
      prescription: 'Aggiungi: sprint da fermo, partenze forza, e lavoro in palestra su esplosività.',
      severity: 'low',
    });
  } else if (sprint && vo2 && ratios.sprint_to_vo2 > 2.0) {
    strengths.push({ area: 'neuromuscular', label: 'Sprint/Potenza forte' });
  }

  // Calcola il deficit primario (quello che darà più guadagno se corretto)
  const primaryDeficit = deficits.sort((a, b) => {
    const sev = { high: 3, medium: 2, low: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  })[0] || null;

  return {
    profile,
    ratios,
    deficits,
    strengths,
    primaryDeficit,
    // Tipo di blocco consigliato basato su deficit
    recommendedFocus: primaryDeficit?.area || 'threshold',
  };
}

// ---- Cross-training insights ----
// Analizza l'impatto delle attività non-bici sul training mix
function crossTrainingInsights(activities, settings) {
  const { ago } = buildDateHelpers(0);
  const last28 = activities.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 28);

  const categories = {
    cycling: { types: new Set(['Ride','VirtualRide','EBikeRide','MountainBikeRide','GravelRide']), hours: 0, count: 0, elev: 0 },
    running: { types: new Set(['Run','VirtualRun','TrailRun']), hours: 0, count: 0, elev: 0 },
    hiking: { types: new Set(['Hike','Walk']), hours: 0, count: 0, elev: 0 },
    strength: { types: new Set(['WeightTraining','Workout','Crossfit']), hours: 0, count: 0, elev: 0 },
    swimming: { types: new Set(['Swim']), hours: 0, count: 0, elev: 0 },
    flexibility: { types: new Set(['Yoga','Pilates']), hours: 0, count: 0, elev: 0 },
    other: { types: new Set(), hours: 0, count: 0, elev: 0 },
  };

  for (const a of last28) {
    let matched = false;
    for (const key in categories) {
      if (key === 'other') continue;
      if (categories[key].types.has(a.type)) {
        categories[key].hours += (a.moving_time || 0) / 3600;
        categories[key].count++;
        categories[key].elev += (a.total_elevation_gain || 0);
        matched = true;
        break;
      }
    }
    if (!matched) {
      categories.other.hours += (a.moving_time || 0) / 3600;
      categories.other.count++;
    }
  }

  const totalHours = Object.values(categories).reduce((s, c) => s + c.hours, 0);
  const insights = [];

  // Analisi cross-training e sinergie
  if (categories.hiking.count > 0 && categories.hiking.elev > 0) {
    const avgElevPerHike = Math.round(categories.hiking.elev / categories.hiking.count);
    insights.push({
      type: 'hiking',
      text: `${categories.hiking.count} escursioni in 4 sett. (${categories.hiking.hours.toFixed(1)}h, ${Math.round(categories.hiking.elev)}m D+ totali, media ${avgElevPerHike}m/uscita).`,
      impact: categories.hiking.elev > 3000
        ? 'Impatto significativo su fatica muscolare. Le gambe hanno bisogno di più recupero tra sessioni dure in bici.'
        : 'Contributo aerobico moderato. Il dislivello rinforza quadricipiti e glutei (positivo per la bici).',
    });
  }

  if (categories.strength.count > 0) {
    insights.push({
      type: 'strength',
      text: `${categories.strength.count} sessioni forza (${categories.strength.hours.toFixed(1)}h).`,
      impact: categories.strength.count >= 2
        ? 'Ottimo per efficienza pedalata (+3-7% FTP in 12 sett. secondo Rønnestad). Rispetta 24-48h prima di sessioni dure in bici.'
        : 'Una sessione/sett è il minimo per vedere benefici. Prova ad aggiungerne una seconda.',
    });
  }

  if (categories.running.count > 0) {
    insights.push({
      type: 'running',
      text: `${categories.running.count} sessioni corsa (${categories.running.hours.toFixed(1)}h, ${Math.round(categories.running.elev)}m D+).`,
      impact: 'La corsa contribuisce al VO2max e alla base aerobica ma aggiunge stress articolare. Considera questo nei giorni di recupero.',
    });
  }

  if (categories.flexibility.count > 0) {
    insights.push({
      type: 'flexibility',
      text: `${categories.flexibility.count} sessioni yoga/pilates (${categories.flexibility.hours.toFixed(1)}h).`,
      impact: 'Mobilità e core stabilità: migliora postura sulla bici e previene infortuni. Nessun impatto negativo sul recupero.',
    });
  }

  // Mix consiglio
  const cyclingPct = totalHours > 0 ? (categories.cycling.hours / totalHours * 100) : 100;
  if (cyclingPct < 50 && totalHours > 3) {
    insights.push({
      type: 'balance',
      text: `Solo ${Math.round(cyclingPct)}% del volume è ciclismo. Le attività complementari contribuiscono al fitness generale ma per migliorare FTP serve che la bici resti la disciplina principale.`,
      impact: 'Suggerimento: mantieni almeno 60-70% del volume in bici per progressione specifica.',
    });
  }

  return {
    categories,
    totalHours,
    cyclingPct: +cyclingPct.toFixed(0),
    insights,
    weeklyElevation: Math.round(categories.hiking.elev + categories.cycling.elev + categories.running.elev) / 4,
  };
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

// =====================================================================
// Breakdown FTP / LTHR — dettaglio del calcolo nella tab Analisi
// Replica internamente estimateFTP / estimateLTHR esponendo le attività
// che hanno determinato la stima.
// =====================================================================

function buildFtpBreakdown(activities) {
  if (!activities) return null;
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const withPower = bikes.filter(a => a.weighted_average_watts || a.average_watts);

  const now = Date.now();
  const decay = (a) => {
    const ageWeeks = (now - new Date(a.start_date_local).getTime()) / (7 * 86400000);
    return Math.exp(-ageWeeks / 12);
  };

  const buckets = [
    { min: 40 * 60, max: 90 * 60, factor: 0.98, label: '40-90 min' },
    { min: 20 * 60, max: 40 * 60, factor: 0.95, label: '20-40 min' },
    { min: 10 * 60, max: 20 * 60, factor: 0.90, label: '10-20 min' },
    { min: 0,       max: 10 * 60, factor: 0.85, label: '< 10 min' },
  ];

  const rows = [];
  for (const b of buckets) {
    const pool = withPower.filter(a => {
      const t = a.moving_time || 0;
      return t >= b.min && t < b.max;
    });
    if (!pool.length) {
      rows.push({ bucket: b.label, factor: b.factor, empty: true });
      continue;
    }
    const scored = pool.map(a => {
      const w = a.weighted_average_watts || a.average_watts;
      return { watts: w, weighted: w * decay(a), act: a };
    }).sort((a, c) => c.weighted - a.weighted);
    const best = scored[0];
    rows.push({
      bucket: b.label,
      factor: b.factor,
      act: best.act,
      rawWatts: best.watts,
      decayValue: decay(best.act),
      ftpCandidate: Math.round(best.watts * b.factor),
    });
  }
  const winning = rows.find(r => !r.empty);
  return { rows, winning, fallback: !winning && withPower.length > 0 };
}

function buildLthrBreakdown(activities) {
  if (!activities) return null;
  const bikes = activities.filter(a => a.type && a.type.includes('Ride') && a.has_heartrate);
  if (!bikes.length) return null;

  const maxHrs = bikes.map(a => ({ act: a, hr: a.max_heartrate || 0 })).filter(x => x.hr > 0);
  if (!maxHrs.length) return null;
  maxHrs.sort((a, b) => b.hr - a.hr);
  const observedHRmax = maxHrs[0].hr;
  const m1 = Math.round(observedHRmax * 0.91);

  const testLike = bikes.filter(a =>
    a.average_heartrate && a.max_heartrate &&
    (a.moving_time || 0) >= 20 * 60 && (a.moving_time || 0) <= 60 * 60 &&
    a.max_heartrate >= observedHRmax * 0.9
  ).sort((a, b) => (b.average_heartrate || 0) - (a.average_heartrate || 0));

  let m2Row = null;
  if (testLike.length) {
    m2Row = { act: testLike[0], rawHr: testLike[0].average_heartrate, factor: 0.98, value: Math.round(testLike[0].average_heartrate * 0.98) };
  }

  return {
    m1Row: { act: maxHrs[0].act, observedHRmax, factor: 0.91, value: m1 },
    m2Row,
    final: Math.max(m1, m2Row?.value || 0),
  };
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
