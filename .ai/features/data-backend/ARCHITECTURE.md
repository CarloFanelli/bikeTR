---
feature: data-backend
spec-version: 1.1
status: approved
---

# Architecture Plan: Data Backend

## Technical Approach

### Overview

A `db` service (PostgreSQL, pinned image, `db-data` volume, no published port) joins `compose.yaml`; only the Coach service connects to it, through one new module that owns the connection pool and applies numbered SQL migrations at startup (no migration framework: one new package, the PostgreSQL driver). The Coach's file-based ride store (`docker/coach/app/store.py`) is replaced by database tables, keeping its `generation` guard against "Disconnetti da Strava" arriving mid-download. The browser stops calling Strava on load and talks to new `/coach/...` routes; its synchronous `load*`/`save*` API in `web/src/data/storage.ts` keeps its shape over an in-memory copy of the server's athlete data, so the screens' call sites barely change. `session.activities` stays the latest 60, so every analysis window (REQ-17) is untouched; only Attività and Home's last ride read the whole list.

### Shared Concerns

#### Coach client in the browser

- **Appears in**: Task 02, Task 03, Task 04, Task 05, Task 06
- **Reference example**: `web/src/data/coach.ts:14` (`askCoach`, `CoachAnswer`)
- **Rule**: every new server call goes through `askCoach` and returns a `CoachAnswer`; screens show failures with `ErrorNotice` and `retry`, as `LibraryScreen.vue` does.

#### Database access and its tests

- **Appears in**: Task 01, Task 02, Task 05, Task 06
- **Reference example**: `docker/coach/app/db.py` (created in Task 01); test isolation as in `docker/coach/tests/conftest.py:24` (`saved_library` fixture)
- **Rule**: SQL lives only in the store modules; each test runs against a separate test database emptied before every test, never the athlete's.
- **Watch out for**: the gate runs `docker compose run --rm --no-deps coach pytest`; with a database the tests need `db`, so the command loses `--no-deps` (README Tests section and `.ai/memory/docker.md`).

#### Disconnect guard

- **Appears in**: Task 01, Task 02, Task 03
- **Reference example**: `docker/coach/app/store.py:47` (`generation` checked inside `update`)
- **Rule**: every write of Strava data checks, in the same transaction, that no forget happened since the download started; a stale write saves nothing.

## Per-Task Technical Guidance

### Task 01: database-and-first-sync

**Files to modify:**
- `compose.yaml` — `db` service with healthcheck and `db-data` volume; `coach` depends on it healthy; `DATABASE_URL` in `x-coach-env`.
- `.env.example` — `POSTGRES_PASSWORD` with a local default and a comment.
- `docker/coach/requirements.txt` — the PostgreSQL driver with its pool, pinned.
- `docker/coach/app/strava.py` — paged activity list (200 per page, `after` the newest saved), 30-day re-read, athlete and stats requests.
- `docker/coach/app/main.py` — pool in `lifespan` (`:58`), `POST /coach/sync`, `/coach/forget` deleting rows, old `/data/rides.json` removed at startup.
- `docker/coach/app/workout.py`, `graph.py` — read rides from the new store.
- `README.md` — services list and Tests command.

**Files to create:**
- `docker/coach/app/db.py` — pool and migration runner.
- `docker/coach/migrations/001_strava_data.sql` — activities (full Strava summary), ride details, athlete, stats, sync state.
- `docker/coach/app/activities.py` — the store replacing `store.py`, same `generation` contract.
- `docker/coach/tests/test_sync.py` — pattern `tests/test_rides.py`.

**Key decisions:**
- The full Strava summary is stored, map polyline included: Attività needs it (Task 04), unlike the Coach's trimmed `KEPT_FIELDS` (`strava.py:18`).
- The 5-minute throttle and last-sync time live in the sync state, so a restart does not reset them.

