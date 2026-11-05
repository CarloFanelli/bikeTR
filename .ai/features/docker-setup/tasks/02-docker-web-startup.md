# Task 02: docker-web-startup

## Objective

One documented command, run from the project folder, serves BikeTR at `http://localhost:5050` from Docker; edits to app files show on a normal reload; one command stops it and one fully cleans up; settings come from an optional, untracked `.env`.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-13, REQ-14

This creates the single start command and the settings file that tasks 03 and 04 extend with the Ollama service and the auth server. Port 5050 and the `localhost` host name stay as they are, so existing browser data and the Strava callback keep working.

## Depends on

- Task 01

## Expected Behavior

- The start command serves the app at `http://localhost:5050`; the port is published only on the host's loopback.
- A committed `.env.example` lists every setting with its default; `.env` is git-ignored and optional.
- Setting the web port in `.env` serves the app on that port with no tracked file edited.
- Editing any HTML, JS or CSS file shows after a normal browser reload; the server makes the browser revalidate every app file.
- The stop command stops everything and keeps named data; a separate documented full-cleanup command also deletes it.
- Dotfiles (`.env`, `.git`, `.ai`) and Docker configuration are never served.
- The same commands work on Docker Desktop for macOS (Intel, Apple Silicon), Windows and WSL2.

## Acceptance Criteria

- [ ] With no `.env`, the start command serves the app at `http://localhost:5050` within 15 s (images present) (REQ-1, REQ-2)
- [ ] `.env.example` is committed, lists every setting with its default; `.env` is git-ignored (REQ-3)
- [ ] Setting the web port in `.env` serves the app on that port; no tracked file changes (REQ-4)
- [ ] The stop command stops all services; restarting keeps named data (REQ-5)
- [ ] An edited JS file shows its change after a normal reload, without rebuild or restart (REQ-13)
- [ ] Requesting `/.env` or `/.git/config` from the app address returns no file content (REQ-3)
- [ ] The app is not reachable from another device on the network (REQ-2)

## Edge Cases

- Docker Desktop not running when the start command is run → Docker's own error; README's first step says to start Docker Desktop (REQ-1)
- Start command run while everything is already running → running services left as they are; no duplicates, no data loss (REQ-1)
- Port 5050 already taken (e.g. old `python3 -m http.server 5050` running) → start fails naming the busy port; README says to stop it or change the port (REQ-2)
- User opens `http://127.0.0.1:5050` instead of `localhost` → different browser address: saved data not visible, Strava login fails; README says always use `localhost` (REQ-2)
- `.env` absent → all settings use defaults; start works with zero configuration (REQ-3)
- `.env` contains an unknown or misspelled setting → ignored; the default applies (REQ-3)
- Port changed in `.env` → app served on the new port; data under the old port not visible, README warns; Strava login keeps working (REQ-4)
- Port value invalid (non-numeric or out of range) → start fails with Docker's error message (REQ-4)
- Full-cleanup command run → containers and all named data removed (REQ-5)
- Stop command run when nothing is running → completes without error (REQ-5)
- Browser cache would serve an outdated JS or CSS file → a normal reload shows the new version (REQ-13)
- Change to Docker or web-server configuration files → needs the start command again; README says so (REQ-13)
- Apple Silicon Mac → same command and result; every image used exists for ARM (REQ-14)
- Commands typed in Windows PowerShell rather than a WSL terminal → identical commands and result (REQ-14)
