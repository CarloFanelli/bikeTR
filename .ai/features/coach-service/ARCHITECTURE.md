---
feature: coach-service
spec-version: 1.0
status: approved
---

# Architecture Plan: Coach Service

## Technical Approach

### Overview

A new `coach` service in `compose.yaml` runs Python 3.12: FastAPI on uvicorn, `httpx` for the Auth server, Strava and Ollama, `pytest` for the tests. It is built from `docker/coach/Dockerfile` with only the dependencies baked in; the code is mounted read-only like the auth server, so `docker compose up -d --force-recreate` picks up code changes. nginx proxies `/coach/` to it without buffering; it publishes no port and keeps ride data in a `coach-data` volume. The browser keeps the Coach's screen and sends each request with the athlete profile and its time zone; the service answers with a stream of newline-separated JSON events. Every ported formula and text is checked against reference values produced by running the browser code itself in Node (`node:22-alpine`, frozen clock, fixed `TZ`), committed as test fixtures.

### Shared Concerns

#### Same-origin guard

- **Appears in**: Task 01, Task 03, Task 04
- **Reference example**: `docker/auth/server.mjs:197-201`
- **Rule**: every `POST` route of the Coach service refuses a request whose `Sec-Fetch-Site` header is present and not `same-origin`, before doing any work.

#### Italian errors with a code

- **Appears in**: Task 01, Task 03, Task 04, Task 05
- **Reference example**: `strava.js:168-172` (codes mapped to Italian messages) and the error boxes in `coach.js:681-704`
- **Rule**: the service answers `{error: code, message}` (an `error` event inside a stream) with an Italian message; the browser shows `message` in a `.coach-error` box, and turns a failed fetch or an nginx 502 into "Coach non raggiungibile: avvia BikeTR con docker compose up -d".

#### Decision log

- **Appears in**: Task 01, Task 02, Task 03, Task 04, Task 05
- **Reference example**: `PROCESS.md` (docker-setup section)
- **Rule**: each task appends its decisions to a new coach-service section of `PROCESS.md` (date, Decision, Why, Cost); entries are never rewritten.

## Per-Task Technical Guidance

### Task 01: coach-service-setup

**Files to create:**
- `docker/coach/Dockerfile` — `python:3.12-slim` (time zone data included, checked), installs `requirements.txt`, `PYTHONDONTWRITEBYTECODE=1`, uvicorn on port 8080, one worker.
- `docker/coach/requirements.txt` — exact pins: fastapi, uvicorn, httpx, pytest.
- `docker/coach/app/main.py` — app, same-origin guard, `GET /coach/ping?model=`.
- `docker/coach/app/ollama.py` — address from `OLLAMA_URL`; installed models via `/api/tags`.

**Files to modify:**
- `compose.yaml` — `coach` service shaped like `auth` (`:22-36`: `init: true`, `./docker/coach:/app:ro`, no `ports`) plus `build`, `OLLAMA_URL`; `web` depends on it.
- `docker/nginx/default.conf.template` — `location /coach/` copying `/auth/` (`:50-53`), plus `proxy_buffering off` and `proxy_read_timeout 300s` (as `:46`).
- `coach.js` — settings without endpoint (`:36-41`, `:802-813`); ping through `/coach/ping` (`:789-796`, `:816-827`).
- `index.html:228-230,244-248` — drop the Endpoint field and its help.
- `README.md` — sections 5, 6 (`docker compose logs coach`), 9.

**Key decisions:**
- FastAPI, uvicorn, httpx: streaming with disconnect handling and async HTTP come built in; later roadmap steps are Python libraries anyway.
- First Dockerfile in the project: only a dependency change needs `docker compose up -d --build`.

**Watch out for:**
- nginx forwards `/coach/…` with its prefix (variable `proxy_pass`, `default.conf.template:51-52`) → every route lives under `/coach/`; test: `curl localhost:5050/coach/ping` answers 200.
- A saved `endpoint` keeps steering generation (`coach.js:675`) until Task 04 → delete the key on load and stop reading it; test: a saved `{endpoint:"http://x"}` disappears after opening the Coach.

---

### Task 02: training-numbers