**Watch out for:**
- A sync finishing after "Disconnetti" re-inserts deleted rides — `docker/coach/app/store.py:47` → generation check inside the write transaction; test: forget during a running sync leaves no rows.
- Two simultaneous syncs both call Strava — `docker/coach/app/strava.py:64` (single-flight dict) → one shared sync task; test: two concurrent `POST /coach/sync` make one list request.
- Tests writing the athlete's real database — `docker/coach/tests/conftest.py:24` → autouse fixture on a test database; test: none.

---

### Task 02: ride-details-background

**Files to modify:**
- `docker/coach/app/main.py` — start the background downloader in `lifespan`, stop it on shutdown; `GET /coach/details/progress`.
- `docker/coach/app/strava.py` — reuse `_download` (`:158`); record each response's `X-RateLimit-Usage`.
- `web/src/components/DataPrecisionCard.vue` — progress line ("{N} su {M}", "Dettagli completi") instead of "Aggiorna con streams".
- `web/src/app/jobs.ts` — remove `streamsJob`/`refreshStreams` (`:17-33`).

**Files to create:**
- `docker/coach/app/details.py` — the downloader loop: newest activity with power or heart rate and no details, failed ones last.
- `docker/coach/tests/test_details.py`.

**Key decisions:**
- Own budget (60/15 min, 600/day) counted in the sync state; Strava's reported 15-minute usage ≥ 80 also pauses, leaving room for app syncs and browser segment jobs.
- The browser's streams cache stays applied until Task 06, so loads keep their precision between tasks.

**Watch out for:**
- The loop dies on an unexpected error and never restarts — `docker/coach/app/main.py:58` → catch per activity, log counts only; test: one failing activity, the next still downloads.
- After "Disconnetti" the loop keeps downloading with an old token — `store.py:47` → generation check per activity; test: forget stops the loop's writes.

---

### Task 03: app-reads-server

**Files to modify:**
- `web/src/app/session.ts` — `startSession` (`:38-56`) asks `POST /coach/sync` then reads athlete, stats and the latest 60 activities from the server; the sync status feeds `session.notice`.
- `web/src/data/coach.ts` — sync, athlete and activities calls.
- `web/src/data/strava.ts` — drop `fetchAthlete`, `fetchAthleteStats` and the activities call if nothing else uses them (`export.ts` keeps its own).
- `web/src/components/AppTopBar.vue` — "Aggiorna da Strava" item next to `:100`, disabled with a spinner while running.
- `web/src/app/jobs.ts` — a `syncJob` like `segmentsJob`.
- `docker/coach/app/main.py` — `GET /coach/athlete` (athlete, stats, last sync, notice) and `GET /coach/activities?limit=`.

**Patterns to reuse:**
- Coach client in the browser (see Shared Concerns); reactive job state as `app/jobs.ts:17`.

**Watch out for:**
- A server "not connected" answer shows an error instead of "Collega Strava" — `web/src/app/session.ts:84` → map the service's `not_connected` to `AuthError`; test: sync answering 401 sets phase `connect`.
- "Aggiorna da Strava" during a running sync starts a second one — `jobs.ts:20` pattern → early return while running; test: two clicks, one request.

---

### Task 04: all-activities-screens

**Files to modify:**
- `web/src/screens/ActivitiesScreen.vue` — filter and search (`:51`) over the full list; show 60 more when a sentinel at the end becomes visible; subtitle and empty texts (`:64`, `:102`, `:104`) without "le ultime 60".
- `web/src/screens/HomeScreen.vue` — `lastRide` (`:52`) on the full list.
- `docker/coach/app/main.py` — `GET /coach/activities` without `limit` returns every activity, fields the cards use only.

**Files to create:**
- `web/src/app/all-activities.ts` — the full list, loaded once per session and refreshed after a sync.

**Patterns to reuse:**
- The card map that loads when it scrolls into view in `ActivitiesScreen.vue` for the end sentinel.

