# Task 01: web-toolchain

## Objective

BikeTR runs through a live-reload development server: today's app looks and works the same at http://localhost:5050, a saved change shows within 3 seconds, and one command runs the type check, the tests and the structure checks.

## Context

**Satisfies**: REQ-2, REQ-4, REQ-5, REQ-7, REQ-10, REQ-23, REQ-24

Every later task needs the build step, the test runner and the checks. Today's JavaScript runs unchanged on the new server, so the app keeps working while calculations and screens move to TypeScript one task at a time. The structure checks cover the TypeScript code from the start and all the code once Task 12 removes the old files.

## Depends on

None

## Expected Behavior

- `docker compose up -d` starts everything at http://localhost:5050 and installs missing packages by itself; the app looks and behaves exactly as before.
- The browser app lives in its own folder; the project root keeps documentation, configuration and data files.
- Saving a file of the app updates the open page within 3 seconds, with no command and no manual reload.
- One command documented in the README runs the strict type check, the tests, and the checks for import loops and files over 500 lines; the old JavaScript files are left out of the structure checks until Task 12.
- The Coach service's Python tests keep their own command, documented next to the new one.
- The app still answers only on 127.0.0.1 and to the host names `localhost` and `127.0.0.1`; apart from `/papers_index.json`, nothing outside the app's own files can be fetched.

## Acceptance Criteria

- [ ] `docker compose up -d` serves today's app unchanged at http://localhost:5050, installing missing packages with no other command (REQ-23)
- [ ] Saving a file of the app updates the open page within 3 seconds, with no command and no manual reload (REQ-24)
- [ ] One README command runs the strict type check, the tests and the structure checks, without Strava or Ollama (REQ-10, REQ-2)
- [ ] The structure check fails on an import loop or a TypeScript file over 500 lines, naming the files (REQ-4, REQ-5)
- [ ] The browser app has its own folder, and the Coach service still downloads the paper index at `/papers_index.json` (REQ-7)
- [ ] Other host names get 403, and `.env`, `.git`, `docker/` and the services' code cannot be fetched through the web address (REQ-23)

## Edge Cases

- One type error anywhere → the command fails, naming file and line (REQ-2 from the spec edge-case table)
- N/A — network, concurrent, permission: the checks read local source files only (REQ-2, REQ-4, REQ-5, REQ-6)
- A later change adds an import loop → the check fails, naming the files in the loop (REQ-4)
- A file of exactly 500 lines; one of 501 → accepted; reported by name (REQ-5)
- Data files (paper index) and installed packages → not counted as source files (REQ-5)
- Files tools expect at the root (compose.yaml, `.env`, `.env.example`, Git files, README, PROCESS, METHODOLOGY, AGENTS) → stay at the root (REQ-7)
- The paper index → stays reachable at `/papers_index.json` on the web container, where the Coach service downloads it at each request (REQ-7)
- Files move to new folders → every command in the README still works as written (REQ-7)
- The Coach service's Python tests → keep their own command, documented next to this one, and pass unchanged (REQ-10)
- Docker not running when tests are launched → the command fails with Docker's own message (REQ-10)
- Tests launched while BikeTR is running → they run alongside without touching its saved data or Strava connection (REQ-10)
- First start without internet → fails with a message that packages couldn't be downloaded; later starts with packages installed work offline (REQ-23)
- A `git pull` changes the packages → the README's update command installs them; no manual npm command (REQ-23)
- Packages installed on the computer outside Docker → ignored by the container; they don't break it (REQ-23)
- Saving a file with a type error → the page updates; the check command reports the error (REQ-24)
- Saving a file with a syntax error → the page shows the error with file and line; fixing the file restores it without reload (REQ-24)
- Web container restarted while a page is open → the page reconnects by itself when the server is back (REQ-24)
- Editing from macOS, Windows or WSL → the change is detected within 3 seconds on each (REQ-24)
