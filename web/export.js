// Export tutti gli allenamenti in JSON (per copia-incolla in Claude).
// Tre modalità:
//   - compact   : summary + metriche cached (zero API calls extra)
//   - detailed  : + /activities/:id (segment_efforts, splits, gear, description)
//   - max       : + streams grezzi (time, hr, watts, cadence, velocity, altitude, distance)
//
// Rate limit Strava: 100 req / 15 min, 1000/giorno. Throttle automatico a ~6.5 req/min.
import {
  api, getAccessToken, loadSettings,
  loadStreamsCache, saveStreamsCache, computeStreamsMetrics,
  fmtKm, fmtTime,
} from './strava.js';

// Una pausa tra richieste per stare sotto 100/15min con margine.
// 100 req in 900 s → 9 s/req. Usiamo 10 s per sicurezza.
const THROTTLE_MS = 10000;
const PAGE_SIZE = 200; // max consentito da Strava per /athlete/activities

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Paginazione completa dello storico.
export async function fetchAllActivities(token, onProgress) {
  const all = [];
  for (let page = 1; page <= 200; page++) {
    const batch = await api(`/athlete/activities?per_page=${PAGE_SIZE}&page=${page}`, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    onProgress?.(all.length, page);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

// Dettaglio per attività (segment_efforts, splits, description, gear...).
export async function fetchActivityDetail(activityId, token) {
  return api(`/activities/${activityId}?include_all_efforts=true`, token);
}

// Streams completi (più campi rispetto al fetchActivityStreams di strava.js).
export async function fetchActivityStreamsFull(activityId, token) {
  const keys = 'time,heartrate,watts,cadence,velocity_smooth,altitude,distance,temp,grade_smooth';
  const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${keys}&key_by_type=true`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('streams ' + activityId + ': ' + res.status);
  return res.json();
}

// Snellisce un summary activity rimuovendo campi rumorosi/ridondanti.
function slimSummary(a) {
  const m = a._metrics || {};
  return {
    id: a.id,
    external_id: a.external_id,
    upload_id: a.upload_id,
    name: a.name,
    type: a.type,
    sport_type: a.sport_type,
    workout_type: a.workout_type,
    start_date: a.start_date,
    start_date_local: a.start_date_local,
    timezone: a.timezone,
    distance_m: a.distance,
    distance_km: a.distance != null ? +(a.distance / 1000).toFixed(3) : null,
    moving_time_s: a.moving_time,
    elapsed_time_s: a.elapsed_time,
    total_elevation_gain_m: a.total_elevation_gain,
    elev_high_m: a.elev_high,
    elev_low_m: a.elev_low,
    average_speed_ms: a.average_speed,
    max_speed_ms: a.max_speed,
    average_speed_kmh: a.average_speed != null ? +(a.average_speed * 3.6).toFixed(2) : null,
    max_speed_kmh: a.max_speed != null ? +(a.max_speed * 3.6).toFixed(2) : null,
    average_cadence: a.average_cadence,
    average_temp: a.average_temp,
    has_heartrate: a.has_heartrate,
    average_heartrate: a.average_heartrate,
    max_heartrate: a.max_heartrate,
    average_watts: a.average_watts,
    max_watts: a.max_watts,
    weighted_average_watts: a.weighted_average_watts,
    device_watts: a.device_watts,
    kilojoules: a.kilojoules,
    suffer_score: a.suffer_score,
    calories: a.calories,
    trainer: a.trainer,
    commute: a.commute,
    manual: a.manual,
    private: a.private,
    achievement_count: a.achievement_count,
    kudos_count: a.kudos_count,
    pr_count: a.pr_count,
    gear_id: a.gear_id,
    location_city: a.location_city,
    location_state: a.location_state,
    location_country: a.location_country,
    start_latlng: a.start_latlng,
    end_latlng: a.end_latlng,
    map_summary_polyline: a.map?.summary_polyline,
    computed_metrics: (m && !m._error) ? {
      np_watts: m.NP ?? null,
      intensity_factor: m.IF ?? null,
      tss: m.TSS ?? null,
      hr_tss: m.hrTSS ?? null,
      hr_zones_seconds: m.hrZones ?? null, // [Z1, Z2, Z3, Z4, Z5]
      source: 'streams_cache',
    } : null,
  };
}

// Estrae i campi rilevanti del dettaglio (non duplica quelli già in summary).
function detailExtra(d) {
  return {
    description: d.description || null,
    device_name: d.device_name || null,
    embed_token: undefined, // privacy
    gear: d.gear ? {
      id: d.gear.id,
      name: d.gear.name,
      brand_name: d.gear.brand_name,
      model_name: d.gear.model_name,
      frame_type: d.gear.frame_type,
      distance_m: d.gear.distance,
    } : null,
    photos_count: d.total_photo_count ?? null,
    splits_metric: (d.splits_metric || []).map(s => ({
      split: s.split,
      distance_m: s.distance,
      elapsed_time_s: s.elapsed_time,
      moving_time_s: s.moving_time,
      elevation_difference_m: s.elevation_difference,
      average_speed_ms: s.average_speed,
      average_heartrate: s.average_heartrate,
      pace_zone: s.pace_zone,
    })),
    laps: (d.laps || []).map(l => ({
      lap_index: l.lap_index,
      name: l.name,
      start_index: l.start_index,
      end_index: l.end_index,
      distance_m: l.distance,
      elapsed_time_s: l.elapsed_time,
      moving_time_s: l.moving_time,
      total_elevation_gain_m: l.total_elevation_gain,
      average_speed_ms: l.average_speed,
      max_speed_ms: l.max_speed,
      average_cadence: l.average_cadence,
      average_watts: l.average_watts,
      max_watts: l.max_watts,
      weighted_average_watts: l.weighted_average_watts,
      average_heartrate: l.average_heartrate,
      max_heartrate: l.max_heartrate,
    })),
    best_efforts: (d.best_efforts || []).map(b => ({
      name: b.name,
      distance_m: b.distance,
      elapsed_time_s: b.elapsed_time,
      moving_time_s: b.moving_time,
      start_index: b.start_index,
      end_index: b.end_index,
      pr_rank: b.pr_rank,
    })),
    segment_efforts: (d.segment_efforts || []).map(s => ({
      id: s.id,
      name: s.name,
      elapsed_time_s: s.elapsed_time,
      moving_time_s: s.moving_time,
      distance_m: s.distance,
      start_index: s.start_index,
      end_index: s.end_index,
      average_cadence: s.average_cadence,
      average_watts: s.average_watts,
      device_watts: s.device_watts,
      average_heartrate: s.average_heartrate,
      max_heartrate: s.max_heartrate,
      pr_rank: s.pr_rank,
      kom_rank: s.kom_rank,
      segment: s.segment ? {
        id: s.segment.id,
        name: s.segment.name,
        distance_m: s.segment.distance,
        average_grade: s.segment.average_grade,
        maximum_grade: s.segment.maximum_grade,
        elevation_high_m: s.segment.elevation_high,
        elevation_low_m: s.segment.elevation_low,
        climb_category: s.segment.climb_category,
        city: s.segment.city,
        state: s.segment.state,
        country: s.segment.country,
        starred: s.segment.starred,
      } : null,
    })),
  };
}

// Estrae le serie utili dagli streams Strava (formato key_by_type).
function streamsExtract(streams) {
  if (!streams || typeof streams !== 'object') return null;
  const out = {};
  for (const k of ['time','heartrate','watts','cadence','velocity_smooth','altitude','distance','temp','grade_smooth']) {
    if (streams[k]?.data) out[k] = streams[k].data;
  }
  return out;
}

// Coda di chiamate API con throttle (rispetta rate limit).
async function throttledQueue(items, fn, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const t0 = Date.now();
    try {
      results.push({ ok: true, value: await fn(items[i], i) });
    } catch (e) {
      results.push({ ok: false, error: e.message });
      // Su 429 (rate limit) aspetta più a lungo
      if (e.message.includes('429')) {
        onProgress?.(i + 1, items.length, 'rate-limit hit, attendo 60s…');
        await sleep(60000);
      }
    }
    onProgress?.(i + 1, items.length);
    // Throttle: solo se non siamo all'ultimo
    if (i < items.length - 1) {
      const elapsed = Date.now() - t0;
      const wait = Math.max(0, THROTTLE_MS - elapsed);
      if (wait > 0) await sleep(wait);
    }
  }
  return results;
}

// Costruisce il payload finale.
function buildPayload({ athlete, stats, settings, activities, version }) {
  return {
    biketr_export: {
      version,
      generated_at: new Date().toISOString(),
      generator: 'BikeTR v2 export',
      schema: 'biketr-export-v1',
      activity_count: activities.length,
    },
    athlete: athlete ? {
      id: athlete.id,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      sex: athlete.sex,
      city: athlete.city,
      state: athlete.state,
      country: athlete.country,
      weight_kg: athlete.weight,
      ftp: athlete.ftp,
      premium: athlete.premium,
      created_at: athlete.created_at,
    } : null,
    stats: stats ? {
      recent_ride_totals: stats.recent_ride_totals,
      recent_run_totals: stats.recent_run_totals,
      ytd_ride_totals: stats.ytd_ride_totals,
      ytd_run_totals: stats.ytd_run_totals,
      all_ride_totals: stats.all_ride_totals,
      all_run_totals: stats.all_run_totals,
      all_swim_totals: stats.all_swim_totals,
    } : null,
    settings_biketr: settings,
    activities,
  };
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Estimate API calls + time for the chosen mode
function estimate(mode, n) {
  if (mode === 'compact') return { calls: 0, minutes: 0 };
  if (mode === 'detailed') return { calls: n, minutes: Math.ceil((n * THROTTLE_MS) / 60000) };
  if (mode === 'max') return { calls: n * 2, minutes: Math.ceil((n * 2 * THROTTLE_MS) / 60000) };
  return { calls: 0, minutes: 0 };
}

// ---------- UI ----------

function ensureDialog() {
  let dlg = document.getElementById('export-dialog');
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'export-dialog';
  dlg.innerHTML = `
    <form method="dialog" class="export-form">
      <h2 style="margin-top:0">📥 Esporta allenamenti</h2>
      <p class="muted" style="margin-top:-.5rem">JSON pronto da incollare in chat con Claude.</p>

      <div id="export-stats" class="muted" style="font-size:.85rem; margin:.5rem 0">
        Conto le attività…
      </div>

      <fieldset class="export-mode">
        <legend>Livello di dettaglio</legend>
        <label class="export-mode-opt">
          <input type="radio" name="export-mode" value="compact" checked />
          <div>
            <div><b>📦 Compatto</b> <span class="muted">— 0 chiamate API</span></div>
            <div class="muted" style="font-size:.8rem">Summary di ogni attività + metriche già in cache (NP/IF/TSS, zone FC). File piccolo, immediato.</div>
          </div>
        </label>
        <label class="export-mode-opt">
          <input type="radio" name="export-mode" value="detailed" />
          <div>
            <div><b>📋 Dettagliato</b> <span class="muted" id="est-detailed">— …</span></div>
            <div class="muted" style="font-size:.8rem">+ <code>/activities/:id</code>: segment_efforts, splits_metric, laps, best_efforts, gear, description.</div>
          </div>
        </label>
        <label class="export-mode-opt">
          <input type="radio" name="export-mode" value="max" />
          <div>
            <div><b>🔬 Massimo (streams grezzi)</b> <span class="muted" id="est-max">— …</span></div>
            <div class="muted" style="font-size:.8rem">+ serie secondo-per-secondo: time, hr, watts, cadence, velocity, altitude, distance, temp, grade. <span class="warn">File grosso, probabilmente troppo per chat su molte attività.</span></div>
          </div>
        </label>
      </fieldset>

      <fieldset class="export-mode">
        <legend>Filtra periodo (opzionale)</legend>
        <div style="display:flex; gap:.5rem; flex-wrap:wrap">
          <label>Da <input type="date" id="export-from" /></label>
          <label>A <input type="date" id="export-to" /></label>
          <label style="display:flex; align-items:center; gap:.4rem">
            <input type="checkbox" id="export-only-rides" checked />
            <span>Solo bici (Ride/MTB/Gravel/Virtual)</span>
          </label>
        </div>
        <div class="muted" style="font-size:.75rem">Vuoto = tutto lo storico. Utile per ridurre il file in modalità "Massimo".</div>
      </fieldset>

      <div id="export-progress" class="muted" style="margin:.5rem 0; min-height:1.2em"></div>
      <div id="export-progress-bar" style="height:6px; background:#2a2e38; border-radius:3px; overflow:hidden; margin-bottom:.5rem; display:none">
        <div style="height:100%; background:var(--accent); width:0%; transition:width .2s" id="export-progress-fill"></div>
      </div>

      <div style="display:flex; gap:.5rem; justify-content:flex-end; margin-top:1rem">
        <button type="button" id="export-cancel">Annulla</button>
        <button type="button" id="export-go" class="primary">Esporta</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);
  return dlg;
}

export async function openExportDialog({ athlete, stats }) {
  const dlg = ensureDialog();
  const settings = loadSettings();

  const $ = (id) => document.getElementById(id);
  $('export-progress').textContent = '';
  $('export-progress-bar').style.display = 'none';
  $('export-progress-fill').style.width = '0%';
  $('export-go').disabled = true;

  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');

  $('export-cancel').onclick = () => dlg.close();

  // Step 1: conta le attività (paginazione full).
  let allActivities = [];
  try {
    const token = await getAccessToken();
    $('export-stats').textContent = 'Conto le attività…';
    allActivities = await fetchAllActivities(token, (done, page) => {
      $('export-stats').textContent = `Caricate ${done} attività (pagina ${page})…`;
    });
    const dates = allActivities.map(a => a.start_date_local).filter(Boolean).sort();
    const firstDate = dates[0]?.slice(0,10) || '—';
    const lastDate = dates[dates.length-1]?.slice(0,10) || '—';
    $('export-stats').innerHTML = `Trovate <b>${allActivities.length}</b> attività totali. Range: ${firstDate} → ${lastDate}.`;
    const eD = estimate('detailed', allActivities.length);
    const eM = estimate('max', allActivities.length);
    $('est-detailed').textContent = `— ${eD.calls} chiamate API · ~${eD.minutes} min`;
    $('est-max').textContent = `— ${eM.calls} chiamate API · ~${eM.minutes} min`;
    $('export-go').disabled = false;
  } catch (e) {
    $('export-stats').innerHTML = `<span class="err">Errore: ${e.message}</span>`;
    return;
  }

  $('export-go').onclick = async () => {
    const mode = document.querySelector('input[name=export-mode]:checked')?.value || 'compact';
    const fromStr = $('export-from').value;
    const toStr = $('export-to').value;
    const onlyRides = $('export-only-rides').checked;
    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr + 'T23:59:59') : null;
    const BIKE = new Set(['Ride','VirtualRide','EBikeRide','MountainBikeRide','GravelRide']);

    // Filtro
    let acts = allActivities.filter(a => {
      const d = new Date(a.start_date_local);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (onlyRides && !BIKE.has(a.type)) return false;
      return true;
    });

    // Riconferma se "Massimo" su tante attività
    if (mode === 'max' && acts.length > 30) {
      const est = estimate('max', acts.length);
      const ok = confirm(`Modalità Massimo su ${acts.length} attività:\n- ${est.calls} chiamate API\n- ~${est.minutes} minuti\n- File potenzialmente >50 MB\n\nVuoi procedere?`);
      if (!ok) return;
    } else if (mode === 'detailed' && acts.length > 100) {
      const est = estimate('detailed', acts.length);
      const ok = confirm(`Modalità Dettagliata su ${acts.length} attività:\n- ${est.calls} chiamate API\n- ~${est.minutes} minuti\n\nVuoi procedere?`);
      if (!ok) return;
    }

    $('export-go').disabled = true;
    $('export-cancel').textContent = 'Chiudi (continua in background)';
    $('export-progress-bar').style.display = 'block';

    // Step 2: arricchimento per attività. Il token si chiede a ogni richiesta:
    // un export lungo dura più di un token di accesso.
    const detailCache = {};       // id → detailExtra
    const streamsCache = loadStreamsCache(); // mantiene anche metriche
    const streamsRaw = {};        // id → streamsExtract (solo modalità max)

    if (mode === 'detailed' || mode === 'max') {
      const needDetail = acts.filter(a => !detailCache[a.id]);
      $('export-progress').textContent = `Scarico dettagli (${needDetail.length})…`;
      await throttledQueue(needDetail, async (a) => {
        const d = await fetchActivityDetail(a.id, await getAccessToken());
        detailCache[a.id] = detailExtra(d);
        return d;
      }, (done, total, msg) => {
        $('export-progress').textContent = msg
          ? `Dettagli ${done}/${total} · ${msg}`
          : `Dettagli ${done}/${total} (throttle ${THROTTLE_MS/1000}s/req)…`;
        $('export-progress-fill').style.width = `${(done/total)*50}%`;
      });
    }

    if (mode === 'max') {
      // Per FTP/LTHR usa quelli derivati dai settings (best effort).
      const ftp = settings.ftpDeclared || 220;
      const lthr = settings.hrLthr || 170;
      const needStreams = acts.filter(a => !streamsRaw[a.id]);
      $('export-progress').textContent = `Scarico streams (${needStreams.length})…`;
      await throttledQueue(needStreams, async (a) => {
        const s = await fetchActivityStreamsFull(a.id, await getAccessToken());
        streamsRaw[a.id] = streamsExtract(s);
        // Aggiorna anche cache metriche derivate
        try {
          streamsCache[a.id] = { ...computeStreamsMetrics(s, ftp, lthr), _fetched: Date.now() };
        } catch { /* ignore */ }
        return s;
      }, (done, total, msg) => {
        $('export-progress').textContent = msg
          ? `Streams ${done}/${total} · ${msg}`
          : `Streams ${done}/${total} (throttle ${THROTTLE_MS/1000}s/req)…`;
        $('export-progress-fill').style.width = `${50 + (done/total)*50}%`;
      });
      saveStreamsCache(streamsCache);
    }

    // Applica cache streams alle attività anche se non eravamo in max
    acts.forEach(a => {
      if (streamsCache[a.id] && !streamsCache[a.id]._error) a._metrics = streamsCache[a.id];
    });

    // Step 3: build payload
    const enriched = acts.map(a => {
      const base = slimSummary(a);
      if (detailCache[a.id]) base.detail = detailCache[a.id];
      if (streamsRaw[a.id]) base.streams = streamsRaw[a.id];
      return base;
    });

    const payload = buildPayload({
      athlete, stats, settings, activities: enriched, version: mode,
    });

    const json = JSON.stringify(payload, null, 2);
    const size = new Blob([json]).size;
    const today = new Date().toISOString().slice(0, 10);
    const fname = `biketr-export-${mode}-${today}.json`;
    downloadJson(payload, fname);

    $('export-progress-fill').style.width = '100%';
    $('export-progress').innerHTML = `✅ Esportato <b>${fname}</b> (${formatBytes(size)}, ${enriched.length} attività)`;
    $('export-go').disabled = false;
    $('export-go').textContent = 'Esporta di nuovo';
    $('export-cancel').textContent = 'Chiudi';
  };
}

// Init: aggancia il FAB.
export function initExport({ athlete, stats }) {
  const fab = document.getElementById('export-fab');
  if (!fab) return;
  fab.hidden = false;
  fab.onclick = () => openExportDialog({ athlete, stats });
}