**Key decisions:**
- `session.activities` stays the latest 60: power curve, records, level, plan and charts keep today's input (REQ-17).

**Watch out for:**
- 2,000 full summaries exceed the 1-second target — `docker/coach/app/main.py` new route → return only card fields; test: response size and time with 2,000 fixture rows.

---

### Task 05: athlete-data-server

**Files to modify:**
- `web/src/data/storage.ts` — `load*`/`save*` for settings, planned rests, rainy days, FTP history, mesocycle, segment cache and Coach settings read and write an in-memory copy and send each save to the server; theme, Analisi tab and Attività view stay on `localStorage` (`:127-160`).
- `web/src/app/session.ts` — load the athlete data before computing anything; migrate local data when the server says it is empty.
- `web/src/screens/SettingsScreen.vue` (`:44`), `TrainingScreen.vue` (`:27`), `CoachScreen.vue` (`:43`), `data/segments.ts` (`:71-143`) — handle a failed save.
- `docker/coach/app/main.py` — `GET /coach/athlete-data`, `PUT /coach/athlete-data/{key}`, `POST /coach/athlete-data/import`; forget deletes only the segment cache.

**Files to create:**
- `docker/coach/migrations/002_athlete_data.sql`, `docker/coach/app/athlete_data.py` (validation per key from `web/src/core/settings.ts`), tests.

**Key decisions:**
- Import succeeds only on an empty server, in one transaction; a second browser gets a "not empty" answer and just deletes its copies (REQ-13).

**Watch out for:**
- Validation rejects real saved settings, so migration loses them — `web/src/core/settings.ts` → accept every field `Settings` declares; test: import a fully filled settings object.
- A save failing silently while the screen shows it saved — `SettingsScreen.vue:44` → keep the failure path; test: server down, save shows the error.

---

### Task 06: metrics-from-coach

**Files to modify:**
- `docker/coach/app/main.py` — `POST /coach/metrics` (profile in, per-activity load and 90-day daily/ctl/atl/tsb out) from `metrics.activity_load` (`:116`) and `form_trend` (`:148`) with stored details.
- `web/src/app/session.ts` — fetch metrics after the profile; store loads on the activities and the form.
- Callers of `buildFormTrend`: `AnalysisScreen.vue:61`, `app/today.ts:29`, `core/plan/week.ts:135`, `core/plan/month.ts:84`, `core/plan/recommend.ts:114` — read the server form.
- Callers of `activityLoad`: `core/home.ts:148`, `plan/load-chart.ts:28`, `plan/recommend.ts:54-55,298-299`, `plan/model.ts:25,50` — read the activity's server load, falling back to the formula only for simulated workouts (`month.ts:109,115`).
- `compose.yaml` — `app` mounts `docker/coach/tests/fixtures` read-only, like `./docker/auth`.
- `web/src/data/storage.ts` (`:30-40`), `data/streams.ts`, `core/streams.ts` — removed once unused.

**Files to create:**
- `web/tests/core/load-reference.test.ts` — browser `activityLoad` against `metrics_expected.json` loads.

**Watch out for:**
- Day boundaries differ between server and browser time zones — `docker/coach/app/metrics.py:148` → send the browser's time zone; test: fixture time zones.
- Simulated workouts mixed into `acts` lose their load — `core/plan/month.ts:115` → formula fallback when no server load; test: plan weeks unchanged on the reference inputs.

---

### Task 07: mesocycle-on-open

**Files to modify:**
- `web/src/screens/TrainingScreen.vue` — on opening, save the mesocycle when its current week differs from the saved one.
- `web/src/core/meso.ts` — `nextMesocycle` (`:204`) reports a week change inside a block, not only a new block (`:229`).
- `web/src/app/session.ts` — `updateMesocycle` (`:62`) keeps saving only on a real change.

**Patterns to reuse:**
- `web/tests/core/` meso tests for the week-change case.
