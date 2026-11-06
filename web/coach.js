import { loadSettings, safeLoad, safeSave, isPlainObject, escapeHtml } from './strava.js';
import { resolveHr } from './training.js';

// helpers DOM (definiti localmente per evitare dipendenze cicliche con app.js)
const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.hidden = false; };

// ============================================================================
// COACH AI — il lavoro lo fa il servizio Coach (docker/coach, raggiunto su /coach/)
//
//  1. Il browser invia durata, modello, fuso orario e profilo atleta (FTP, soglie,
//     peso, volume settimanale: le stesse stime del resto dell'app).
//  2. Il servizio scarica le corse da Strava, calcola il contesto (CTL/ATL/TSB,
//     polarizzazione, ultime uscite), cerca i paper, chiede al modello l'id del
//     protocollo e calcola watt e struttura. Mai aritmetica fatta dal modello.
//  3. La risposta è un flusso di eventi, una riga JSON l'uno: step, context, token
//     (il testo del modello mentre lo scrive), poi result oppure error.
// ============================================================================

const COACH_DEFAULT_MODEL = 'qwen2.5:7b';
const COACH_SETTINGS_KEY = 'biketr_coach_settings';
const COACH_UNREACHABLE = 'Coach non raggiungibile: avvia BikeTR con docker compose up -d';
const COACH_INTERRUPTED = 'Connessione col Coach interrotta';

function loadCoachSettings() {
  const s = safeLoad(COACH_SETTINGS_KEY, {}, isPlainObject);
  // Le versioni precedenti salvavano anche l'indirizzo di Ollama: non serve più.
  if ('endpoint' in s) {
    delete s.endpoint;
    saveCoachSettings(s);
  }
  return s;
}
function saveCoachSettings(s) { safeSave(COACH_SETTINGS_KEY, s); }

// Profilo atleta per il servizio: i valori mancanti viaggiano come null e il
// servizio usa gli stessi default del vecchio Coach del browser.
function coachProfile(activities) {
  const settings = loadSettings();
  const hr = resolveHr(settings, activities);
  return {
    ftp: hr.ftp || null,
    lthr: hr.hrLthr || null,
    hrMax: hr.hrMax || null,
    weight: settings.weight || null,
    weeklyHours: settings.weeklyHours || null,
    weeklyDays: settings.weeklyDays || null,
  };
}

// Gli eventi del flusso, uno per riga. Un pezzo di rete può tagliare una riga o un
// carattere a metà: TextDecoder in modalità stream tiene i byte incompleti, il buffer
// tiene la riga incompleta fino al prossimo pezzo.
async function* coachEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) yield JSON.parse(line);
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

// ----------------------------------------------------------------------------
// Render
// ----------------------------------------------------------------------------

function renderPaperLink(paperMeta) {
  const url = `https://pubmed.ncbi.nlm.nih.gov/${paperMeta.pmid}/`;
  const cite = `${escapeHtml(paperMeta.authors)} (${escapeHtml(paperMeta.year)}). ${escapeHtml(paperMeta.title)}`;
  const journal = paperMeta.journal ? ` · <i>${escapeHtml(paperMeta.journal)}</i>` : '';
  return `<li><a href="${url}" target="_blank" rel="noopener">${cite}</a>${journal} · <span class="muted">PMID:${paperMeta.pmid}</span></li>`;
}

