---
feature: vue-ts-restructure
spec-version: 1.0
status: approved
---

# Architecture Plan: Vue + TypeScript Restructure

## Technical Approach

### Overview

A new `web/` folder holds the browser app: Task 01 moves today's files there unchanged, and a new `app` container (official `node:22-alpine`, no published port) runs Vite's live-reload server behind nginx, which keeps the host guard and serves `/papers_index.json` to the Coach service. Calculations move first into `web/src/core/`, plain TypeScript that Node 22 runs directly (v22.23.4 in `node:22-alpine` strips types by default, checked in this run), so today's screens use them at once and the Coach's reference script keeps proving the Python numbers. The new app (Vue 3, vue-router with hash history, Vuetify with Material Design Icons, Chart.js) grows at `/nuova/` beside today's app on the same origin, sharing saved browser data, and Task 12 swaps them. One command, `docker compose run --rm --no-deps app npm run check`, runs `vue-tsc`, the Auth server's type check, Vitest and a structure script.

### Shared Concerns

#### Typed core calculations

- **Appears in**: Task 04, Task 05, Task 07, Task 08, Task 09, Task 10, Task 11
- **Reference example**: `strava.js:64` (`computeStreamsMetrics`: inputs in, numbers out)
- **Rule**: `web/src/core/*.ts` receive everything as parameters (settings, segment estimates, mesocycle state, FTP history, `today`), never touch the page, storage or clock, use only erasable TypeScript and `.ts` relative imports, and import only other core files.
- **Watch out for**: helpers that save while computing (`initMesocycle` `training.js:1138`, `recordFtpPoint` `analysis.js:356`) split into a pure next-state function plus a save in the data layer.

#### Data layer

- **Appears in**: Task 03, Task 06, Task 07, Task 08, Task 10, Task 11
- **Reference example**: `strava.js:11-50`, `strava.js:165-217`
- **Rule**: everything Strava, Auth server, Coach service and `localStorage` goes through `web/src/data/`; storage keys and formats stay those of README §7; every Strava request asks `/auth/token` first.

#### Screen pattern

- **Appears in**: Task 06, Task 07, Task 08, Task 09, Task 10, Task 11
- **Reference example**: `web/src/screens/ConnectScreen.vue` (Task 06 sets it)
- **Rule**: one single-file component per section in `web/src/screens/`, built from Vuetify components; Strava text only through `{{ }}`, never `v-html`; work that must outlive a section change (streams refresh, export, segment completion, Coach request) lives in a module store under `web/src/app/`.

#### Coach reference check

- **Appears in**: Task 01, Task 03, Task 04, Task 05, Task 12
- **Reference example**: `README.md:225` (regeneration command), `README.md:219` (Python tests)
- **Rule**: before a task is done, regenerate the Coach reference results and run `git diff --exit-code docker/coach/tests/fixtures`, then `docker compose run --rm --no-deps coach pytest`.

## Per-Task Technical Guidance

### Task 01: web-toolchain

**Files to modify:**
- `compose.yaml` — `app` service: mounts `./web:/workspace/web`, `./docker/auth:/workspace/docker/auth:ro`, volume `web-modules` on `/workspace/web/node_modules`; `web` depends on it.
- `docker/nginx/default.conf.template` — `location /` proxies to `app:5173` (resolver variable as `:37-39`); exact `location = /papers_index.json` from the root mount (`:12`).
- `docker/coach/tests/reference/make_reference.mjs:32-35` — read modules from `/src/web`.
- `README.md` §4, §6 (`:142`), §10 — live reload, update and check commands.

**Files to create:**
- `web/` — today's `index.html`, `activity.html`, `style.css` and root `.js` (not `build_papers_index.mjs`), unchanged.
- `web/package.json`, lockfile — Vue, vue-router, Vuetify, `@mdi/js`, Chart.js, vue-chartjs, Leaflet; dev: Vite, plugin-vue, TypeScript, vue-tsc, Vitest, `@types/node`, `@types/leaflet`.
- `web/vite.config.ts` — `0.0.0.0:5173`, polling watcher, Vitest settings.
- `web/tsconfig.json` — strict, `noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`.
- `web/scripts/start.sh` — `npm ci` when the lockfile hash differs from the one stored in `node_modules`, then Vite; shell style as `compose.yaml:74-82`.
- `web/scripts/check-structure.ts` — import loops and 500-line limit; legacy files excluded.

