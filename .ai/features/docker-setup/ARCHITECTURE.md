---
feature: docker-setup
spec-version: 1.0
status: approved
---

# Architecture Plan: Docker Setup

## Technical Approach

### Overview

A `compose.yaml` at the repository root runs four services: nginx (serves the repository read-only and proxies `/ollama/` and `/auth/`), Ollama, a one-shot model-pull service, and the auth server. Only the web port is published, on the host loopback. The browser code keeps its structure: only the Ollama base address (`coach.js`) and the token source (`strava.js`) change, so every screen keeps its current flow. Secrets enter only through `.env` into the auth server's environment; Strava tokens live in a named volume, never inside the repository tree that nginx serves. No build step, no Dockerfile, no npm packages.

### Shared Concerns

#### Settings via `.env` with compose defaults

- **Appears in**: Task 02, Task 03, Task 04
- **Reference example**: `build_papers_index.mjs:10` (environment value with a built-in fallback)
- **Rule**: every setting is read through compose interpolation with a default (`${NAME:-default}`), secrets without one, and gets a commented line in `.env.example`; start never requires `.env` to exist.

#### Same-origin routing through nginx

- **Appears in**: Task 02, Task 03, Task 04
- **Reference example**: `docker/nginx/default.conf.template` (created in Task 02)
- **Rule**: the browser talks only to `http://localhost:${WEB_PORT}`; `/ollama/` and `/auth/` are proxied to services that publish no host port.
- **Watch out for**: an upstream host name resolved when nginx starts makes nginx refuse to start while that service is down; resolve through Docker's DNS (`resolver 127.0.0.11`) with a variable upstream, and then strip path prefixes explicitly.

## Per-Task Technical Guidance

### Task 01: normalize-line-endings

**Files to create:**
- `.gitattributes` — text files normalized to LF; binaries auto-detected by Git.

**Files to modify:**
- The 17 tracked files now in CRLF — convert the working copy to LF so `git status` is clean; content stays identical.

**Key decisions:**
- Convert in place rather than re-checking out: `git diff --ignore-cr-at-eol` is empty today, but a checkout would silently drop any real edit made before `/dev` starts.

**Watch out for:**
- A `git reset --hard` or checkout used to renormalize discards real uncommitted edits — repository root → re-run `git diff --ignore-cr-at-eol --stat` first, convert in place; test: `git status` lists only new files.

---

### Task 02: docker-web-startup

**Files to create:**
- `compose.yaml` — service `web`: official nginx alpine image (multi-arch), port `127.0.0.1:${WEB_PORT:-5050}:80`, repository mounted read-only as the html root, template mounted into `/etc/nginx/templates/`.
- `docker/nginx/default.conf.template` — static serving with `Cache-Control: no-cache` (REQ-13), deny rules, Host check.
- `.env.example` — `WEB_PORT` with its default.

**Files to modify:**
- `.gitignore` — add `.env`.

**Patterns to reuse:**
- Settings via `.env` with compose defaults; Same-origin routing through nginx (see Shared Concerns).

**Key decisions:**
- Bind-mount the repository instead of copying files into an image: edits show on reload (REQ-13) and the web service needs no Dockerfile.
- Stop is `docker compose down`; full cleanup is `docker compose down -v` (removes the named volumes added in Tasks 03 and 04).

**Watch out for:**
- Mounting the repository root lets nginx serve `.env` (the client secret, Task 04) and `.git` — template → deny every path segment starting with a dot and `/docker/`; test: `curl localhost:5050/.env` returns no content.
- A website in the user's browser can rebind its domain to 127.0.0.1 and read same-origin responses such as `/auth/token` — template → answer only Host `localhost` or `127.0.0.1`; test: `curl -H 'Host: evil.test'` is refused.
- The nginx image only substitutes variables passed in its environment, in files named `*.template` — `compose.yaml` → pass each substituted variable under `environment:`; test: start with no `.env`.

---

### Task 03: coach-ollama-service

**Files to modify:**
- `compose.yaml` — `ollama` (official multi-arch image, named volume `ollama-models`, no `ports`, `scale: ${OLLAMA_CONTAINERS:-1}`); `ollama-pull` (same image, same scale, inline `sh -c`: for each model, `ollama show` else `ollama pull`); `web` gets `OLLAMA_URL` (default `http://ollama:11434`) and `extra_hosts: host.docker.internal:host-gateway`.
- `docker/nginx/default.conf.template` — `location /ollama/` proxied to `${OLLAMA_URL}`, prefix stripped.
- `coach.js:28` — default address `/ollama`; `coach.js:33` maps a saved `http://localhost:11434` (with or without trailing slash) to unset (REQ-11).
- `coach.js:442`, `coach.js:703` — "restore `papers_index.json` from git" and Docker hints instead of `node`.
- `index.html:207`, `:228`, `:241-250` — placeholder `/ollama`; host-Ollama guidance replaces the `launchctl` help.
- `.env.example` — model names; commented host-mode block (`OLLAMA_CONTAINERS=0`, `OLLAMA_URL=http://host.docker.internal:11434`).