// Da dove vengono le corse, quando non è il solito download completo.
function renderRidesNote(rides) {
  const notes = [];
  if (rides.fromSaved) {
    const when = new Date(rides.downloadedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    notes.push(`⚠️ Strava non raggiungibile: uso le corse salvate il ${escapeHtml(when)}.`);
  }
  if (rides.missingDetails > 0) {
    notes.push(`ℹ️ ${rides.missingDetails} uscite senza dettagli secondo per secondo: per loro uso le cifre di riepilogo.`);
  }
  return notes.map(n => `<div class="muted" style="font-size:.85rem">${n}</div>`).join('');
}

function renderCoachWorkout({ title, targetWatt, struttura, razionale, paperRefs, retrievedPapers, fellBack, model, seconds, evalCount, modelRaw, rides }) {
  const stepsHtml = struttura.map(s => `<li>${escapeHtml(s)}</li>`).join('');
  const paperRefsHtml = paperRefs.length
    ? `<details style="margin-top:.5rem" open>
         <summary>📚 Paper citati nel razionale (${paperRefs.length})</summary>
         <ul class="paper-list">${paperRefs.map(renderPaperLink).join('')}</ul>
       </details>`
    : '';
  const retrievedHtml = retrievedPapers.length
    ? `<details style="margin-top:.5rem">
         <summary class="muted">🔍 Top paper recuperati per il tuo stato (RAG, top ${retrievedPapers.length})</summary>
         <ul class="paper-list">${retrievedPapers.map(p => `
           <li>
             <a href="https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/" target="_blank" rel="noopener">${escapeHtml(p.authors)} (${escapeHtml(p.year)}). ${escapeHtml(p.title)}</a>
             <span class="muted">· score ${p.score.toFixed(3)} · PMID:${p.pmid}</span>
           </li>`).join('')}</ul>
       </details>`
    : '';
  const fallbackBadge = fellBack
    ? `<div class="coach-warn">⚠️ Il modello non ha restituito JSON valido — uso fallback deterministico in base alle regole TSB/polarizzazione.</div>`
    : '';
  return `
    ${fallbackBadge}
    <div class="coach-card">
      <div class="coach-title"><b>${escapeHtml(title)}</b></div>
      <div class="coach-watt">⚡ ${escapeHtml(targetWatt)}</div>
      <ol class="coach-steps">${stepsHtml}</ol>
      <div class="coach-rationale">
        <b>Razionale:</b> ${escapeHtml(razionale)}
      </div>
      ${paperRefsHtml}
      ${retrievedHtml}
    </div>
    ${renderRidesNote(rides)}
    <div class="muted" style="font-size:.75rem; margin-top:.5rem">
      ⚡ ${escapeHtml(model)} · ${seconds.toFixed(1)}s · ${escapeHtml(evalCount || '?')} tok
    </div>
    <details style="margin-top:.5rem">
      <summary class="muted">🛠 Output grezzo del modello</summary>
      <pre>${escapeHtml(modelRaw)}</pre>
    </details>
  `;
}

// Errori del servizio ({error: codice, message}): FTP mancante, ricerca dei paper e
// chiamata al modello hanno la loro spiegazione, come nel vecchio Coach del browser.
function renderCoachError({ error, message }) {
  if (error === 'no_ftp') {
    return `<div class="coach-error">
      <b>❌ FTP non disponibile</b>
      <p style="margin:.5rem 0">Il Coach AI ha bisogno della FTP per calcolare i watt target.</p>
      <p class="muted" style="font-size:.85rem">Vai sulla tab <b>🎯 Allenamento</b> → <b>Impostazioni zone / volume</b> e dichiara l'FTP, oppure registra qualche attività con power meter su Strava.</p>
    </div>`;
  }
  if (error === 'retrieval') {
    return `<div class="coach-error">
      <b>❌ Errore retrieval paper</b>
      <p style="margin:.5rem 0">${escapeHtml(message)}</p>
      <p class="muted" style="font-size:.85rem">Verifica:</p>
      <ul class="muted" style="font-size:.85rem">
        <li>Indice paper presente? Se <code>papers_index.json</code> manca, ripristinalo da git: <code>git restore papers_index.json</code></li>
        <li>Modello embeddings scaricato? Al primo avvio Docker lo scarica da solo: l'avanzamento è in <code>docker compose logs ollama-pull</code>, e <code>docker compose exec ollama ollama list</code> deve includere <b>nomic-embed-text</b></li>
        <li>Ollama attivo all'indirizzo scritto in <code>.env</code>? Il pulsante <b>Ping Ollama</b> qui sotto lo verifica.</li>
      </ul>
    </div>`;
  }
  const heading = error === 'model' ? 'Errore chiamata modello' : 'Workout non generato';
  return `<div class="coach-error">
    <b>❌ ${heading}</b>
    <p style="margin:.5rem 0">${escapeHtml(message)}</p>
  </div>`;
}

// ----------------------------------------------------------------------------
// Generazione: richiesta al servizio Coach e disegno degli eventi
//
// Nessun limite di tempo qui: il servizio smette se il modello tace per 3 minuti.
// Una nuova richiesta da questa scheda interrompe la precedente (AbortController):
// la connessione si chiude e il servizio ferma Ollama. Ricaricare o chiudere la
// scheda chiude la connessione allo stesso modo; le altre schede non ne risentono.
// ----------------------------------------------------------------------------

let coachAbortCtrl = null;

async function coach_generate(activities, durataMin) {
  const model = (loadCoachSettings().model || COACH_DEFAULT_MODEL).trim();
  const out = $('coach-output');
  $('coach-context').innerHTML = '';

  if (coachAbortCtrl) coachAbortCtrl.abort();
  const ctrl = coachAbortCtrl = new AbortController();

  out.innerHTML = `<div class="muted" id="coach-step">⏳ Richiesta al Coach…</div>
    <pre id="coach-live" class="coach-live" hidden></pre>`;
  const stepLine = $('coach-step');
  const live = $('coach-live');

  let started = false;
  try {
    const res = await fetch('/coach/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration: durataMin,
        model,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        profile: coachProfile(activities),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Richiesta rifiutata dal servizio ({error, message}); senza un corpo JSON
      // è nginx a rispondere: il servizio non è avviato.
      const body = await res.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      out.innerHTML = renderCoachError(body?.message ? body : { message: COACH_UNREACHABLE });
      return;
    }
    started = true;
    for await (const ev of coachEvents(res)) {
      // Eventi già arrivati di una richiesta interrotta: li disegna la richiesta nuova.
      if (ctrl.signal.aborted) return;
      if (ev.type === 'step') stepLine.textContent = `⏳ ${ev.message}`;
      else if (ev.type === 'context') $('coach-context').innerHTML = '<pre>' + escapeHtml(JSON.stringify(ev.context, null, 2)) + '</pre>';
      else if (ev.type === 'token') { live.hidden = false; live.append(ev.text); }
      else if (ev.type === 'result') { out.innerHTML = renderCoachWorkout(ev); return; }
      else if (ev.type === 'error') { out.innerHTML = renderCoachError(ev); return; }
    }
  } catch (e) {
    // Abort: è partita un'altra generazione da questa scheda, che ora disegna lei.
    if (e.name === 'AbortError') return;
    out.innerHTML = renderCoachError({ message: started ? COACH_INTERRUPTED : COACH_UNREACHABLE });
    return;
  }
  // Flusso finito senza risultato né errore: la connessione si è chiusa a metà.
  if (!ctrl.signal.aborted) out.innerHTML = renderCoachError({ message: COACH_INTERRUPTED });
}

// ----------------------------------------------------------------------------
// Bind UI
// ----------------------------------------------------------------------------

// Il servizio Coach controlla Ollama: risponde {models, missing: [{model, command}]}
// oppure {error, message}. Senza una risposta del servizio, il Coach non è avviato.
async function pingOllama(model) {
  let res;
  try {
    res = await fetch('/coach/ping?model=' + encodeURIComponent(model));
  } catch { return { ok: false, msg: COACH_UNREACHABLE }; }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, msg: body?.message || COACH_UNREACHABLE };
  return { ok: true, models: body.models, missing: body.missing };
}