**Key decisions:**
- Official image plus start script, no Dockerfile (PROCESS "official images" entry); packages in a volume, so the computer's `node_modules` never enter.

**Watch out for:**
- Coach paper search breaks if `/` stops serving the project root — `docker/coach/app/papers.py:13` → exact-match location on the read-only mount; test: fetch `http://web/papers_index.json` from the coach container, 200.
- `add_header Cache-Control "no-cache" always` at server level stacks on Vite's headers — `default.conf.template:23` → move it into the paper-index location; test: `curl -sI localhost:5050/` shows one Cache-Control.
- Vite refuses Host `app:5173` and its live-reload client dials 5173 — nginx sends `Host $host` and Upgrade headers; `hmr.clientPort` = `WEB_PORT`, `allowedHosts` localhost and 127.0.0.1; verify in installed vite; test: save shows without reload.
- `/@fs/` paths could serve files outside `web/` — only `web/` and the auth folder (read-only) are mounted; `server.fs.allow` = `/workspace/web`; test: `curl localhost:5050/@fs/workspace/docker/auth/server.mjs` refused.

---

### Task 02: auth-server-typescript

**Files to modify:**
- `docker/auth/server.mjs` → `server.ts` — typed handlers, token shape and routes; logic unchanged.
- `compose.yaml:22` — `node /app/server.ts`.

**Files to create:**
- `web/tsconfig.auth.json` — strict, `types: ["node"]`, `erasableSyntaxOnly`, includes `../docker/auth/*.ts`; the `check` script runs it.

**Patterns to reuse:**
- Token validation and atomic write `server.mjs:36-54`, single renewal `server.mjs:79-105`, kept as they are.

**Key decisions:**
- No runtime packages (PROCESS 2026-11-05); `@types/node` sits in `web/` dev packages only for the check.

**Watch out for:**
- Node refuses non-erasable TypeScript (enums, parameter properties) at start, so login dies — `server.mjs:12` → `erasableSyntaxOnly`; test: `docker compose up -d --force-recreate auth`, `/auth/status` answers.
- Token file must keep `{access_token, refresh_token, expires_at}` — `server.mjs:39-41,51` → same fields and checks; test: start on the existing `auth-data` volume, status says connected.

---

### Task 03: strava-data-access

**Files to create:**
- `web/src/data/storage.ts` — `safeLoad`/`safeSave`, keys and day marks from `strava.js:5-50,137-163`, same `.broken` backup.
- `web/src/data/auth.ts` — status, token, logout (`strava.js:165-209`).
- `web/src/data/strava.ts` — `stravaGet(path)` taking a token per call; streams download and refresh without a token parameter.
- `web/src/data/strava-types.ts` — activity, athlete, stats, segment; omittable fields optional.
- `web/src/core/format.ts` — `fmtKm`, `fmtTime`, `fmtDate`, `isoDay`.

**Files to modify:**
- `web/strava.js` — re-exports the new modules under today's names until Task 12.
- `web/app.js:404-440`, `web/predictions.js:12-126`, `web/export.js:22-45,381`, `web/activity.js:31-32` — drop token parameters.
- `web/coach.js:73` — `escHtml` duplicate replaced by the shared `escapeHtml`.

**Patterns to reuse:**
- Data layer (see Shared Concerns); auth error codes `strava.js:168-193`.

**Watch out for:**
- Long loops reuse one token for up to 40 downloads — `strava.js:108-122`, `predictions.js:12-15`, `app.js:440` → token per request in `stravaGet`; test: fake auth counts one `/auth/token` per Strava call.
- The frozen Coach copy imports six names from `./strava.js` — `coach_before_move.js:5` → shim keeps them; test: Coach reference check.

---

### Task 04: ride-load-calculations

**Files to create** (in `web/src/core/`)**:**
- `streams.ts` (`strava.js:64-105`), `load.ts` (`training.js:285-441`), `hr.ts` (`training.js:22-143`), `profile.ts` (`training.js:144-224`).
- `form.ts`, `power.ts`, `ftp.ts` — builders and insights from `analysis.js:12-39,85-231,278-301,352-732,891-965`.
- `segments.ts` — `predictions.js:127-322,350-442`.
- `web/tests/reference/record.ts` — runs today's modules with a simulated browser and frozen clock (pattern `make_reference.mjs:56-70`), writes `web/tests/fixtures/`; run before converting.
- `web/tests/core/*.test.ts` — compare after display rounding.