**Files to create:**
- `docker/coach/app/metrics.py` — ports ride-details figures from streams (`strava.js:64-106`, kept unrounded), loads (`training.js:285-420`), form trend (`analysis.js:85-108`), intensity split and recent rides (`coach.js:51-87`), capacity tier (`training_v2.js:24-33`), context (`coach.js:88-108`).
- `docker/coach/app/jscompat.py` — JavaScript `Math.round`, JavaScript number-to-text, a ride's day in the browser's time zone.
- `docker/coach/tests/fixtures/rides.json` — made-up rides and figures.
- `docker/coach/tests/reference/make_reference.mjs` — runs the browser modules in Node with a `localStorage` stub, frozen clock, `TZ=Europe/Rome` (checked: they import cleanly); writes `metrics_expected.json`.
- `docker/coach/tests/test_metrics.py`, `docker/coach/pytest.ini` (`-p no:cacheprovider`: read-only mount).

**Files to modify:**
- `README.md` — Tests: `docker compose run --rm --no-deps coach pytest`, and how to regenerate references.

**Key decisions:**
- The athlete profile replaces `resolveHr` (`analysis.js:86`, `coach.js:89`): the service never estimates FTP or heart rates.
- Ride details hold FTP-independent figures; TSS and hrTSS are computed per request and rounded before the type weight, like `_metrics.TSS * w` (`training.js:401-402`).

**Watch out for:**
- Python `round()` sends halves to even, JavaScript up → every `Math.round` and `round5` goes through `jscompat`; test: fixtures hitting x.5 in TSS and in a watt target.
- JavaScript reads `start_date_local` ("…Z") as UTC, then takes local midnight (`analysis.js:90-91`) → day buckets in the request's zone; test: a 23:30 ride lands on the next day under Europe/Rome.
- The 90-day window crosses a daylight-saving change, absorbed by `Math.round` on day differences (`analysis.js:91`) → same arithmetic; test: fixture spanning late October.
- TSS uses the watts sample count, hrTSS the heart-rate count (`strava.js:84,103`) → store both; test: a ride whose counts differ.

---

### Task 03: ride-download

**Files to create:**
- `docker/coach/app/strava.py` — token from `http://auth:8080/auth/token` (`docker/auth/server.mjs:181-195`), 60 latest activities (`app.js:404`), streams as `strava.js:57`, details for the latest 40 rides (`strava.js:110`).
- `docker/coach/app/store.py` — saved rides and ride details as JSON in `/data`; temp file plus rename (`docker/auth/server.mjs:48-54`); unreadable means nothing saved (`:36-46`).
- `docker/coach/tests/test_rides.py` — simulated Strava and Auth server with `httpx.MockTransport`.

**Files to modify:**
- `compose.yaml` — `coach-data:/data`, declared like `auth-data`.
- `docker/coach/app/main.py` — `POST /coach/forget`; a ride refresh that reports progress, for Task 04.
- `app.js:379-382` — Disconnect also posts `/coach/forget`, ignoring failures, before reloading.
- `README.md` — section 4: `down -v` also deletes the Coach's saved rides.

**Key decisions:**
- Saved activities keep only fields the Coach reads (id, type, date, duration, distance, power, heart rate, climbing, suffer score, athlete id): no coordinates, maps or names.
- Details outside the latest 40 are dropped at each successful download, which also clears another athlete's data.
- Strava 429, 5xx or no network: the list falls back to the saved one, a detail to summary figures.

**Watch out for:**
- Disconnect during downloads could re-save deleted data (cf. `docker/auth/server.mjs:202-204`) → `forget` bumps a generation number under the store lock; writers check it; test: forget mid-download leaves `/data` empty.
- Two requests downloading the same ride → one in-flight download per ride id, like `renewing ??=` (`docker/auth/server.mjs:187`); test: two concurrent refreshes, one stream request per ride.
- The lock holds only inside one process → keep uvicorn at one worker (Task 01 `Dockerfile`); test: none, configuration.
- A ride without power or heart rate must not be retried, a failed one must (`strava.js:117`) → store "no details" apart from "failed"; test: both across two refreshes.
- The Auth server answers 401 also when credentials are missing (`docker/auth/server.mjs:182-183`) → same "Collega Strava" path; test: 401 from the simulated Auth server.
- A token in `/data` or in logs leaks it → log counts only; test: no token string in `/data` after a run.

