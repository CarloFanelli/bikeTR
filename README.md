# BikeTR

Experimental first version of the project, started on **May 7, 2026**.

A browser app (HTML + JavaScript in `web/`, served by a live-reload development server) for cycling analysis and training recommendations based on the user's Strava data. Designed for **personal, local use**: each person runs their own copy on their own computer, connected to their own Strava app. One Docker command starts everything: a web server, the app's development server, a small auth server that holds the Strava secret, the Coach service (Python), and the local AI model used by the Coach. Settings and caches stay in the browser's `localStorage`.

> ⚠️ The app is reachable only from your own computer (`127.0.0.1`), not from other devices on your network. **Do not deploy it to a public website.** The Strava Client ID and client secret live in the `.env` file, which Git ignores: never commit it.

---

## Features

The app is organized into six sections, accessible from the top navigation (`🏠 Home`, `🎯 Training`, `📊 Analysis`, `📋 Activities`, `🧪 Training v2`, `🤖 AI Coach`):

- **🏠 Home** — athlete profile, all-time Strava stats, and a "Data accuracy" card explaining how FTP and LTHR are estimated and how many activities have precise streams (second-by-second NP/TSS calculations) versus approximations (from the summary's `weighted_average_watts`). The "Refresh with streams" button downloads streams for the most recent N cycling activities (default: 40).
- **🎯 Training** — daily recommendation (rest / Z1 / Z2 / Sweet Spot / Threshold / VO2max / strength / mobility / long ride), based on 7/28-day training load, TSB (CTL-ATL), `hardsLast7`, elevation gain, recent strength activities, and mesocycle status. Includes a four-week monthly plan and current-week schedule, with a rest-day calendar (skip → rainy → normal).
- **📊 Analysis** — Power-Duration Curve, fitness trends (CTL/ATL/TSB over the last 90 days), heart-rate zone distribution for the last month, **Power Profile** (weaknesses and strengths), weekly **FTP trend**, **FTP/LTHR breakdown** (showing the exact activities and formulas used to determine the values used in calculations), and targeted workouts for your segments.
- **📋 Activities** — list of the 15 most recent activities. Click one to open its detail page (`activity.html`) with a Leaflet map, per-kilometer splits, and a segment list with KOM/PR badges.
- **🧪 Training v2** — an "evidence-based" engine with a workout catalog and explicit citations (Seiler 4×8, Rønnestad 30/15, Coggan/Allen Sweet Spot, Hunter Allen Over-Unders). Also includes a side-by-side v1 vs. v2 comparison for the four-week plan.
- **🤖 AI Coach** — a workout suggested by a **locally running** LLM via [Ollama](https://ollama.com). The Coach service (Python, in Docker) downloads your rides from Strava, calculates all the context (FTP, LTHR, CTL/ATL/TSB, polarization, recent activities) and performs RAG retrieval from `papers_index.json` (10 endurance-science papers). The model selects a `protocolId` from the deterministic catalog; all calculations (power targets, durations) are performed by the code, never by the model. The tab shows each step and the model's text as it is written. Your rides go only to the Ollama you configured.

For scientific details, formulas, and sources, see **[METHODOLOGY.md](METHODOLOGY.md)**. For the decisions behind the setup, see **[PROCESS.md](PROCESS.md)**.

---

## 1. Install Docker Desktop

Install Docker Desktop and start it before running any command below:

- macOS (Intel and Apple Silicon): <https://docs.docker.com/desktop/setup/install/mac-install/>
- Windows (it also covers WSL 2): <https://docs.docker.com/desktop/setup/install/windows-install/>

If Docker Desktop is not running, the commands fail with Docker's own error message. The commands are the same in the macOS Terminal, in Windows PowerShell and in a WSL terminal.

## 2. Create your Strava app

1. Go to <https://www.strava.com/settings/api> and create an application.
2. Set the following fields:
   - **Category**: any (e.g. "Other")
   - **Website**: `http://localhost:5050`
   - **Authorization Callback Domain**: `localhost` — it must be exactly `localhost`, without `http://` or a port.
3. Make a note of your **Client ID** and **Client Secret**.

## 3. Fill in `.env`

From the project folder, copy the example settings file (the same command works in PowerShell):

```bash
cp .env.example .env
```

Open `.env` and write your Strava credentials:

```
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=your-client-secret
```

Every other setting is optional and already has a default; `.env.example` describes each one:

| Setting | Default | What it changes |
|---|---|---|
| `WEB_PORT` | `5050` | The port of the app's address |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` | The Coach's chat model downloaded at start |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | The embedding model used to search the papers |
| `OLLAMA_CONTAINERS`, `OLLAMA_URL` | Ollama in Docker | Use an Ollama installed on your computer instead (section 5) |

Settings are read when the services start: after changing `.env`, run `docker compose up -d` again. If the Strava credentials are missing, the app still opens and names the settings to fill in.

## 4. Start, open, stop

Start everything (web app, auth server, Coach service, AI Coach model):

```bash
docker compose up -d
```

Open <http://localhost:5050> and click **Collega Strava** (Connect to Strava). Strava asks you to authorize the app, then sends you back to BikeTR with your profile and the 60 most recent activities loaded. The auth server keeps the connection, so later visits and restarts load your data without authorizing again.

**Always open `localhost`, never `127.0.0.1`.** The browser keeps saved data per address, so under `127.0.0.1` your settings and caches are not visible, and Strava always sends you back to `localhost`.

**First start.** Docker downloads about 2 GB of images, installs the app's npm packages and builds the Coach service's image (each takes under a minute), and then downloads about 5 GB of AI models. The app opens once its packages are installed, within about a minute; the Coach works once the models are downloaded, which takes several minutes. To watch the download:

```bash
docker compose logs -f ollama-pull
```

The download is complete when `docker compose ps -a` shows `ollama-pull` as exited with code 0. Later starts skip models that are already downloaded, and an interrupted download resumes at the next start.

**Live reload.** A saved change to a file under `web/` shows in the open page within a few seconds, with no command and no manual reload.

**Stop** everything (models, Strava connection and the rides the Coach saved are kept):

```bash
docker compose down
```

**Full cleanup** — removes the containers, the downloaded models, the stored Strava connection and the rides the Coach service saved; the next start downloads about 5 GB again and asks you to connect to Strava again:

```bash
docker compose down -v
```

**Disconnect** with the "Disconnetti da Strava" button at the bottom of the page: it deletes the Strava tokens held by the auth server and the rides and ride details the Coach service saved. A tab that was already open keeps the access token it holds and can still read Strava until it reloads or the token expires (at most 6 hours).

## 5. AI Coach

The Coach works without any setup: Docker runs Ollama and downloads the two models. Where Ollama runs is set only in `.env` (`OLLAMA_URL`); the Coach's "⚙️ Impostazioni Ollama" panel holds just the chat model name, and **Ping Ollama** asks the Coach service whether Ollama answers and which models are missing, with the command that downloads each one.

**Changing the chat model.** Set `OLLAMA_CHAT_MODEL` in `.env`, run `docker compose up -d`, and write the same model name in the Coach's "Impostazioni Ollama" (Ollama settings) panel. The panel decides which model the Coach requests; `.env` decides which model Docker downloads.

**Slow computers.** In Docker, Ollama runs on the CPU only (Docker cannot use a Mac's GPU). On a laptop without a GPU, one Coach generation with `qwen2.5:7b` can take over 5 minutes (measured on an Intel i5-1240P under WSL). There is no limit on the total time: the tab shows the model's text as it arrives, and the Coach gives up only when the model writes nothing for 3 minutes, including the wait before its first word ("Il modello non ha scritto nulla per 3 minuti"). An answer longer than 1,000 tokens is cut, and the Coach then picks the protocol with its fallback rules. Pick a smaller model such as `qwen2.5:3b`, in `.env` and in the Coach panel, or use the Ollama installed on your computer (below).

**Using the Ollama installed on your computer** (for example to use the GPU of a Mac). This option needs Docker Desktop.

1. Install Ollama from <https://ollama.com> and download both models on your computer:

   ```bash
   ollama pull qwen2.5:7b
   ollama pull nomic-embed-text
   ```

2. In `.env`, remove the `#` from these two lines:

   ```
   OLLAMA_CONTAINERS=0
   OLLAMA_URL=http://host.docker.internal:11434
   ```

3. Run `docker compose up -d`. No Ollama container starts any more.
4. Click **Ping Ollama** in the Coach's "Impostazioni Ollama" panel. If it fails, your Ollama listens only on its own computer's loopback (the default on Linux and WSL) and Docker cannot reach it: start it listening on all interfaces with `OLLAMA_HOST=0.0.0.0 ollama serve`. Other devices on your network can then reach that Ollama too.

**Paper index.** The Coach searches `papers_index.json`, which is part of the repository and built with `nomic-embed-text`: change the embedding model only together with a rebuilt index. The Coach service reads it through nginx, so an edited index counts from the next request. If the file is missing, restore it with `git restore papers_index.json`.

**What a request does.** "Genera workout di oggi" sends the duration, the model name, the browser's time zone and your athlete profile (FTP, threshold and maximum heart rate, weight, weekly hours and days, as the rest of the app estimates them) to the Coach service. The service then names each step in the tab: downloading rides (with the ride-details progress on the first request, e.g. "Scarico dettagli corse 12/40"), searching papers, and the model, whose text appears as it is written.

**Stopping.** A new request from the same tab, a reload, a closed tab, a dropped connection or the 3-minute silence limit closes the connection to Ollama, which stops working on that answer within seconds; requests from other tabs carry on. If the connection to the Coach drops mid-answer, the tab shows "Connessione col Coach interrotta".

## 6. Common problems

- **Port 5050 is already in use** (for example an old `python3 -m http.server 5050` from the previous setup is still running): stop that program, or set another `WEB_PORT` in `.env`. Browser data is kept per address, so after changing the port the data saved under the old one is not visible.
- **The page shows "502 Bad Gateway"**: the app's development server is not running yet. On the first start, and after an update that changes `web/package-lock.json`, it first installs its npm packages, which needs an internet connection; `docker compose logs app` shows the progress or the error.
- **"Server di autenticazione non raggiungibile"** (auth server unreachable): in the first second after a start, reload the page. If it persists, look at `docker compose logs auth`.
- **Strava rejects the connection**: check `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in `.env` and that the Strava app's callback domain is `localhost`, then run `docker compose up -d` again.
- **After updating BikeTR or editing files under `docker/`**: run `docker compose up -d --build --force-recreate`. The services read their configuration files and code only when they start, and `docker compose up -d` alone does not restart a container whose files changed; `--build` reinstalls the Coach service's Python packages when `docker/coach/requirements.txt` changed, and the app's container installs its npm packages again when `web/package-lock.json` changed. Edits to files under `web/` need no command (section 4, Live reload).
- **"Coach non raggiungibile"** (Coach service unreachable): start BikeTR with `docker compose up -d`; if it persists, look at `docker compose logs coach`.
- **The Coach cannot reach Ollama or misses a model**: `docker compose logs ollama-pull` shows the download, and `docker compose exec ollama ollama list` lists the downloaded models.

---

## 7. localStorage layout

All keys written by the app (see `safeLoad`/`safeSave` in `web/strava.js`). The Strava tokens are not here: the auth server keeps them.

| Key | Type | Written by | Contents |
|---|---|---|---|
| `biketr_settings` | object | "Zones/volume settings" form | `{hrMax, hrLthr, ftpDeclared, weeklyHours, weeklyDays, longRides, weight, strengthLevel, lthrSource, ftpSource}` |
| `biketr_planned_rests` | ISO date array | `🎯` calendar view | Days marked as "skip" |
| `biketr_rainy_days` | ISO date array | Rain toggle | Days marked as "rainy" |
| `biketr_streams_cache` | object | "Refresh with streams" | `{activityId: {NP, IF, TSS, hrZones, hrTSS, _fetched}}` |
| `biketr_segments_cache_v2` | object | Retrieve starred segments + hydrate | `{segmentId: {efforts[], _fetched, _segment}}` |
| `biketr_mesocycle` | object | `initMesocycle` | `{blockId, startDate, blockIndex, weekInBlock, blockHistory[], ftpHistory[]}` |
| `biketr_ftp_history` | array | Weekly `recordFtpPoint` | `[{ftp, date, source, meso}, ...]`, up to 52 entries |
| `biketr_coach_settings` | object | AI Coach tab | `{model, lastDuration}`; an `endpoint` saved by older versions is removed |

If a key is corrupted (JSON parsing fails or validation rejects it), a `key.broken` backup is saved and defaults are restored; a warning is logged in the console. Versions before the Docker setup stored the Strava credentials under `biketr_strava`: the app deletes that key (and its `.broken` copy) on first load.

**Full reset of the browser data**: `DevTools → Application → Local Storage → Clear all`. The "Disconnetti da Strava" button only removes the Strava connection.

---

## 8. Runtime configuration

These settings can be changed manually via `localStorage` or in `web/constants.js` (`APP_CONFIG`):

- `maxStreamsFetch` (default: 40) — number of cycling activities for which to download streams when you click "Refresh with streams".
- `maxSegmentsHydrate` (default: 30) — number of activities to analyze for `segment_efforts` when you click "Complete from activity details".

---

## 9. Architecture

Docker Compose services (`compose.yaml`); only the web port is published, on `127.0.0.1`:

```
browser ──► web (nginx, http://localhost:5050)
             ├─ /         → app: Vite's development server for web/, with live reload
             ├─ /papers_index.json → the paper index, from the project folder (read-only)
             ├─ /auth/    → auth: Strava login, keeps client secret and tokens (docker/auth/server.mjs)
             └─ /coach/   → coach: the Coach service, Python with FastAPI (docker/coach);
                            keeps the rides it downloads from Strava in a Docker volume
                            └─► ollama: the Coach's models, kept in a Docker volume
                                (or the Ollama on your computer, set in .env)
ollama-pull: downloads the missing models at start, then exits
```

The browser calls the Strava API directly with short-lived access tokens obtained from `/auth/token`; the client secret and the refresh token never leave the auth server. The nginx configuration is `docker/nginx/default.conf.template`.

ES modules in `web/`, served as they are by Vite's development server. Module flow:

```
constants.js    ← PHYSIO / TYPE_WEIGHTS / APP_CONFIG constants only
strava.js       ← access tokens from the auth server, Strava API fetch, storage (safeLoad/safeSave), fmt/escape utilities
training.js     ← v1 engine: resolveHr, recommend, mesocycles, buildMonthPlan, isHard…
training_v2.js  ← evidence-based workout catalog (Seiler, Rønnestad, Coggan…)
analysis.js     ← power curve, CTL/ATL/TSB, HR zones, power profile, FTP trend
predictions.js  ← starred segments, estimatesFromSegments, time regression
coach.js        ← AI Coach tab: request to the Coach service, live steps, workout card
export.js       ← JSON export of the activities
app.js          ← entry point: view routing, UI rendering, fetch orchestration
activity.js     ← detail page entry point (activity.html)
```

`index.html` loads only `app.js`; `activity.html` loads only `activity.js`. All other modules are resolved through static `import` statements.

---

## 10. Tests

**Browser app.** One command type-checks the app's TypeScript in strict mode, runs its tests, and checks that no source file imports a file that imports it back (directly or through others) and that none is longer than 500 lines. It needs only Docker: no Strava connection, no Ollama, and it can run while BikeTR is running. From the project folder (the same command works in PowerShell):

```bash
docker compose run --rm --no-deps app npm run check
```

A failure names the file and line of each type error, the files of each import loop, and each file over the limit. Today's JavaScript files, which are not TypeScript yet, are left out of these checks.

**Coach service.** The Coach service's tests check that its numbers (normalized power, training load, fitness, fatigue, form, intensity split, capacity tier) equal those of the browser code, and that for the same model answers it builds the same prompts, papers and workout as the browser Coach did. They need only Docker: no Ollama, no Strava connection, and they can run while BikeTR is running. From the project folder (the same command works in PowerShell):

```bash
docker compose run --rm --no-deps coach pytest
```

The tests use made-up activities (`docker/coach/tests/fixtures/rides.json`), made-up Coach requests and model answers (`coach_cases.json`), and the results the browser code gives for them (`metrics_expected.json` and `coach_expected.json` in the same folder). The browser Coach no longer exists: its last version is kept, for these results only, in `docker/coach/tests/reference/coach_before_move.js`. After changing a formula in the browser code, the made-up activities or the cases, regenerate those results by running the browser code in Node, in each time zone the fixtures list:

```bash
docker run --rm -v "${PWD}:/src:ro" -v "${PWD}/docker/coach/tests:/tests" node:22-alpine node /tests/reference/make_reference.mjs
```

---

## 11. Known limitations

- **Local, single-user only**: no cross-device sync or multi-user support. Settings and caches live in the browser, per address.
- **Without Strava streams**, TSS and time in zones are approximated from the summary's `weighted_average_watts` or from hrTSS calculated using average heart rate (e.g. a long Z2 ride with 20 minutes at threshold averages out to Z2). Click "Refresh with streams" for precise calculations: one API call per activity (Strava rate limit: 100 per 15 minutes).
- **An FTP from a dedicated test is always more reliable** than estimates. The four `estimatesFromSegments` methods mitigate but do not eliminate estimation error (±5–10% compared with the true value). A 20-minute all-out test every 4–6 weeks is recommended.
- **The AI Coach depends on Ollama**: while the models download, or if Ollama is unavailable, the tab displays an error. On a CPU-only computer the default model is slow (section 5).
- **The browser's stream reader has no automated test**: the Coach service's tests cover what it sends, and the reader (`coachEvents` in `web/coach.js`) was checked by hand against lines and characters split between network chunks.