**Files to modify:**
- `web/training.js`, `web/analysis.js`, `web/predictions.js`, `web/strava.js` — drop moved functions, import core.
- `web/app.js:259-263` — FTP history saved through the data layer.

**Key decisions:**
- Segment estimates, FTP history, mesocycle and `today` become parameters.

**Watch out for:**
- training and analysis import each other — `analysis.js:3-7`, `training.js:9` → shared load functions in `core/load.ts`; test: structure check.
- `resolveHr` reads the segment cache via `estimatesFromSegments()` — `training.js:113` → caller passes estimates; the generator patches `resolveHr` by text (`make_reference.mjs:42-43`) → retarget; test: Coach reference check.
- `recordFtpPoint` saves mid-calculation — `analysis.js:356-391` → pure next history plus one save per load; test: stored history after a load equals today's.

---

### Task 05: training-plan-calculations

**Files to create** (in `web/src/core/`)**:**
- `meso.ts` — `MESO_BLOCKS`, taper, block choice, next mesocycle state (`training.js:1007-1266`).
- `plan/dates.ts` (`training.js:442-513`), `plan/recommend.ts` (`:514-828`), `plan/week.ts` (`:960-1006,1267-1744,1828-1854`), `plan/load-chart.ts` (series from `:869-921`).
- `training-v2.ts` — `training_v2.js`, mesocycle as input.
- Tests and fixtures as Task 04.

**Files to modify:**
- `web/training.js`, `web/training_v2.js` — rendering only, importing core.
- `web/app.js:259` — mesocycle update through the data layer.
- `docker/coach/tests/reference/make_reference.mjs:28-51` — instead of copying browser files, write shim `strava.js`, `training.js`, `analysis.js`, `training_v2.js` re-exporting core under the names `coach_before_move.js:5-8` imports, with the `resolveHr` override in the shim.

**Watch out for:**
- `recommend` returns text with `escapeHtml(todayAct.name)` — `training.js:568` → core returns raw text, old `renderTrainingCard` escapes; fixture names avoid `&<>"'`; test: activity `<b>Muro</b>` shows literally in both apps.
- `initMesocycle` saves while computing — `training.js:1138-1190` → pure next state, data layer saves; test: fixture with a stored mesocycle advances identically.
- training and training v2 import each other — `training_v2.js:12,144` → both import `core/meso.ts`; test: structure check.

---

### Task 06: app-shell-navigation

