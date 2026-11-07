import {
  fetchActivity, purgeLegacyStrava, escapeHtml,
  fmtKm, fmtTime, fmtDate, TYPE_EMOJI,
} from './strava.js';
import { decodePolyline } from './src/core/polyline.ts';

const $ = (id) => document.getElementById(id);

async function main() {
  purgeLegacyStrava();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { $('error').hidden = false; $('error').querySelector('p').textContent = 'ID attività mancante'; return; }

  try {
    const a = await fetchActivity(id);
    $('loading').hidden = true;
    $('detail').hidden = false;

    $('act-name').textContent = `${TYPE_EMOJI[a.type] || '•'} ${a.name}`;
    $('act-meta').textContent = `${fmtDate(a.start_date_local)} · ${a.type} · ${a.location_city || ''}`;

    const metrics = [
      ['Distanza', fmtKm(a.distance)],
      ['Tempo mov.', fmtTime(a.moving_time)],
      ['Tempo tot.', fmtTime(a.elapsed_time)],
      ['Dislivello', `↑${Math.round(a.total_elevation_gain)} m`],
      ['Vel. media', ((a.average_speed || 0) * 3.6).toFixed(1) + ' km/h'],
      ['Vel. max', ((a.max_speed || 0) * 3.6).toFixed(1) + ' km/h'],
    ];
    if (a.has_heartrate) {
      metrics.push(['FC media', Math.round(a.average_heartrate) + ' bpm']);
      metrics.push(['FC max', Math.round(a.max_heartrate) + ' bpm']);
    }
    if (a.average_watts) metrics.push(['Potenza media', Math.round(a.average_watts) + ' W']);
    if (a.kilojoules) metrics.push(['Energia', Math.round(a.kilojoules) + ' kJ']);
    if (a.suffer_score) metrics.push(['Suffer Score', a.suffer_score]);

    $('act-metrics').innerHTML = metrics.map(([k,v]) =>
      `<div><span class="muted">${k}</span><b>${v}</b></div>`
    ).join('');

    const poly = a.map && (a.map.polyline || a.map.summary_polyline);
    if (poly) {
      const coords = decodePolyline(poly);
      const map = L.map('map').setView(coords[0], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
      const line = L.polyline(coords, { color: '#fc5200', weight: 4 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20] });
    } else {
      $('map').style.display = 'none';
    }

    if (Array.isArray(a.splits_metric) && a.splits_metric.length) {
      $('splits-wrap').hidden = false;
      const maxPace = Math.max(...a.splits_metric.map(s => s.moving_time));
      $('splits').innerHTML = a.splits_metric.map((s, i) => {
        const kmh = s.average_speed ? (s.average_speed * 3.6).toFixed(1) : '—';
        const pct = (s.moving_time / maxPace) * 100;
        return `<li>
          <span class="split-km">km ${i+1}</span>
          <span class="split-bar"><span style="width:${pct}%"></span></span>
          <span class="split-val">${fmtTime(s.moving_time)} · ${kmh} km/h${s.average_heartrate ? ' · '+Math.round(s.average_heartrate)+' bpm' : ''}</span>
        </li>`;
      }).join('');
    }
    if (Array.isArray(a.segment_efforts) && a.segment_efforts.length) {
      $('segments-wrap').hidden = false;
      const sorted = a.segment_efforts.slice().sort((s1, s2) => s2.distance - s1.distance);
      $('segments').innerHTML = sorted.map(s => {
        const kom = s.kom_rank ? `<span class="seg-badge kom">KOM #${s.kom_rank}</span>` : '';
        const pr = s.pr_rank ? `<span class="seg-badge pr">PR #${s.pr_rank}</span>` : '';
        const hr = s.average_heartrate ? ` · ${Math.round(s.average_heartrate)} bpm` : '';
        const w = s.average_watts ? ` · ${Math.round(s.average_watts)} W` : '';
        return `<li>
          <div>
            <div class="seg-name">${escapeHtml(s.name)} ${kom} ${pr}</div>
            <div class="muted" style="font-size:.8rem">${(s.distance/1000).toFixed(2)} km${hr}${w}</div>
          </div>
          <div class="seg-time"><b>${fmtTime(s.moving_time || s.elapsed_time)}</b></div>
        </li>`;
      }).join('');
    }
  } catch (e) {
    // Non collegato: la pagina principale mostra "Collega Strava".
    if (e.code === 'not_connected') { window.location.href = 'index.html'; return; }
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').querySelector('p').textContent = e.message;
  }
}

main();
