# BikeTR

Experimental first version of the project, started on **May 7, 2026**.

A static app (HTML + JavaScript, no backend) for cycling analysis and training recommendations based on the user's Strava data. Designed for **personal, local use**: OAuth authentication, settings, and caches are stored in the browser's `localStorage`.

> ⚠️ Strava's `client_secret` is stored in plain text in `localStorage`. The source code can be public, but **do not deploy the app to a public website**. Use it only on your own machine at `http://localhost`.

---

## Features

The app is organized into six sections, accessible from the top navigation (`🏠 Home`, `🎯 Training`, `📊 Analysis`, `📋 Activities`, `🧪 Training v2`, `🤖 AI Coach`):

- **🏠 Home** — athlete profile, all-time Strava stats, and a "Data accuracy" card explaining how FTP and LTHR are estimated and how many activities have precise streams (second-by-second NP/TSS calculations) versus approximations (from the summary's `weighted_average_watts`). The "Refresh with streams" button downloads streams for the most recent N cycling activities (default: 40).
- **🎯 Training** — daily recommendation (rest / Z1 / Z2 / Sweet Spot / Threshold / VO2max / strength / mobility / long ride), based on 7/28-day training load, TSB (CTL-ATL), `hardsLast7`, elevation gain, recent strength activities, and mesocycle status. Includes a four-week monthly plan and current-week schedule, with a rest-day calendar (skip → rainy → normal).
- **📊 Analysis** — Power-Duration Curve, fitness trends (CTL/ATL/TSB over the last 90 days), heart-rate zone distribution for the last month, **Power Profile** (weaknesses and strengths), weekly **FTP trend**, **FTP/LTHR breakdown** (showing the exact activities and formulas used to determine the values used in calculations), and targeted workouts for your segments.
- **📋 Activities** — list of the 15 most recent activities. Click one to open its detail page (`activity.html`) with a Leaflet map, per-kilometer splits, and a segment list with KOM/PR badges.
- **🧪 Training v2** — an "evidence-based" engine with a workout catalog and explicit citations (Seiler 4×8, Rønnestad 30/15, Coggan/Allen Sweet Spot, Hunter Allen Over-Unders). Also includes a side-by-side v1 vs. v2 comparison for the four-week plan.
- **🤖 AI Coach** — a workout suggested by a **locally running** LLM via [Ollama](https://ollama.com). The JavaScript code calculates all the context (FTP, LTHR, CTL/ATL/TSB, polarization, recent activities) and performs RAG retrieval from `papers_index.json` (10 endurance-science papers). The model selects a `protocolId` from the deterministic catalog; all calculations (power targets, durations) are performed by JavaScript. No data leaves your Mac.

For scientific details, formulas, and sources, see **[METHODOLOGY.md](METHODOLOGY.md)**.

---

## 1. Strava setup

1. Go to <https://www.strava.com/settings/api> and create an application.
2. Set the following fields:
   - **Category**: any (e.g. "Other")
   - **Website**: `http://localhost:5050`
   - **Authorization Callback Domain**: `localhost` — it must be exactly `localhost`, without `http://` or a port.
3. Make a note of your **Client ID** and **Client Secret**.

## 2. Run the app

ES modules require a local HTTP server (`file://` will not work). From the project directory, run:

```bash
python3 -m http.server 5050
```

Open <http://localhost:5050>. On your first visit, enter your Client ID and Client Secret, click "Save and connect to Strava", and authorize the app on Strava. You'll return to the app with your profile and the 60 most recent activities loaded. The `refresh_token` is saved, so data loads automatically on subsequent visits.

---

## 3. AI Coach setup (optional)

The AI Coach requires [Ollama](https://ollama.com) installed locally.

```bash
# Install Ollama
brew install ollama

# Required models (~5 GB total)
ollama pull qwen2.5:7b              # chat model (default, can be changed)
ollama pull nomic-embed-text         # embeddings for paper retrieval

# Allow the browser to connect to Ollama (CORS)
launchctl setenv OLLAMA_ORIGINS "http://localhost:5050,http://127.0.0.1:5050"
brew services restart ollama
```

Generate the paper index (requires Node.js; takes about 10 seconds, downloads abstracts from PubMed, and calculates embeddings via Ollama):

```bash
node build_papers_index.mjs
```

The script populates `papers_index.json` with 10 endurance-science papers (Seiler 2010/2013, Rønnestad 2014/2020, Vikmoen 2016, Mujika 2018, Laursen 2002, Buchheit 2013, Stoggl 2014, Almquist 2020). Re-run it only if you want to update the queries in `SEARCHES[]`.

In the `🤖 AI Coach` tab, open "Ollama settings" to change the endpoint or model and ping the service.

---

## 4. localStorage layout

All keys written by the app (see `safeLoad`/`safeSave` in `strava.js`):

| Key | Type | Written by | Contents |
|---|---|---|---|
| `biketr_strava` | object | OAuth setup, refresh | `{clientId, clientSecret, accessToken, refreshToken, expiresAt}` |
| `biketr_settings` | object | "Zones/volume settings" form | `{hrMax, hrLthr, ftpDeclared, weeklyHours, weeklyDays, longRides, weight, strengthLevel, lthrSource, ftpSource}` |
| `biketr_planned_rests` | ISO date array | `🎯` calendar view | Days marked as "skip" |
| `biketr_rainy_days` | ISO date array | Rain toggle | Days marked as "rainy" |
| `biketr_streams_cache` | object | "Refresh with streams" | `{activityId: {NP, IF, TSS, hrZones, hrTSS, _fetched}}` |
| `biketr_segments_cache_v2` | object | Retrieve starred segments + hydrate | `{segmentId: {efforts[], _fetched, _segment}}` |
| `biketr_mesocycle` | object | `initMesocycle` | `{blockId, startDate, blockIndex, weekInBlock, blockHistory[], ftpHistory[]}` |
| `biketr_ftp_history` | array | Weekly `recordFtpPoint` | `[{ftp, date, source, meso}, ...]`, up to 52 entries |
| `biketr_coach_settings` | object | AI Coach tab | `{endpoint, model, lastDuration}` |

If a key is corrupted (JSON parsing fails or validation rejects it), a `key.broken` backup is saved and defaults are restored; a warning is logged in the console.

**Full reset**: the Home page footer's "Disconnect / reset" option only removes Strava credentials. To reset everything: `DevTools → Application → Local Storage → Clear all`.

---

## 5. Runtime configuration

These settings can be changed manually via `localStorage` or in `constants.js` (`APP_CONFIG`):

- `maxStreamsFetch` (default: 40) — number of cycling activities for which to download streams when you click "Refresh with streams".
- `maxSegmentsHydrate` (default: 30) — number of activities to analyze for `segment_efforts` when you click "Complete from activity details".
- `ollamaTimeoutMs` (default: 180000 = 3 min) — timeout for each Ollama call (embeddings + chat). If exceeded, the UI reports an error instead of hanging.

---

## 6. Architecture

ES modules, no bundler. Module flow:

```
constants.js    ← PHYSIO / TYPE_WEIGHTS / APP_CONFIG constants only
strava.js       ← OAuth, Strava API fetch, storage (safeLoad/safeSave), fmt/escape utilities
training.js     ← v1 engine: resolveHr, recommend, mesocycles, buildMonthPlan, isHard…
training_v2.js  ← evidence-based workout catalog (Seiler, Rønnestad, Coggan…)
analysis.js     ← power curve, CTL/ATL/TSB, HR zones, power profile, FTP trend
predictions.js  ← starred segments, estimatesFromSegments, time regression
coach.js        ← AI Coach (Ollama RAG + deterministic catalog)
app.js          ← entry point: view routing, UI rendering, fetch orchestration
activity.js     ← detail page entry point (activity.html)
```

`index.html` loads only `app.js`; `activity.html` loads only `activity.js`. All other modules are resolved through static `import` statements.

---

## 7. Known limitations

- **Local, single-user only**: no backend, cross-device sync, or multi-user support. Everything lives in the browser.
- **Client secret in localStorage**: a risk if you share the machine or expose the app online. Do not do so.
- **Without Strava streams**, TSS and time in zones are approximated from the summary's `weighted_average_watts` or from hrTSS calculated using average heart rate (e.g. a long Z2 ride with 20 minutes at threshold averages out to Z2). Click "Refresh with streams" for precise calculations: one API call per activity (Strava rate limit: 100 per 15 minutes).
- **An FTP from a dedicated test is always more reliable** than estimates. The four `estimatesFromSegments` methods mitigate but do not eliminate estimation error (±5–10% compared with the true value). A 20-minute all-out test every 4–6 weeks is recommended.
- **The AI Coach depends on Ollama**: if the daemon is unavailable, the tab displays an error. See section 3 for setup.

---

## Reset

The Home page footer's "Disconnect / reset" option removes credentials. To clear everything, use `DevTools → Application → Local Storage → "Clear All"`.
