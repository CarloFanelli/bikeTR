---
feature: docker-setup
version: 1.0
status: approved
completed: false
base: a66211fde5c837ca5688381afe1a25b76e493e04
---

# Docker Setup

## Overview

BikeTR currently needs four manual, macOS-only steps to run, and keeps the Strava client secret in the browser. This feature replaces the steps with one Docker Compose command that starts the web app, a small auth server and the AI Coach's local model on macOS, Windows and WSL alike, plus one command to stop it. The Strava Client ID and client secret move to an untracked `.env` file: the auth server performs login and token renewal, and the browser only receives short-lived access tokens. Line endings are normalized for Windows, the README documents only the Docker flow, and a PROCESS.md decision log is started. Personal, local setup: no production hardening, no cloud deployment.

## Project Context

- Static app (HTML + ES modules, no build step); today the browser stores the Strava Client ID, client secret and refresh token and performs OAuth itself.
- All other user data (settings, FTP history, caches) lives in browser localStorage, scoped per address; existing data lives under `http://localhost:5050`.
- Strava's OAuth callback domain is `localhost` (domain only, any port); the app must be opened as `localhost`.
- Strava access tokens last 6 hours; each renewal may return a new refresh token that replaces the previous one.
- The Coach calls Ollama from the browser (chat + embeddings); its address and model are editable in the Coach settings panel and saved in the browser.
- The paper index used by the Coach is committed to the repository.
- Target hosts: Docker Desktop on macOS, Windows and WSL2; no GPU assumed (the user's WSL machine exposes none).
- Personal, single-user, local-only project; a future server-side AI agent will reuse the server-held Strava tokens.

## Functional Requirements

### Startup & shutdown

- REQ-1: One documented command, run from the project folder, starts the web app, the auth server and the Coach's Ollama service together.
- REQ-2: After that command, the app is served at `http://localhost:5050` by default.
- REQ-3: Settings live in an untracked `.env` file; a committed `.env.example` lists every setting with its default or a placeholder.
- REQ-4: The web port is changeable via `.env` without editing any tracked file.
- REQ-5: One documented command stops everything; downloaded AI models persist across stop and restart.

### AI Coach (Ollama)

- REQ-6: On first start, the chat model (default `qwen2.5:7b`) and embedding model (`nomic-embed-text`) download automatically.
- REQ-7: On later starts, already-downloaded models are not downloaded again.
- REQ-8: The chat and embedding model names to download are settable in `.env`.
- REQ-9: With default settings, the Coach tab generates a workout without the user configuring Ollama, CORS or the Coach address.
- REQ-10: A `.env` option makes the app use an Ollama installed on the host; no Ollama container starts then.
- REQ-11: A browser that saved the old default Coach address (`http://localhost:11434`) switches to the new default automatically.

### Paper index

- REQ-12: The app keeps using the committed paper index; no start or stop command modifies it.

### Developer workflow

- REQ-13: Changes to app files (HTML, JS, CSS) appear after a normal browser reload, with no rebuild or container restart.

### Cross-platform

- REQ-14: The same commands work unchanged with Docker Desktop on macOS (Intel and Apple Silicon), Windows and WSL2.
- REQ-15: The repository enforces LF line endings for text files, so Windows checkouts show no spurious modifications.

### Documentation

- REQ-16: README run instructions describe only the Docker flow: Strava app and `.env` setup, start, stop, first-run download, host-Ollama option.
- REQ-17: In-app Coach help texts point to the Docker setup and host-Ollama option, not `launchctl`, `brew` or `node` commands.
- REQ-18: `PROCESS.md` exists at the repository root with one dated entry per decision taken in this feature, each with its rationale.

### Strava credentials

- REQ-19: The Strava Client ID and client secret are read only from `.env`; the app no longer has a form to type them.
- REQ-20: A "Connect to Strava" button starts Strava authorization; after approval the user lands back in the app, connected.
- REQ-21: The auth server stores the refresh token and gives the browser an access token valid for at least one more minute.
- REQ-22: The auth server renews the access token with Strava when needed, saving any new refresh token Strava returns.
- REQ-23: After stopping and restarting, the user is still connected to Strava without authorizing again.
- REQ-24: "Disconnect" deletes the server-held Strava tokens; the app then shows "Connect to Strava".
- REQ-25: On first load of the new version, Strava credentials and tokens saved in the browser by the old version are deleted.
- REQ-26: If `.env` lacks Strava credentials, the app still starts and names the missing `.env` settings.
- REQ-27: Every Strava-backed screen (home, training, analysis, activities, activity detail, segment predictions, export) works as before once connected.

## Data & Dependencies

### Information the feature must retain

- Downloaded AI models — created on first start; kept across stop and start; removed only by the documented full-cleanup command.
- Local settings (`.env`) — created by the user from `.env.example`; missing optional settings fall back to defaults; never committed.
- Strava tokens (refresh token, access token and its expiry) — created at authorization; refresh token replaced on each renewal; kept on the server across restarts; deleted by Disconnect, a revoked authorization, or the full-cleanup command.
- Client credentials (Client ID, client secret) — read from `.env` at start; never stored or sent anywhere else.
- Browser data (settings, FTP history, caches, Coach settings) — unchanged; stays in the browser under its address. Only the old Strava credentials and tokens are removed from it (REQ-25).
- Decision log (`PROCESS.md`) — created by this feature; entries are appended, never rewritten.

### External capabilities relied on

- A container runtime with Compose support (Docker Desktop) on the host — runs every service.
- The Ollama model registry — downloads models on first start (internet needed once).
- Strava OAuth (authorize and token endpoints) — called only by the auth server.
- Prebuilt images for an Ollama runtime and for a static web server that can forward paths to other services, available for Intel and ARM.

## Non-Functional Requirements

- **Performance** — With images and models already downloaded, the app answers at its address within 15 s of the start command.
- **Performance** — On the user's WSL machine (12 CPU cores, no GPU), one Coach generation with the default model finishes within the existing 3-minute Coach timeout.
- **Performance** — Handing out a still-valid access token takes under 200 ms (no call to Strava).
- **Security** — The client secret and refresh token never reach the browser: absent from served files, responses, browser storage and logs.
- **Security** — `.env` and the server-held tokens are git-ignored; nothing secret is written to a tracked file.
- **Security** — Only the web port is published, bound to the host's loopback: other devices on the network cannot reach the app.
- **Security** — Ollama is reachable only through the web app, never on a host port of its own.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Docker Desktop not running when the start command is run | Command fails with Docker's own error; the README's first step says to start Docker Desktop | REQ-1 |
| Start command run while everything is already running | Running services are left as they are; no duplicates, no data loss | REQ-1 |
| Port 5050 already taken (e.g. the old `python3 -m http.server 5050` still running) | Start fails naming the busy port; README says to stop the old server or change the port | REQ-2 |
| User opens `http://127.0.0.1:5050` instead of `localhost` | Different browser address: saved data is not visible and Strava login fails; README says to always use `localhost` | REQ-2 |
| `.env` absent | Other settings use defaults; the app starts and shows the missing-Strava-credentials message | REQ-3 |
| `.env` contains an unknown or misspelled setting | Ignored; the default applies; `.env.example` is the reference for names | REQ-3 |
| Port changed in `.env` | App served on the new port; data saved under the old port is not visible (browser storage is per address), README warns; Strava login keeps working | REQ-4 |
| Port value invalid (non-numeric or out of range) | Start fails with Docker's error message | REQ-4 |
| Full-cleanup command run | Containers, downloaded models and stored Strava tokens removed; next start downloads about 5 GB again | REQ-5 |
| Stop command run when nothing is running | Completes without error | REQ-5 |
| No internet on first start | Web app still starts and works; Coach shows its existing model-missing error; next start retries the download | REQ-6 |
| Not enough disk space for the models (about 5 GB) | Download fails with an error visible in the logs; web app works; Coach shows its model-missing error | REQ-6 |
| User opens the Coach tab before the first download finishes | Coach shows its model-missing error; README says the first start downloads for several minutes and how to watch progress | REQ-6 |
| Everything stopped in the middle of a model download | Next start completes the missing model | REQ-7 |
| A different model name set in `.env` | Next start downloads only that model; models already present are not downloaded again | REQ-7 |
| Chat model changed in `.env` but not in the Coach settings panel | Coach still requests the panel's model and shows the model-missing error; README says to set the same name in both places | REQ-8 |
| Model name in `.env` that does not exist in the registry | Download fails with the error in the logs; web app works; the other model still downloads | REQ-8 |
| Ollama container not ready yet, or crashed | Coach shows its existing connection error with hints; the rest of the app keeps working | REQ-9 |
| Generation exceeds the 3-minute timeout on a slow CPU | Coach shows its existing timeout error; README explains choosing a smaller chat model in `.env` and in the panel | REQ-9 |
| Two Coach generations started in quick succession | Existing behavior kept: the first is cancelled, the second runs | REQ-9 |
| Host mode selected but no Ollama running on the host | Coach shows its existing connection error; web app works | REQ-10 |
| Host Ollama listens only on its own loopback (default on Linux/WSL installs) | Unreachable from the container; README documents making it listen on all interfaces | REQ-10 |
| Host mode, models not downloaded on the host | Coach shows its model-missing error; README lists the two `ollama pull` commands for host mode | REQ-10 |
| Browser saved a custom, non-default Coach address | Kept and used unchanged (the user's explicit choice) | REQ-11 |
| No saved Coach settings in the browser | New default address used | REQ-11 |
| Paper index file missing or deleted | Coach shows its error, now telling the user to restore the file from git | REQ-12 |
| N/A — concurrent, network: the index is a static file only read by the browser | — | REQ-12 |
| Browser cache would serve an outdated JS or CSS file | A normal reload shows the new version; the server makes the browser revalidate every app file | REQ-13 |
| Change to Docker or web-server configuration files | Needs the start command again; README says so | REQ-13 |
| Apple Silicon Mac | Same command and result; every image used exists for ARM | REQ-14 |
| Commands typed in Windows PowerShell rather than a WSL terminal | Identical commands, identical result; README lists them once | REQ-14 |
| Existing working copy whose 17 files have Windows line endings | After the change, Git shows those files as unmodified (contents are identical) | REQ-15 |
| Binary files (e.g. images added later) | Never converted | REQ-15 |
| Reader without Docker installed | README's first step links the Docker Desktop install for macOS and Windows | REQ-16 |
| N/A — concurrent, network, permission: static documentation | — | REQ-16 |
| Coach "CORS error?" help panel | Replaced by guidance for the host-Ollama option | REQ-17 |
| Coach error shown when the paper index is missing | No longer suggests `node build_papers_index.mjs` | REQ-17 |
| A decision is reversed in a later feature | The old entry stays; a new dated entry records the change and why | REQ-18 |
| N/A — concurrent, network, permission: single author, plain file | — | REQ-18 |
| User looks for the old Client ID / secret form | Not present; the setup screen explains which `.env` settings to fill in | REQ-19 |
| Wrong Client ID or secret in `.env` | Strava rejects the authorization; the app shows Strava's error and says to check `.env` | REQ-19 |
| User denies authorization on Strava | Back in the app with an "authorization denied" message and the Connect button; nothing stored | REQ-20 |
| User reloads right after returning from Strava (authorization code reused) | No error; the app loads normally with the existing connection | REQ-20 |
| Strava unreachable during the first authorization | Error message plus the Connect button; nothing stored | REQ-20 |
| Browser asks for an access token while not connected | Auth server answers "not connected"; the app shows Connect to Strava | REQ-21 |
| Auth server not running or crashed | The page loads, shows "auth server unreachable" and suggests checking the Docker logs | REQ-21 |
| Two tabs need a renewal at the same moment | Only one renewal happens; both get the same valid access token; the stored refresh token stays valid | REQ-22 |
| User revoked BikeTR's access in Strava's settings | Renewal fails; stored tokens are deleted; the app shows Connect to Strava | REQ-22 |
| Strava down during a renewal | Connection error shown; stored tokens kept; the next request retries | REQ-22 |
| Long export (throttled over many minutes) outlives the access token | Export obtains a renewed token and continues | REQ-22 |
| Stored token file corrupted or unreadable | Treated as not connected; the app shows Connect to Strava; no crash | REQ-23 |
| Full-cleanup command run | Stored tokens removed; Connect needed again | REQ-23 |
| Disconnect clicked when already disconnected | No error | REQ-24 |
| Disconnect in one tab while another tab is open | The other tab shows Connect to Strava on its next token request | REQ-24 |
| Browser holds no old credentials | Nothing happens | REQ-25 |
| Browser holds other old data (settings, FTP history, caches, Coach settings) | Kept untouched; only Strava credentials and tokens are removed | REQ-25 |
| `.env` has only one of Client ID / client secret, or still the `.env.example` placeholders | Treated as missing; the message names the missing setting | REQ-26 |
| Strava credentials added to `.env` while everything is running | Take effect after running the start command again; the message says so | REQ-26 |
| Activity detail page opened from a bookmark while not connected | Redirects to the main page showing Connect to Strava, as today | REQ-27 |
| Strava rate limit reached | Existing error messages unchanged | REQ-27 |

## Out of Scope

- **Agent backend (workflow, tool calling, tracing)** — planned AI-agent work; it will join this setup as another service and can reuse the server-held Strava tokens.
- **Routing all Strava API calls through the server** — user decision: the browser keeps calling Strava directly with short-lived access tokens.
- **Moving the old browser refresh token to the server** — one re-authorization is simpler and avoids sending a secret around.
- **Revoking BikeTR's access at Strava on Disconnect** — Disconnect forgets tokens locally; full revocation stays on Strava's settings page.
- **Rebuilding the paper index via Docker** — the planned PDF RAG feature replaces this index and brings its own import command.
- **Running without Docker** — Docker is the only supported way (user decision); the Coach address field stays editable for manual setups.
- **GPU acceleration** — the user's WSL exposes no GPU and Docker on Mac cannot use the Apple GPU; the host-Ollama option covers speed on Mac.
- **Production hardening, HTTPS, public hosting, Cloud Run** — personal local project; Cloud Run is an optional later item in the user's plan.
- **Other review findings (unescaped segment names, large modules, offline map library)** — unrelated to startup; tracked separately in the backlog where selected.
