# Task 05: docs-and-process-log

## Objective

A reader can set up and run BikeTR from the README using only the Docker flow, and `PROCESS.md` records every decision taken in this feature with its date and rationale.

## Context

**Satisfies**: REQ-16, REQ-18

Runs last because it documents the commands, settings and behaviors built in tasks 02–04. The README notes required by those tasks' edge cases (port conflicts, always using `localhost`, first-run download, host-Ollama setup) are collected here. `PROCESS.md` starts the decision log the user wants for interviews.

## Depends on

- Task 02
- Task 03
- Task 04

## Expected Behavior

- The README run instructions cover, in order: installing and starting Docker Desktop, creating the Strava app, filling `.env` from `.env.example`, start, opening `http://localhost:5050`, first-run model download and how to watch it, stop, full cleanup, the host-Ollama option.
- The README carries the notes the earlier tasks require: stop the old python server or change the port if 5050 is busy; always open `localhost`; changing the port hides data saved under the old one; set the same chat model in `.env` and in the Coach panel; pick a smaller model if generation times out; make a host Ollama listen on all interfaces and pull both models; restart after editing Docker or `.env` settings; after Disconnect, a tab already open keeps reading Strava until it reloads or its access token expires (at most 6 hours).
- The README no longer contains `python3 -m http.server`, `brew`, `launchctl`, `OLLAMA_ORIGINS` or `node build_papers_index.mjs` as setup steps, and no longer says the client secret is stored in the browser.
- `PROCESS.md` exists at the repository root with one dated entry per decision of this feature, each with its rationale.

## Acceptance Criteria

- [ ] Following only the README on a machine with Docker Desktop gets the app running and connected to Strava (REQ-16)
- [ ] The README contains no `python3 -m http.server`, `brew`, `launchctl` or `node build_papers_index.mjs` setup steps (REQ-16)
- [ ] The README documents the host-Ollama option, including making the host Ollama reachable and pulling both models (REQ-16)
- [ ] `PROCESS.md` has one dated entry per decision of this feature, each with a rationale (REQ-18)

## Edge Cases

- Reader without Docker installed → the README's first step links Docker Desktop for macOS and Windows (REQ-16)
- A decision is reversed in a later feature → the old `PROCESS.md` entry stays; a new dated entry records the change and why (REQ-18)

## Notes from implementation

- **Impacts Task 05**: the README must say that the host-Ollama option needs Docker Desktop (Docker's DNS ignores `extra_hosts`), and that on a CPU-only laptop the default `qwen2.5:7b` can exceed the 3-minute Coach timeout (measured over 5 minutes on WSL, i5-1240P), with a smaller model set in `.env` and in the Coach settings as the workaround. /dev task 03, 2026-11-05.
