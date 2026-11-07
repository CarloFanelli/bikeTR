// Finestra "Esporta allenamenti" dell'app di oggi. Lo storico, i tre livelli di
// dettaglio (compatto, dettagliato, massimo), le pause tra le richieste a Strava e il
// file JSON stanno in src/data/export.ts, condivisi con la nuova app.
import { loadSettings } from './strava.js';
import {
  buildExport, downloadJson, estimate, exportRange, fetchAllActivities, filterForExport, formatBytes,
} from './src/data/export.ts';

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
    $('export-stats').textContent = 'Conto le attività…';
    allActivities = await fetchAllActivities((done, page) => {
      $('export-stats').textContent = `Caricate ${done} attività (pagina ${page})…`;
    });
    const { first, last } = exportRange(allActivities);
    $('export-stats').innerHTML = `Trovate <b>${allActivities.length}</b> attività totali. Range: ${first} → ${last}.`;
    const eD = estimate('detailed', allActivities.length);
    const eM = estimate('max', allActivities.length);
    $('est-detailed').textContent = `— ${eD.calls} chiamate API · ~${eD.minutes} min`;
    $('est-max').textContent = `— ${eM.calls} chiamate API · ~${eM.minutes} min`;
    $('export-go').disabled = false;
  } catch (e) {
    if (e.code === 'not_connected') return window.location.reload();
    $('export-stats').innerHTML = `<span class="err">Errore: ${e.message}</span>`;
    return;
  }

  const runExport = async () => {
    const mode = document.querySelector('input[name=export-mode]:checked')?.value || 'compact';
    const fromStr = $('export-from').value;
    const toStr = $('export-to').value;
    const onlyRides = $('export-only-rides').checked;
    const acts = filterForExport(allActivities, { from: fromStr, to: toStr, onlyRides });

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

    const { payload, fname } = await buildExport({ mode, activities: acts, athlete, stats, settings }, (text, pct) => {
      $('export-progress').textContent = text;
      $('export-progress-fill').style.width = `${pct}%`;
    });
    const size = downloadJson(payload, fname);

    $('export-progress-fill').style.width = '100%';
    $('export-progress').innerHTML = `✅ Esportato <b>${fname}</b> (${formatBytes(size)}, ${acts.length} attività)`;
    $('export-go').disabled = false;
    $('export-go').textContent = 'Esporta di nuovo';
    $('export-cancel').textContent = 'Chiudi';
  };
  // Senza accesso a Strava l'export si ferma: se scollegati la pagina ricaricata
  // mostra "Collega Strava", altrimenti il messaggio, e si può riprovare.
  $('export-go').onclick = () => runExport().catch((e) => {
    if (e.code === 'not_connected') return window.location.reload();
    $('export-progress').textContent = '❌ ' + e.message;
    $('export-go').disabled = false;
  });
}

// Init: aggancia il FAB.
export function initExport({ athlete, stats }) {
  const fab = document.getElementById('export-fab');
  if (!fab) return;
  fab.hidden = false;
  fab.onclick = () => openExportDialog({ athlete, stats });
}
