# BikeTR

Experimental first version of the project, started on **May 7, 2026**.

A browser app (Vue and TypeScript in `web/`, served by a live-reload development server) for cycling analysis and training recommendations based on the user's Strava data. Designed for **personal, local use**: each person runs their own copy on their own computer, connected to their own Strava app. One Docker command starts everything: a web server, the app's development server, a small auth server that holds the Strava secret, the Coach service (Python), and the local AI model used by the Coach (a cloud model such as Claude can be chosen instead). Settings and caches stay in the browser's `localStorage`.

> ⚠️ The app is reachable only from your own computer (`127.0.0.1`), not from other devices on your network. **Do not deploy it to a public website.** The Strava Client ID and client secret live in the `.env` file, which Git ignores: never commit it.

---

## Features

The sidebar lists five sections: **Home**, **Allenamento** (Training), **Analisi** (Analysis), **Attività** (Activities) and **Coach AI**, with **Impostazioni** (Settings) and the Strava connection at its bottom. "Riduci a icone" shrinks it to icons, and the choice is kept after a reload.

- **Home** — your Strava profile with "Esporta allenamenti" (JSON export), a "🎯 Precisione dati" (data accuracy) card explaining how FTP and LTHR are estimated and how many activities have precise streams (second-by-second NP/TSS calculations) versus approximations (from the summary's `weighted_average_watts`), and "🧬 Profilo atleta": estimated level, current form, all-time and recent distance, weekly hours, consistency, and your records from the latest ~60 rides. "Aggiorna con streams" (refresh with streams) downloads streams for the 40 most recent cycling activities.
- **Allenamento** — daily recommendation (rest / Z1 / Z2 / Sweet Spot / Threshold / VO2max / strength / mobility / long ride), based on 7/28-day training load, TSB (CTL-ATL), `hardsLast7`, elevation gain, recent strength activities, and mesocycle status. Includes a 28-day calendar (click a day: skip → rainy → normal), the load chart of the last 30 days, and the plan for the next 7 days and four weeks.
- **Analisi** — predictions for your starred Strava segments, the load chart, fitness trends (CTL/ATL/TSB over the last 90 days), the Power-Duration Curve, heart-rate zone distribution for the last month, **Power Profile** (weaknesses and strengths), weekly **FTP trend**, **FTP/LTHR breakdown** (showing the exact activities and formulas used to determine the values used in calculations), and targeted workouts for your segments. Charts show their values on hover.
- **Attività** — list of the 15 most recent activities. Click one to open its detail inside the app, with a Leaflet map, per-kilometer splits, and a segment list with KOM/PR badges.
- **Coach AI** — a workout suggested by an LLM: by default one **running locally** via [Ollama](https://ollama.com), or a cloud model such as Claude, chosen in `.env` (section 5). The Coach service (Python, in Docker) downloads your rides from Strava, calculates all the context (FTP, LTHR, CTL/ATL/TSB, polarization, recent activities) and performs RAG retrieval from `papers_index.json` (10 endurance-science papers). The model selects a `protocolId` from the deterministic catalog; all calculations (power targets, durations) are performed by the code, never by the model. The screen shows each step and the model's text as it is written, and **Stop** ends a request. With Ollama your rides never leave your computer; with a cloud model, the numbers listed in section 5 go to that provider.
- **Impostazioni** — heart-rate zones and thresholds, weekly volume and available days, an optional race, recovery tools, the chat model the Coach uses (with the money spent, for a cloud model) and **Verifica connessione**, and "Disconnetti da Strava".

**Training v2** is the engine behind the plan and the Coach, not a section of its own: an "evidence-based" workout catalog with explicit citations (Seiler 4×8, Rønnestad 30/15, Coggan/Allen Sweet Spot, Hunter Allen Over-Unders) that fills Allenamento's plan, and the capacity tier the Coach uses.

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
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` | The Ollama chat model the Coach uses, downloaded at start |
| `COACH_PROVIDER` | `ollama` | `cloud` makes the Coach use a cloud model such as Claude (section 5) |
| `CLOUD_URL`, `CLOUD_API_KEY`, `CLOUD_MODEL` | none | The cloud provider's address, your key and the model's name; all required with `cloud` |
| `CLOUD_PRICE_IN`, `CLOUD_PRICE_OUT`, `CLOUD_SPENDING_LIMIT` | none | The model's prices in dollars per million tokens, and the most the Coach may spend; all required with `cloud` |
| `OLLAMA_CONTAINERS`, `OLLAMA_URL` | Ollama in Docker | `0` starts no Ollama in Docker: with a cloud model, or to use an Ollama installed on your computer (section 5) |

Settings are read when the services start: after changing `.env`, run `docker compose up -d` again. If the Strava credentials are missing, the app still opens and names the settings to fill in.

## 4. Start, open, stop

Start everything (web app, auth server, Coach service, AI Coach model):

```bash
docker compose up -d
```

Open <http://localhost:5050> and click **Collega Strava** (Connect to Strava). Strava asks you to authorize the app, then sends you back to BikeTR with your profile and the 60 most recent activities loaded. The auth server keeps the connection, so later visits and restarts load your data without authorizing again.

**Always open `localhost`, never `127.0.0.1`.** The browser keeps saved data per address, so under `127.0.0.1` your settings and caches are not visible, and Strava always sends you back to `localhost`.

**First start.** Docker downloads about 2 GB of images, installs the app's npm packages and builds the Coach service's image with its paper search model (each takes a minute or two), and then downloads the Coach's chat model, about 5 GB. The app opens once its packages are installed, within about a minute; the Coach works once the chat model is downloaded, which takes several minutes. To watch the download:

```bash
docker compose logs -f ollama-pull
```

The download is complete when `docker compose ps -a` shows `ollama-pull` as exited with code 0. Later starts skip models that are already downloaded, and an interrupted download resumes at the next start.

**Live reload.** A saved change to a file under `web/` shows in the open page within a few seconds, with no command and no manual reload.

**Stop** everything (models, Strava connection, the rides the Coach saved and the money spent on a cloud model are kept):

```bash
docker compose down
```

**Full cleanup** — removes the containers, the downloaded models, the stored Strava connection, the rides the Coach service saved and the total spent on a cloud model; the next start downloads about 5 GB again and asks you to connect to Strava again:

```bash
docker compose down -v
```

**Disconnect** with the "Disconnetti da Strava" button in Impostazioni: it deletes the Strava tokens held by the auth server and the rides and ride details the Coach service saved; the total spent on a cloud model stays. A tab that was already open loses access too: its next Strava download sends it back to the **Collega Strava** screen.

## 5. AI Coach

The Coach works without any setup: Docker runs Ollama and downloads the chat model, and the Coach service finds the papers with its own small search model, installed with it. The chat model, the one that writes the answer, is chosen only in `.env`: an Ollama model (the default), or a cloud model reached through the OpenAI-compatible format, such as Claude. The key stays in the Coach service: the browser never sees it. The "Coach AI" card in Impostazioni shows the model in use and, for a cloud model, the money spent and the limit. **Verifica connessione** asks the Coach service whether the provider answers and has that model, with the command that downloads it when Ollama lacks it. The check asks for no answer, so it spends no tokens.

**Another Ollama model.** In `.env`, write the model's name as Ollama lists it, for example:

```
OLLAMA_CHAT_MODEL=qwen2.5:3b
```

Then run `docker compose up -d`: Docker downloads that model, and the Coach uses it from the next request.

**A cloud model, such as Claude.** In `.env`, write these lines with your own key, from the provider's console (the key below is a placeholder; `.env` is never committed):

```
COACH_PROVIDER=cloud
CLOUD_URL=https://api.anthropic.com/v1/
CLOUD_API_KEY=your-api-key
CLOUD_MODEL=claude-sonnet-5-5
CLOUD_PRICE_IN=2
CLOUD_PRICE_OUT=10
CLOUD_SPENDING_LIMIT=5
OLLAMA_CONTAINERS=0
```

The prices are dollars per million tokens read (`IN`) and written (`OUT`); the ones above are an example from November 2026, so copy the current ones from the provider's pricing page. `CLOUD_SPENDING_LIMIT` is the most, in dollars, the Coach may spend. `OLLAMA_CONTAINERS=0` stops Docker from starting Ollama and downloading its 5 GB chat model, which a cloud model doesn't need. Run `docker compose up -d`, then click **Verifica connessione** in Impostazioni: it checks that the provider accepts the key and has the model. Another provider that offers the OpenAI-compatible chat format takes its own address in `CLOUD_URL`; so far only Claude's documentation was checked while building this.

**What a cloud provider receives.** With Ollama, in Docker or on your computer, no ride data leaves the computer. With a cloud model, each Coach request sends the provider:

- the athlete numbers: FTP, threshold heart rate, weight, capacity tier, fitness, fatigue and form (CTL, ATL, TSB), the easy and hard share and the total minutes of the last 28 days, and the weekly target hours and days;
- each bike ride of the last 7 days (at most 10): date, type, minutes, kilometres, average watts and average heart rate;
- today's weekday and the minutes available;
- the protocol catalog and the abstracts of the 4 papers the search found.

Activity names, places, maps, your Strava profile and your Strava tokens are never sent; a test checks that no activity name or position reaches the prompt. Strava's API terms set rules on sharing data that comes from Strava, and whether they allow sending it to a cloud AI provider has not been checked yet: read them before choosing a cloud model.

**Money.** Under each cloud workout the screen shows its tokens and its cost, worked out from your prices. When the provider gives no token count, for example after **Stop**, the Coach counts an estimate on the high side instead: 8,000 tokens read and 4,000 written, the most an answer may write. Every cost adds to one total, kept in the Coach's Docker volume: it survives restarts, `docker compose down` and "Disconnetti da Strava", and only `docker compose down -v` erases it. Before each cloud request the Coach compares the total with `CLOUD_SPENDING_LIMIT`; once the limit is reached, requests are refused with "Tetto di spesa raggiunto" until you raise it in `.env` and run `docker compose up -d`. The check comes before the request, so the last answer can take the total slightly past the limit. The total is an estimate from the prices you wrote: the provider's billing page shows the real bill.

**Live check.** To see how the chat model in `.env` behaves without Strava or the browser, run from the project folder:

```bash
docker compose run --rm coach-tools python -m app.live_check
```

The Coach picks a workout in 3 made-up situations, prints one line per situation, and writes everything (protocol chosen, papers, tokens, cost, the whole answer) to a new file in `live-checks/`, named by date, time and model. Commit that file to compare models, or to look at a run made on another computer. With Ollama, start BikeTR first so Ollama is running; with a cloud model, the 3 answers cost money and count toward the same total and limit as the app. `live-checks/README.md` describes the file.

**Slow computers.** In Docker, Ollama runs on the CPU only (Docker cannot use a Mac's GPU). On a laptop without a GPU, one Coach generation with `qwen2.5:7b` can take over 5 minutes (measured on an Intel i5-1240P under WSL). There is no limit on the total time: the Coach AI screen shows the model's text as it arrives, and the Coach gives up only when the model writes nothing for 3 minutes, including the wait before its first word ("Il modello non ha scritto nulla per 3 minuti"). An answer longer than 1,000 tokens is cut, and the Coach then picks the protocol with its fallback rules. Pick a smaller model such as `qwen2.5:3b` in `.env`, or use the Ollama installed on your computer (below).

**Using the Ollama installed on your computer** (for example to use the GPU of a Mac). This option needs Docker Desktop.

1. Install Ollama from <https://ollama.com> and download the chat model on your computer:

   ```bash
   ollama pull qwen2.5:7b
   ```

2. In `.env`, remove the `#` from these two lines:

   ```
   OLLAMA_CONTAINERS=0
   OLLAMA_URL=http://host.docker.internal:11434
   ```

3. Run `docker compose up -d`. No Ollama container starts any more.
4. Click **Verifica connessione** in Impostazioni. If it fails, your Ollama listens only on its own computer's loopback (the default on Linux and WSL) and Docker cannot reach it: start it listening on all interfaces with `OLLAMA_HOST=0.0.0.0 ollama serve`. Other devices on your network can then reach that Ollama too.

**Paper index.** The Coach searches `papers_index.json`, which is part of the repository. Its papers are encoded by the search model inside the Coach service (`BAAI/bge-small-en-v1.5`, downloaded once when the Coach image is built, so the search then works without internet), and the index records that model's name. The Coach service reads it through nginx, so an edited index counts from the next request. If the file is missing, restore it with `git restore papers_index.json`. Two commands rebuild it, and neither needs Ollama:

```bash
# Re-encode the papers already in the index (needed only after changing the search model)
docker compose run --rm coach-tools python -m app.build_index --reencode
# Fetch the paper list again from PubMed, then encode it
docker compose run --rm coach-tools python -m app.build_index
```

Both replace the file only once it is complete: if PubMed does not answer, or the command is interrupted, the index stays as it was.

**What a request does.** "Genera workout di oggi" sends the duration, the browser's time zone and your athlete profile (FTP, threshold and maximum heart rate, weight, weekly hours and days, as the rest of the app estimates them) to the Coach service. The service then names each step on the screen: downloading rides (with the ride-details progress on the first request, e.g. "Scarico dettagli corse 12/40"), searching papers, and the model, whose text appears as it is written.

**Stopping.** **Stop** ends the request and keeps the text written so far, marked "Richiesta interrotta". Stop, a new request from the same tab, a reload, a closed tab, a dropped connection or the 3-minute silence limit closes the connection to the chat model: Ollama stops working on that answer within seconds, and a stopped cloud request still counts toward the spending total; requests from other tabs carry on. Moving to another section does not stop it: back on Coach AI, the answer is still arriving or already there. If the connection to the Coach drops mid-answer, the screen shows "Connessione col Coach interrotta".

## 6. Common problems

- **Port 5050 is already in use** (for example an old `python3 -m http.server 5050` from the previous setup is still running): stop that program, or set another `WEB_PORT` in `.env`. Browser data is kept per address, so after changing the port the data saved under the old one is not visible.
- **The page shows "502 Bad Gateway"**: the app's development server is not running yet. On the first start, and after an update that changes `web/package-lock.json`, it first installs its npm packages, which needs an internet connection; `docker compose logs app` shows the progress or the error.
- **"Server di autenticazione non raggiungibile"** (auth server unreachable): in the first second after a start, reload the page. If it persists, look at `docker compose logs auth`.
- **Strava rejects the connection**: check `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in `.env` and that the Strava app's callback domain is `localhost`, then run `docker compose up -d` again.
- **After updating BikeTR or editing files under `docker/`**: run `docker compose up -d --build --force-recreate`. The services read their configuration files and code only when they start, and `docker compose up -d` alone does not restart a container whose files changed; `--build` reinstalls the Coach service's Python packages when `docker/coach/requirements.txt` changed, and the app's container installs its npm packages again when `web/package-lock.json` changed. Edits to files under `web/` need no command (section 4, Live reload).
- **"Coach non raggiungibile"** (Coach service unreachable): start BikeTR with `docker compose up -d`; if it persists, look at `docker compose logs coach`.
- **The Coach cannot reach Ollama or misses a model**: `docker compose logs ollama-pull` shows the download, and `docker compose exec ollama ollama list` lists the downloaded models.
- **A cloud model fails**: **Verifica connessione** and the Coach AI screen name the cause in Italian: a setting missing from `.env`, a key the provider refuses, a model it doesn't have, a provider it can't reach, or the spending limit. Fix `.env`, run `docker compose up -d`, and check again.

---

## 7. localStorage layout

All keys written by the app (see `safeLoad`/`safeSave` in `web/src/data/storage.ts`). The Strava tokens are not here: the auth server keeps them.

| Key | Type | Written by | Contents |
|---|---|---|---|
| `biketr_settings` | object | Impostazioni, "Salva impostazioni" | `{hrMax, hrLthr, ftpDeclared, weeklyHours, weeklyDays, longRides, weight, strengthLevel, lthrSource, ftpSource, …}` |
| `biketr_planned_rests` | ISO date array | Allenamento's 28-day calendar | Days marked as "skip" |
| `biketr_rainy_days` | ISO date array | Allenamento's 28-day calendar | Days marked as "rainy" |
| `biketr_streams_cache` | object | "Aggiorna con streams" | `{activityId: {NP, IF, TSS, hrZones, hrTSS, _fetched}}` |
| `biketr_segments_cache_v2` | object | Starred segments, loaded at start, and "Completa da dettagli attività" | `{segmentId: {efforts[], _fetched, _segment}}` |
| `biketr_mesocycle` | object | Updated at every start | `{blockId, startDate, blockIndex, weekInBlock, blockHistory[], ftpHistory[]}` |
| `biketr_ftp_history` | array | Today's FTP point, at every start | `[{ftp, date, source, meso}, ...]`, up to 52 entries |
| `biketr_coach_settings` | object | Coach AI (duration) | `{lastDuration}`; the `model` and `endpoint` saved by older versions are removed |
| `biketr_ui` | object | The sidebar's "Riduci a icone" | `{sidebarCollapsed}` |

If a key is corrupted (JSON parsing fails or validation rejects it), a `key.broken` backup is saved and defaults are restored; a warning is logged in the console. Versions before the Docker setup stored the Strava credentials under `biketr_strava`: the app deletes that key (and its `.broken` copy) on first load.

**Full reset of the browser data**: `DevTools → Application → Local Storage → Clear all`. The "Disconnetti da Strava" button only removes the Strava connection.

---

## 8. Runtime configuration

Two download limits are constants in the code; with live reload, a saved change applies at once:

- `MAX_STREAMS_FETCH` in `web/src/data/streams.ts` (default: 40) — number of cycling activities for which "Aggiorna con streams" downloads streams.
- `MAX_SEGMENTS_HYDRATE` in `web/src/data/segments.ts` (default: 30) — number of activities "Completa da dettagli attività" analyzes for `segment_efforts`.

---

## 9. Architecture

Docker Compose services (`compose.yaml`); only the web port is published, on `127.0.0.1`:

```
browser ──► web (nginx, http://localhost:5050)
             ├─ /         → app: Vite's development server for web/, with live reload
             ├─ /papers_index.json → the paper index, from the project folder (read-only)
             ├─ /auth/    → auth: Strava login, keeps client secret and tokens (docker/auth/server.ts)
             └─ /coach/   → coach: the Coach service, Python with FastAPI (docker/coach);
                            keeps the rides it downloads from Strava and the cloud spending total
                            in a Docker volume
                            └─► the chat model chosen in .env: ollama, kept in a Docker volume
                                (or the Ollama on your computer), or a cloud provider such as Claude
ollama-pull: downloads the Ollama chat model at start if it is missing, then exits
coach-tools: starts only when named (docker compose run --rm coach-tools …); rebuilds the paper index
             and runs the live check, writing into the project folder
```

The browser calls the Strava API directly with a short-lived access token it asks `/auth/token` for right before each request, so a tab left open for hours keeps working; the client secret and the refresh token never leave the auth server. The nginx configuration is `docker/nginx/default.conf.template`.

The app is written in Vue and TypeScript under `web/src/`; Vite's development server turns it into JavaScript for the browser as each file is requested, and there is no separate build. `web/index.html` loads only `src/app/main.ts`. Module flow:

```
src/app/        ← start (main.ts), addresses after the # (router.ts), the Strava session, and the long
                  jobs that keep running when you change section: streams refresh, export, segments, Coach
src/screens/    ← one Vue screen per section, plus the activity detail and "Collega Strava"
src/components/ ← cards, charts (Chart.js), the map (Leaflet) and the sidebar the screens are built from
src/core/       ← calculations, which get everything as input (no page, saved data or clock):
                  stream metrics, training load, CTL/ATL/TSB, FTP and LTHR estimates and trend,
                  power curve and profile, segment predictions; formatting of distances, times and dates;
                  mesocycle and taper (meso.ts), the evidence-based workout catalog (training-v2.ts:
                  Seiler, Rønnestad, Coggan…), the training plan (plan/: daily recommendation,
                  load chart, 6-week model, week and 4-week plan), and the texts each screen shows
src/data/       ← Strava API (one access token per request), auth server, values saved in the browser,
                  streams and starred segments download, JSON export, Coach service request and answer reader
```

Addresses look like `http://localhost:5050/#/analisi`. Links to the old activity page, `activity.html?id=…`, are sent by nginx to that activity's detail (`/#/attivita/…`); any other value of `id` goes to Home.

---

## 10. Tests

**Browser app and Auth server.** One command type-checks their TypeScript in strict mode, runs their tests (the Auth server's with a simulated Strava), and checks that no source file imports a file that imports it back (directly or through others) and that none is longer than 500 lines. It needs only Docker: no Strava connection, no Ollama, and it can run while BikeTR is running. From the project folder (the same command works in PowerShell):

```bash
docker compose run --rm --no-deps app npm run check
```

A failure names the file and line of each type error, the files of each import loop, and each file over the limit.

The Coach tests (`web/tests/coach/`) feed made-up answers to the browser's answer reader, with lines and characters such as "è" or an emoji split between network chunks, and to the request in progress: a new request or Stop must end the older one, and nothing it sends afterwards may appear.

The calculation tests (`web/tests/core/`) run on made-up rides, settings and segments (`web/tests/fixtures/rides.json`) and, for the training plan, on made-up days, weeks of rides, settings and saved values (`plan-cases.json`). They compare every result, at two decimals, with the one the JavaScript app gave before it was rewritten in TypeScript (`load-expected.json` and `plan-expected.json` in the same folder). Those files were recorded once from that app and are not regenerated: a test that fails against them means a calculation changed.

**Coach service.** The Coach service's tests check that its numbers (normalized power, training load, fitness, fatigue, form, intensity split, capacity tier) equal those of the browser code, and that for the same model answers it builds the same prompts, papers and workout as the browser Coach did. They need only Docker: no Ollama, no cloud provider (made-up ones answer instead), no Strava connection, and they can run while BikeTR is running. From the project folder (the same command works in PowerShell):

```bash
docker compose run --rm --no-deps coach pytest
```

The tests use made-up activities (`docker/coach/tests/fixtures/rides.json`), made-up Coach requests and model answers (`coach_cases.json`), and the results the browser code gives for them (`metrics_expected.json` and `coach_expected.json` in the same folder). The browser Coach no longer exists: its last version is kept, for these results only, in `docker/coach/tests/reference/coach_before_move.js`. After changing a formula in the browser calculations (`web/src`), the made-up activities or the cases, regenerate those results by running those calculations and the old browser Coach in Node, in each time zone the fixtures list:

```bash
docker run --rm -v "${PWD}:/src:ro" -v "${PWD}/docker/coach/tests:/tests" node:22-alpine node /tests/reference/make_reference.mjs
```

---

## 11. Known limitations

- **Local, single-user only**: no cross-device sync or multi-user support. Settings and caches live in the browser, per address.
- **Without Strava streams**, TSS and time in zones are approximated from the summary's `weighted_average_watts` or from hrTSS calculated using average heart rate (e.g. a long Z2 ride with 20 minutes at threshold averages out to Z2). Click "Aggiorna con streams" for precise calculations: one API call per activity (Strava rate limit: 100 per 15 minutes).
- **An FTP from a dedicated test is always more reliable** than estimates. The four `estimatesFromSegments` methods mitigate but do not eliminate estimation error (±5–10% compared with the true value). A 20-minute all-out test every 4–6 weeks is recommended.
- **The AI Coach depends on its chat model**: with Ollama, while the model downloads or if Ollama is unavailable, the Coach AI screen shows an error, and on a CPU-only computer the default model is slow (section 5). A cloud model needs internet, costs money, and stops at the spending limit.