---

### Task 04: workout-on-service

**Files to create:**
- `docker/coach/app/protocols.py` — catalog, builds, fallback (`coach.js:110-438`).
- `docker/coach/app/prompts.py` — prompts verbatim, retrieval query (`coach.js:486-502,520-582`).
- `docker/coach/app/papers.py` — index mounted read-only, cosine top 4, ties in index order (`coach.js:444-517`).
- `docker/coach/app/workout.py` — validation, rides (Task 03), context (Task 02), papers, streamed chat, parse (`coach.js:597-608`), fallback, cited papers (`coach.js:741-782`).
- `docker/coach/tests/test_protocols.py`, `test_prompts.py`, `test_papers.py`; `make_reference.mjs` also captures today's `coach.js` results before removal.

**Files to modify:**
- `docker/coach/app/main.py` — `POST /coach/workout`, events `step`, `token`, `result`, `error`.
- `docker/coach/app/ollama.py` — embeddings, streamed chat (`coach.js:473-484,584-595`).
- `coach.js` — remove `:43-608`; `coach_generate` posts duration, model, profile (`resolveHr` plus weight and weekly volume), time zone; reads the stream; keeps `renderCoachWorkout` (`:623-666`).
- `compose.yaml` — mount `papers_index.json` into `coach`; drop `OLLAMA_URL` from `web`.
- `docker/nginx/default.conf.template:39-47` — remove `/ollama/`.
- `constants.js:67` — remove `ollamaTimeoutMs`.
- `README.md`, `METHODOLOGY.md` change log.

**Key decisions:**
- Streamed `POST` read through `fetch`: `EventSource` cannot send a body.
- The app's `/ollama/` address goes with its last user; template and variable leave together.

**Watch out for:**
- JavaScript prints `null` as "null" and 42.0 as "42" (`coach.js:575`, `:81`) → format through `jscompat`; test: prompt fixture with empty weekly hours and a whole-kilometre ride.
- "OGGI" is the browser's weekday (`coach.js:43-45`) → computed in the request's zone; test: Sunday 23:30 UTC gives "lunedì" for Europe/Rome.
- `abstract.slice(0, 1200)` counts UTF-16 units (`coach.js:525`) → matches Python only without astral characters; test: prompt fixtures over all 10 papers.
- httpx's default timeout (5 s, verify in `site-packages/httpx/_config.py`) ends a chat before its first word → explicit 180 s read timeout; test: fake Ollama answering after 10 s.
- A stream chunk can split a line or a character → `TextDecoder` in stream mode plus a line buffer; test: events split across chunks render.
- FastAPI's validation error is English → map it to the Italian message naming the field; test: duration 241.

---

### Task 05: stop-and-time-limit

**Files to create:**
- `docker/coach/tests/test_cancel.py` — fake Ollama that records when its client disconnects.

**Files to modify:**
- `docker/coach/app/ollama.py` — `options.num_predict: 1000`; `done_reason: "length"` means fallback.
- `docker/coach/app/workout.py` — on timeout or disconnect, leave the Ollama stream so its connection closes and Ollama stops; the 180 s read timeout (Task 04) becomes the Italian message with the README link.
- `coach.js` — no browser time limit; a stream ending without `result`, not aborted by this tab (`:697-698`), shows "Connessione col Coach interrotta".
- `README.md` — section 5: the limit is 3 minutes of silence, not total time.

**Key decisions:**
- The limit is a per-read timeout in the service: it measures silence, exactly what REQ-12 asks.
- The 1,000-token cap is Ollama's own option, so the model stops itself.

**Watch out for:**
- Whether Starlette cancels a streaming response when the client leaves depends on the installed version → read `site-packages/starlette/responses.py`; test: a disconnect closes the fake Ollama connection within 5 s.
- Aborting the previous request rejects its reader with `AbortError` (`coach.js:697-698`) → show nothing for it; test: two quick clicks show only the second result.
- Requests share no "current request" state → closing one tab leaves another running; test: two concurrent streams, one cancelled.
