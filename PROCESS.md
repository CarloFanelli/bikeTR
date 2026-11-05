# Process log

The decisions taken while building BikeTR, with the reason behind each one and what it costs. Entries are appended and never rewritten: when a later feature reverses a decision, a new dated entry records the change and points back to the old one.

## docker-setup — one-command local setup (2026-11-05)

Before this feature, running BikeTR took four manual, macOS-only steps (a Python web server, Homebrew, a `launchctl` CORS setting, a Node script) and the Strava client secret lived in the browser.

### 2026-11-05 · Docker Compose is the only supported way to run BikeTR

- **Decision**: one `compose.yaml` starts everything with `docker compose up -d` and stops it with `docker compose down`; the README documents no manual alternative.
- **Why**: the same two commands work on macOS (Intel and Apple Silicon), Windows and WSL, and one documented path is easier to keep true than two.
- **Cost**: Docker Desktop is required, and the first start downloads about 2 GB of images.

### 2026-11-05 · Official images and bind mounts, no Dockerfile and no build step

- **Decision**: nginx, Ollama and Node run from their official images; the project folder is mounted read-only into nginx and served with revalidation (`Cache-Control: no-cache`).
- **Why**: a personal project should stay simple, and an edit to HTML, JavaScript or CSS must show after a normal browser reload, with no rebuild.
- **Cost**: configuration files under `docker/` are read only when a container starts, so changing them needs `docker compose up -d --force-recreate`.

### 2026-11-05 · Each person runs their own copy with their own Strava app

- **Decision**: BikeTR is installed per computer; each user creates a Strava app and writes its credentials in their own `.env`.
- **Why**: anyone should be able to use the app with their own Strava account without a shared server holding everyone's tokens.
- **Cost**: every user goes through the Strava app setup once.

### 2026-11-05 · Port 5050 and the `localhost` address are kept

- **Decision**: the app stays at `http://localhost:5050`, with the port changeable in `.env`.
- **Why**: browser data (settings, FTP history, caches) is stored per address, so keeping the old address keeps existing data; Strava's callback domain is `localhost`.
- **Cost**: users must always open `localhost`, never `127.0.0.1`, and changing the port hides data saved under the old one.

### 2026-11-05 · Only the web port is published, on the loopback, behind host and file guards

- **Decision**: the web port is bound to `127.0.0.1`; Ollama and the auth server have no host port. nginx answers 403 to any host name other than `localhost` or `127.0.0.1`, and never serves dotfiles (`.env`, `.git`) or the `docker/` folder.
- **Why**: other devices on the network must not reach the app, a hostile web page must not read it through DNS rebinding, and the project folder that nginx serves also contains `.env`.
- **Cost**: none for a single local user.

### 2026-11-05 · The Strava secret moves to `.env` now, behind a small auth server

- **Decision**: a Node auth server reads the Client ID and client secret from `.env`, runs the OAuth login (with a random `state` check) and keeps the refresh token in a Docker volume. The browser gets only short-lived access tokens.
- **Why**: keeping secrets out of the browser and out of tracked files from the start is basic hygiene, and a later server-side AI agent can reuse the server-held tokens.
- **Cost**: one more service, and a one-time reconnection, since the credentials the old version saved in the browser are deleted.

### 2026-11-05 · The browser keeps calling the Strava API directly

- **Decision**: only login and token renewal go through the auth server; every Strava API call still goes from the browser to Strava with an access token.
- **Why**: the smallest change that removes the secret from the browser; every Strava screen keeps its code and its behavior.
- **Cost**: after Disconnect, a tab that was already open can read Strava until it reloads or its access token expires (at most 6 hours).

### 2026-11-05 · The auth server is plain Node with no packages

- **Decision**: `docker/auth/server.mjs` uses only Node's built-in modules (`http`, `fs`, `crypto`, global `fetch`), like `build_papers_index.mjs`.
- **Why**: nothing to install, update or audit, and no build step; the server has five small routes.
- **Cost**: routing and JSON responses are written by hand.

### 2026-11-05 · One token renewal at a time, token file written atomically

- **Decision**: concurrent requests share a single in-flight renewal; the token file is written to a temporary file and renamed, and an unreadable file counts as "not connected".
- **Why**: Strava can replace the refresh token on each renewal, so two parallel renewals could leave a dead token saved; a crash in the middle of a write must not corrupt the connection.
- **Cost**: none measurable; a valid token is still returned in milliseconds.

### 2026-11-05 · Ollama runs in Docker on the CPU by default

- **Decision**: an Ollama container starts with the app, and a one-shot service downloads the missing models (`qwen2.5:7b`, `nomic-embed-text`) on each start.
- **Why**: the Coach must work with no manual installation on every platform.
- **Cost**: Docker cannot use a Mac's GPU, so generation is CPU-only and slow on small machines, and the models take about 5 GB.

### 2026-11-05 · The Coach reaches Ollama through the app's own address

- **Decision**: nginx forwards `/ollama/` to Ollama and removes the browser's `Origin` header; the Coach's default endpoint becomes `/ollama`, and a saved old default (`http://localhost:11434`) is migrated.
- **Why**: same-origin requests need no CORS setting (`OLLAMA_ORIGINS`, `launchctl`), and Ollama needs no host port.
- **Cost**: nginx must wait longer than its default for answers (300 s instead of 60 s), because the Coach receives the whole answer at the end.

### 2026-11-05 · Host-Ollama option via `.env`, relying on Docker Desktop

- **Decision**: `OLLAMA_CONTAINERS=0` plus `OLLAMA_URL=http://host.docker.internal:11434` turn the Ollama container off and use the Ollama installed on the computer. The planned `extra_hosts` entry was dropped.
- **Why**: on a Mac, the host Ollama uses the GPU. Docker's internal DNS, which nginx uses, ignores `extra_hosts`, while Docker Desktop resolves `host.docker.internal` by itself, so the extra line would have done nothing.
- **Cost**: the option needs Docker Desktop; on Linux and WSL the host Ollama must listen on all interfaces.

### 2026-11-05 · The paper index stays committed and is not rebuilt by Docker

- **Decision**: `papers_index.json` is used as committed; no start or stop command rebuilds it.
- **Why**: rebuilding needs PubMed and Ollama and changes the Coach's sources; it is a deliberate maintenance step, not part of starting the app.
- **Cost**: changing the embedding model requires rebuilding the index by hand.

### 2026-11-05 · Default Coach model and 3-minute timeout kept despite slow CPU generation

- **Decision**: `qwen2.5:7b` and the 3-minute Coach timeout stay the defaults, even though one generation took over 5 minutes on the development laptop (Intel i5-1240P, CPU only, WSL).
- **Why**: the laptop is for development; the Coach is tested by hand on a Mac. A smaller model (`qwen2.5:3b`, 161 s) was less precise in the test.
- **Cost**: on CPU-only machines the default can time out; the README explains how to choose a smaller model.

### 2026-11-05 · LF line endings for every text file

- **Decision**: `.gitattributes` with `* text=auto eol=lf`.
- **Why**: 17 files had Windows line endings, so checkouts on different systems showed files as modified when nothing had changed.
- **Cost**: none; Git detects binary files and leaves them alone.