**Key decisions:**
- Host mode is one commented two-line block: compose cannot derive a container count from the URL (an empty `scale` fails interpolation, tested).
- Extend `coach.js` (834 lines) in place: only a constant, the settings loader and two strings change.

**Watch out for:**
- Chat calls use `stream: false` (`coach.js:584`), so no bytes flow until the end; nginx's default 60 s read timeout would cut CPU generations — template → read timeout ≥ 180 s (`constants.js:63`); test: a 2-minute generation succeeds.
- Ollama rejects browser Origins it does not allow (403) — template → clear the Origin header on `/ollama/`; test: a Coach generation from the browser returns 200.
- `web` waiting for the model pull or an Ollama health check would delay the page past 15 s on first start — `compose.yaml` → `web` depends on `ollama` only `service_started`, `required: false`; test: page loads during the first download.
- `ollama-pull` can run before the Ollama server answers — `compose.yaml` → health check on `ollama` or a retry loop in the pull command; test: `down -v` then `up` downloads both models.

---

### Task 04: strava-auth-server

**Files to create:**
- `docker/auth/server.mjs` — Node, no packages (pattern: `build_papers_index.mjs`: ESM, global `fetch`). Routes under `/auth/`: `status`, `login` (random `state`, redirect to Strava, scope as `app.js:200`), `callback` (`state` checked, exchange at the endpoint of `strava.js:170`, then redirect to `/`), `token`, `logout` (POST). Tokens in a JSON file under `/data`.

**Files to modify:**
- `compose.yaml` — `auth` service (Node alpine image, `./docker/auth` read-only, named volume `auth-data`, env `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `WEB_PORT`); `web` depends on it.
- `docker/nginx/default.conf.template` — `location /auth/` to the auth server.
- `.env.example` — two Strava placeholders.
- `strava.js:31-32`, `:169-210` — replace state, exchange and refresh helpers with a token getter calling `/auth/token` (errors: not connected, unreachable) and a legacy-cleanup function.
- `app.js:28-35`, `:194-201`, `:378-430` — drop the redirect URI, OAuth start, code exchange and credentials form; setup screen driven by `/auth/status`; logout via POST.
- `index.html:22-35` — setup section: message plus Connect link.
- `activity.js:25-32`, `export.js:365-367`, `:383`, `:435` — use the token getter.

**Key decisions:**
- Node without packages (user choice), styled like `build_papers_index.mjs`.
- One in-flight renewal promise shared by all requests; token file written via temp file and rename.
- `state` held in memory with a short expiry (single user).

**Watch out for:**
- Exports capture one token before the throttled loop (`export.js:435`) and fail once it expires — `export.js` → get the token per request through the getter; test: with a short expiry, a long export continues.
- `safeLoad` writes a `biketr_strava.broken` backup that can hold the secret (`strava.js:16`) — cleanup → remove `biketr_strava` and `biketr_strava.broken`; test: seed both keys, load the app, both are gone.
- Strava may rotate the refresh token on each renewal (`strava.js:206`); two parallel renewals invalidate one — `server.mjs` → share one in-flight renewal; test: two concurrent token requests near expiry call Strava once.
- A crash mid-write corrupts the token file — `server.mjs` → temp file plus rename; an unreadable file means not connected; test: truncate the file, `/auth/token` answers not connected.
- Logging Strava request bodies or the environment leaks the secret — `server.mjs` → log route, status and Strava HTTP status only; test: after a failed exchange, `docker compose logs auth` has no secret.
- The activity page checks `state.refreshToken` (`activity.js:29`) and would always redirect — `activity.js` → redirect only on the getter's not-connected error; test: open a bookmarked activity while connected.

---

### Task 05: docs-and-process-log

**Files to modify:**
- `README.md` — sections 2–3 become the Docker flow; section 1 adds `.env`; section 4 drops the `biketr_strava` row; sections 6–7 add the services and drop the client-secret limitation; the opening warning is updated.

**Files to create:**
- `PROCESS.md` — dated entries (2026-11-05): Ollama in Docker on CPU by default; host-mode block; port 5050 and `localhost` kept; Docker-only; paper-index rebuild dropped; secret in `.env` via the auth server; browser calls Strava directly; Node auth server without packages; LF line endings; dotfile and Host guards.

**Patterns to reuse:**
- The README's numbered-section layout (`README.md:28` onward).