**Files to create:**
- `web/nuova/index.html` — entry loading `src/app/main.ts`.
- `web/src/app/main.ts` — Vue app, Vuetify theme (today's colors), router.
- `web/src/app/router.ts` — hash routes `/home`, `/allenamento`, `/analisi`, `/attivita`, `/attivita/:id`, `/coach`, `/impostazioni`; anything else to `/home`.
- `web/src/app/session.ts` — status, athlete, stats, 60 activities loaded once, cached streams, mesocycle and FTP-history updates (as `app.js:396-424`).
- `web/src/App.vue`, `web/src/components/AppSidebar.vue` — collapse saved under new key `biketr_ui`.
- `web/src/screens/ConnectScreen.vue` (`app.js:365-371`), placeholder screens linking to `/`.

**Patterns to reuse:**
- Data layer and Screen pattern (see Shared Concerns).

**Key decisions:**
- Hash routing works under `/nuova/` and later `/` with no server change; today's app already uses `#home` (`app.js:134`).

**Watch out for:**
- `not_connected` during load must show the connect screen, not an error — `app.js:478-481` → same branch in `session.ts`; test: delete tokens, reload, connect screen.
- `?auth_error=` arrives at `/` — `server.mjs:159-174`, `app.js:387-394` → port messages into `ConnectScreen` now; they show from Task 12.

---

### Task 07: settings-screen

**Files to create:**
- `web/src/screens/SettingsScreen.vue` — fields as `index.html:51-114`, ping as `coach.js:241-250`, host-Ollama text from the Coach tab.
- `web/src/core/settings.ts` — limits, defaults and save coercion (`app.js:205-250`); validation naming the field.

**Files to modify:**
- `web/src/data/storage.ts` — Coach settings saved by merging.
- `web/src/app/router.ts` — leave guard for unsaved changes.

**Watch out for:**
- Coach Save overwrites `{model, lastDuration}` — `coach.js:262-265` → merge into the stored object; test: saving the model keeps the last duration.
- Empty fields save as absent, hours default 6 — `app.js:229-246` → same coercion; test: values saved by the new screen read identically in today's app.

---

### Task 08: home-and-activities

**Files to create:**
- `web/src/screens/HomeScreen.vue` — precision card `app.js:35-115`, profile `training.js:244-284`, athlete `app.js:146-160`.
- `web/src/screens/ActivitiesScreen.vue` (`app.js:162-181`), `ActivityDetailScreen.vue` (`activity.js:24-111`, Leaflet package, tiles as `activity.js:63`).
- `web/src/core/polyline.ts` (`activity.js:9-23`).
- `web/src/data/export.ts`, `web/src/components/ExportDialog.vue` — from `export.js`.
- `web/src/app/jobs.ts` — streams refresh and export with progress and a running flag.

**Patterns to reuse:**
- Screen pattern (see Shared Concerns).

**Watch out for:**
- After a streams refresh today's app recomputes everything — `app.js:106-108` → session recomputes from cached streams; test: TSS source badge changes after a refresh.
- Export waits 10 s between requests — `export.js:14-15` → runs in `jobs.ts`; test: leave Home mid-export, progress continues.

---

### Task 09: training-screen

**Files to create:**
- `web/src/screens/TrainingScreen.vue` — from `app.js:252-355`, `training.js:763-868,1745-1894`.
- `web/src/components/RestCalendar.vue` — `training.js:829-859`; day cycle via data layer (`strava.js:150-163`).
- `web/src/components/LineChart.vue` — Chart.js line, hover on the nearest point by index; load series from `core/plan/load-chart.ts`.

**Patterns to reuse:**
- Typed core calculations, Screen pattern (see Shared Concerns).

**Watch out for:**
- Marking a day must recompute the plan — `app.js:348-353` → recompute from session after the day cycle; test: skip today, the next-workout preview appears.

---

### Task 10: analysis-screen

**Files to create:**
- `web/src/screens/AnalysisScreen.vue` with cards: power curve (`analysis.js:40-84`, logarithmic axis), form (`:232-277`), heart-rate zones bars (`:302-351`), power profile (`:733-816`), FTP trend (`:817-890`), FTP/LTHR breakdown (`:966-1065`), predictions (`predictions.js:468-524`, static sparkline `:323-349`), segment workouts (`:443-467`).
- `web/src/data/segments.ts` — `predictions.js:12-126`; completion as a job in `jobs.ts` (`app.js:434-449`).

**Patterns to reuse:**
- `LineChart.vue` from Task 09; Screen pattern (see Shared Concerns).

**Watch out for:**
- Segment error list inserted unescaped — `app.js:456` → render names with `{{ }}`; test: error for segment `<b>Muro</b>` shows literally.

---

### Task 11: coach-screen

**Files to create:**
- `web/src/data/coach.ts` — request, ping, `readCoachEvents` from `coach.js:53-70`.
- `web/src/app/coach-run.ts` — module store: AbortController, step, live text, result, Stop.
- `web/src/screens/CoachScreen.vue` — result card from `coach.js:77-180`; profile as `coach.js:38-51`.
- `web/tests/coach/*.test.ts` — readable streams split mid-line and mid-character; fake fetch for cancellation.

**Key decisions:**
- Stop aborts the fetch; the Coach service already stops Ollama when the client leaves (`docker/coach/tests/test_cancel.py`).

**Watch out for:**
- An AbortController tied to the component aborts when the user changes section — keep it in `coach-run.ts`, abort only on a new request or Stop; test: switch section mid-answer, text continues.
- Late events and a swallowed `AbortError` — `coach.js:209-211,217` → check `signal.aborted` after every await; test: fake stream emitting after abort draws nothing.

---

### Task 12: switch-to-new-app

**Files to modify:**
- `web/index.html` — becomes the new app entry; delete `web/nuova/`, legacy `web/*.js`, `web/activity.html`, `web/style.css`, `web/tests/reference/record.ts`.
- `web/scripts/check-structure.ts` — drop legacy exclusions.
- `docker/nginx/default.conf.template` — `location = /activity.html` redirects a digits-only `$arg_id` to `/#/attivita/<id>`, otherwise `/`.
- `README.md` features (`:11-24`), §7 (`biketr_ui`), §8, §9 (`:178-212`), §10, §11; `PROCESS.md` dated entries; `METHODOLOGY.md` file references.

**Watch out for:**
- The redirect would copy an untrusted id into Location — digits-only regex; test: `/activity.html?id=1%0d%0aX` goes to `/`.
- Leftover legacy exclusions make the checks pass vacuously — remove them; test: a 501-line file fails the check.