function initCoach(activities) {
  const sec = $('coach-section');
  if (!sec) return;
  const cs = loadCoachSettings();

  $('coach-model').value = cs.model || COACH_DEFAULT_MODEL;
  $('coach-duration').value = cs.lastDuration || 60;

  $('coach-save-settings').onclick = () => {
    saveCoachSettings({
      model: $('coach-model').value.trim() || COACH_DEFAULT_MODEL,
      lastDuration: +$('coach-duration').value || 60,
    });
    $('coach-settings-status').textContent = '✅ Salvato';
    setTimeout(() => $('coach-settings-status').textContent = '', 1500);
  };

  $('coach-ping').onclick = async () => {
    $('coach-ping-status').textContent = '⏳ Test…';
    const r = await pingOllama($('coach-model').value.trim() || COACH_DEFAULT_MODEL);
    if (r.ok) {
      const missing = r.missing.map(m =>
        `<br>⚠️ <b>${escapeHtml(m.model)}</b> mancante: scaricalo con <code>${escapeHtml(m.command)}</code>`).join('');
      $('coach-ping-status').innerHTML = `✅ Ollama raggiungibile · modelli: <code>${escapeHtml(r.models.join(', ') || '(vuoto)')}</code>${missing}`;
    } else {
      $('coach-ping-status').innerHTML = `❌ ${escapeHtml(r.msg)}`;
    }
  };

  $('coach-generate').onclick = () => {
    const dur = +$('coach-duration').value || 60;
    saveCoachSettings({ ...loadCoachSettings(), lastDuration: dur });
    coach_generate(activities, dur);
  };

  show('coach-section');
}

export { initCoach };
