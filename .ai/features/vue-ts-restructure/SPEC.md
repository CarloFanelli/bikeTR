---
feature: vue-ts-restructure
version: 1.0
status: approved
completed: true
base: c6f7bc5e40a02c1cf691bc87631ab8805cf8436d
---

# Vue + TypeScript Restructure

## Overview

Rebuilds BikeTR's browser app in TypeScript with Vue and moves the Auth server to TypeScript, so the code is typed, split into small files and tested. Calculations become separate tested functions that provably return today's numbers. Screens become Vue components with a new consistent look, interactive charts and a collapsible sidebar; settings get their own screen, and an activity's detail opens inside the app. BikeTR still starts with one Docker command, and a saved change appears within seconds. Along the way: Strava names are no longer inserted as raw HTML, tabs open for hours keep working, the README stops describing a missing tab, and the Coach screen gets a Stop button and automated tests.

## Project Context

- Builds on the completed **Coach service**: the Coach screen rebuilt here is the one it delivered (live answer, running step).
- The Coach service stays Python; only the browser app and the **Auth server** become TypeScript.
- Local only: one Docker Compose command on Mac, Windows and WSL, reached at http://localhost:5050 through 127.0.0.1.
- Browser data is stored per address, so http://localhost:5050 must stay the app's address.
- The Auth server holds the **Strava tokens** and runs without third-party packages (recorded decision).
- The Coach service downloads the paper index from the web container at each request, and stops Ollama when a request is abandoned.
- Every text shown to the user stays in Italian; Training v2 is an engine with no screen of its own.
- The WSL laptop is for development; Coach checks happen by hand on the Mac.

## Functional Requirements

### Code structure

- REQ-1: Every browser screen and calculation, and the Auth server, is TypeScript; hand-written JavaScript remains only in the paper-index builder and Coach reference tools.
- REQ-2: One documented command type-checks the browser app and the Auth server in strict mode and reports zero errors.
- REQ-3: Calculations (training load, fitness, FTP estimates, plans, workouts, predictions) are separate from screens and run in tests without a browser.
- REQ-4: No source file imports a file that imports it back, directly or through others; a documented command checks this.
- REQ-5: No source file is longer than 500 lines; the same command reports any file over the limit.
- REQ-6: Each shared helper (time, date and distance formatting, safe reading and writing of browser data) exists once and is imported where used.
- REQ-7: The project root keeps only documentation, configuration and data files; the browser app and the Auth server each have their own folder.

### Same numbers

- REQ-8: Tests compare every TypeScript calculation, on made-up rides and settings, with results recorded from today's JavaScript before conversion.
- REQ-9: Regenerating the Coach service's reference results runs the TypeScript calculations and produces files identical to today's.
- REQ-10: Browser app and Auth server tests and checks run with one README command on Mac, Windows and WSL, without Strava or Ollama.

### Screens and navigation

- REQ-11: With the same Strava data and settings, every screen shows the same information and values as before the switch.
- REQ-12: Every action keeps working: connect and disconnect Strava, refresh with streams, complete segments, save settings, mark skip and rainy days, JSON export, Coach.
- REQ-13: A sidebar lists Home, Allenamento, Analisi, Attività and Coach AI, with Impostazioni and the Strava connection status at its bottom.
- REQ-14: A button shrinks the sidebar to icons, each showing its name on hover; the choice is kept after a reload.
- REQ-15: Each section and each activity detail has its own address: reloading reopens it, and the browser's Back returns to the previous screen.
- REQ-16: Every link to an activity opens its detail (map, per-kilometer splits, segments with KOM/PR badges) inside the app, with a way back.
- REQ-17: The Impostazioni screen holds the settings now inside the Training tab, the Coach model with its Ollama check, and Strava disconnect.
- REQ-18: Cards, tables, buttons, form fields and tabs come from one component library and look the same on every screen.
- REQ-19: Hovering the training-load, fitness-fatigue-form, power-curve, heart-rate-zone or FTP-trend chart shows the exact values under the pointer.

### Fixes absorbed from the backlog

- REQ-20: Text from Strava (athlete, activity, segment names) always appears as written: a segment named `<b>Muro</b>` shows those characters.
- REQ-21: Every Strava download asks the Auth server for a current access token, so a tab open over 6 hours works without reloading.
- REQ-22: The README's feature list matches the sidebar and describes Training v2 as the engine behind the plan and the Coach.

### Running, data and documentation

- REQ-23: `docker compose up -d` still starts the whole app at http://localhost:5050, installing missing packages without any other command.
- REQ-24: Saving a screen, style or calculation file updates the open page within 3 seconds, with no command and no manual reload.
- REQ-25: Saved browser data (settings, FTP history, mesocycle, skip and rainy days, caches) and the Strava connection survive the switch untouched.
- REQ-26: PROCESS.md records the move to Vue, TypeScript and a build step, pointing back to the reversed "no build step" entry.

### Coach screen

- REQ-27: Automated tests show the Coach screen reads the streamed answer correctly when lines or characters are split between network chunks.
- REQ-28: Automated tests show that a new request or Stop cancels the older one, and none of its late events are drawn.
- REQ-29: A Stop button on the Coach screen ends the running request; Ollama stops that answer within 5 seconds.

## Data & Dependencies

### Information the feature must retain

- **Saved browser data** — settings, Coach settings, FTP history, mesocycle, skip and rainy days, stream and segment caches, export state; written by the old version, read and written by the new one in the same formats.
- **Sidebar choice** — expanded or icons only, per browser; set when the button is used; back to expanded if browser data is cleared.
- **Recorded calculation results** — produced once from today's JavaScript before conversion; never regenerated from the new code; changed only when a later feature changes a formula on purpose.
- **Coach service reference results** — the files its Python tests compare against; unchanged by this feature, and regenerated identically from the TypeScript calculations.
- **Installed packages** — kept between starts; installed again when the project's package list changes.

### External capabilities relied on

- Strava API — activities, ride details, segments (unchanged).
- Auth server — a current Strava access token on request.
- Coach service — the workout and its live answer; stops Ollama when the browser abandons a request.
- Map tiles — the background of the activity map.
- Package registry — downloads packages at first start and when they change.

## Non-Functional Requirements

- **Performance** — with packages installed, the app answers within 15 seconds of `docker compose up -d`.
- **Performance** — opening or reloading a screen takes at most 2 seconds longer than today with the same data and caches.
- **Security** — the app answers only on 127.0.0.1 and only to the host names `localhost` and `127.0.0.1`, live-reload connection included.
- **Security** — apart from the paper index at `/papers_index.json`, nothing outside the browser app's own files can be fetched through the web address: `.env`, `.git`, `docker/`, the services' code.
- **Security** — the browser never receives the client secret or the refresh token; the Auth server's routes and answers stay as today.
- **Validation** — settings keep today's limits and defaults (e.g. max heart rate 120–220, FTP 50–500, training days per week 2–7, weight 30–150).

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| A third-party library ships as JavaScript (e.g. the map library) | Allowed: the rule covers only code written for BikeTR | REQ-1 |
| A Strava response lacks a field the types expect (e.g. a ride without average watts) | Types mark Strava fields as possibly missing; the screen shows what it shows today | REQ-1 |
| One type error anywhere | The command fails, naming file and line | REQ-2 |
| N/A — network, concurrent, permission: the checks read local source files only | — | REQ-2, REQ-4, REQ-5, REQ-6 |
| A calculation depends on today's date (e.g. last-7-days load) | It receives the date as an input, so tests can fix the day | REQ-3 |
| No activities at all | Calculations return today's empty results (fitness 0, empty power curve) without errors | REQ-3 |
| A later change adds an import loop | The check fails, naming the files in the loop | REQ-4 |
| A file of exactly 500 lines; one of 501 | Accepted; reported by name | REQ-5 |
| Data files (paper index) and installed packages | Not counted as source files | REQ-5 |
| Two screens format the same value differently (e.g. "1h05" and "65 min") | One helper with an option, not two copies | REQ-6 |
| Files tools expect at the root (compose.yaml, `.env`, `.env.example`, Git files, README, PROCESS, METHODOLOGY, AGENTS) | Stay at the root | REQ-7 |
| The paper index | Stays reachable at `/papers_index.json` on the web container, where the Coach service downloads it at each request | REQ-7 |
| Files move to new folders | Every command in the README still works as written | REQ-7 |
| Rides with power only, heart rate only, or neither; runs, hikes, strength sessions; FTP and heart-rate settings empty | Each case has recorded results and a matching test | REQ-8 |
| No rides at all | The recorded empty results match | REQ-8 |
| TypeScript and recorded results differ only in the last decimals | Compared after the rounding the app displays | REQ-8 |
| Today's JavaScript gives a questionable number | The port keeps it; formula fixes are a separate feature | REQ-8 |
| Regenerated Coach reference results differ from today's files | Treated as a port bug; the switch isn't complete until they are identical | REQ-9 |
| The frozen copy of the old browser Coach used by the reference script | Stays as it is; the script adapts it when it runs, as it already does today | REQ-9 |
| N/A — network, permission: tests use only fixed local data | — | REQ-8, REQ-9, REQ-10 |
| The Coach service's Python tests | Keep their own command, documented next to this one, and pass unchanged | REQ-10 |
| Docker not running when tests are launched | The command fails with Docker's own message | REQ-10 |
| Tests launched while BikeTR is running | They run alongside without touching its saved data or Strava connection | REQ-10 |
| Values shown rounded (TSS, IF, W/kg) | Same rounding as today | REQ-11 |
| Athlete with no rides, or with no power meter | Same messages as today, in the new layout | REQ-11 |
| Strava unreachable while loading | Today's error message, in the new layout | REQ-11 |
| Saved data written by the old version | Read exactly as today | REQ-11 |
| A long action ("Aggiorna con streams", "Completa da dettagli attività", JSON export) clicked twice | The button stays disabled while it runs; the second click does nothing | REQ-12 |
| Strava fails or hits its request limit during a long action | Today's message; what was already downloaded is kept | REQ-12 |
| Strava access revoked on strava.com | Today's reconnect message | REQ-12 |
| Not connected to Strava | Only the "Collega Strava" screen, as today; no sidebar | REQ-13 |
| Disconnect from Impostazioni | Returns to the "Collega Strava" screen | REQ-13 |
| Very long athlete name in the status | Cut with "…"; full name on hover | REQ-13 |
| Saved sidebar choice missing or unreadable | Sidebar opens expanded | REQ-14 |
| Sidebar shrunk | Screens and charts use the freed width | REQ-14 |
| Two tabs open, sidebar shrunk in one | The other follows the choice at its next reload | REQ-14 |
| Unknown address (e.g. a typo) | Opens Home | REQ-15 |
| Address of an activity that doesn't exist or isn't the connected athlete's | "Attività non trovata" with a link to the list | REQ-15 |
| Reload of an activity detail while Strava is unreachable | Today's activity-page error message | REQ-15 |
| Two tabs on different screens | Each keeps its own screen | REQ-15 |
| Switching section during a Coach answer, a streams refresh or a JSON export | It keeps running and shows its progress or result on return, as today | REQ-15 |
| Old address `activity.html?id=…` (bookmark or open tab) | Opens that activity's detail inside the app | REQ-16 |
| Indoor ride without GPS | No map, as today; splits and segments shown | REQ-16 |
| Map tiles fail to load | Details, splits and segments still shown; the map area stays empty | REQ-16 |
| A value outside today's limits | Refused as today, naming the field | REQ-17 |
| Fields left empty | Today's defaults and estimates | REQ-17 |
| Leaving Impostazioni with unsaved changes | "Modifiche non salvate: uscire comunque?"; staying keeps them | REQ-17 |
| Settings saved in another tab | Picked up at the next reload, as today | REQ-17 |
| The instructions for using the Ollama installed on the computer | Move with the Coach model to Impostazioni | REQ-17 |
| A screen needs a piece the library lacks (e.g. the 28-day calendar) | Built from the library's basic pieces with the same colors and spacing | REQ-18 |
| N/A — empty, network, concurrent, permission: appearance only | — | REQ-18 |
| Chart with no data (e.g. no power meter: empty power curve) | Today's empty message instead of the chart | REQ-19 |
| Pointer between two points | Values of the nearest point | REQ-19 |
| Chart with a single point | That point's values on hover | REQ-19 |
| N/A — network, concurrent: charts draw data already loaded | — | REQ-19 |
| Names containing `<`, `&`, quotes or emoji | Shown literally | REQ-20 |
| Empty segment or activity name | Today's placeholder (e.g. the activity number) | REQ-20 |
| Access token expires during a 40-ride streams refresh | Each download gets a valid token; the refresh completes | REQ-21 |
| Many downloads ask for a token at once | The Auth server renews once and all of them get the same token (its current behavior) | REQ-21 |
| Auth server unreachable when a button is used | Today's login-service message | REQ-21 |
| Disconnected in another tab | The next download shows the "Collega Strava" screen | REQ-21 |
| N/A — all axes: documentation, checked by reading | — | REQ-22, REQ-26 |
| First start without internet | Fails with a message that packages couldn't be downloaded; later starts with packages installed work offline | REQ-23 |
| A `git pull` changes the packages | The README's update command installs them; no manual npm command | REQ-23 |
| Packages installed on the computer outside Docker | Ignored by the container; they don't break it | REQ-23 |
| Saving a file with a type error | The page updates; the check command reports the error | REQ-24 |
| Saving a file with a syntax error | The page shows the error with file and line; fixing the file restores it without reload | REQ-24 |
| Web container restarted while a page is open | The page reconnects by itself when the server is back | REQ-24 |
| Editing from macOS, Windows or WSL | The change is detected within 3 seconds on each | REQ-24 |
| First use with no saved data | Today's defaults | REQ-25 |
| A tab of the old version still open after the switch | Both read and write the same data formats; nothing is corrupted | REQ-25 |
| Saved data the new version no longer uses | Removed as today's cleanup does; nothing else is deleted | REQ-25 |
| A character such as "è" or an emoji split between two chunks | Shown whole | REQ-27 |
| One event line split across three or more chunks | Read as one event | REQ-27 |
| The stream ends without its final event | "Connessione col Coach interrotta", as today | REQ-27 |
| A late event of the older request arrives after the new one started | Ignored | REQ-28 |
| The older request's refusal is read after it was cancelled | Nothing is drawn over the new request | REQ-28 |
| N/A — network, permission: the tests feed made-up streams; no service runs | — | REQ-27, REQ-28 |
| Nothing is running | No Stop button is shown | REQ-29 |
| After Stop | The text written so far stays, with "Richiesta interrotta"; no workout card | REQ-29 |
| Stop while ride details are downloading | Details already downloaded are kept, as the Coach service does today | REQ-29 |
| Stop and the end of the answer happen together | Whichever comes first wins; no error is shown | REQ-29 |
| Two tabs running, Stop in one | Only that tab's answer stops | REQ-29 |

## Out of Scope

- **Formula changes** — numbers must equal today's so the tests can prove the port; fixes are their own feature.
- **Dark mode** — not chosen; the shared components make it cheap to add later.
- **Phone or narrow layout** — BikeTR answers only on the computer it runs on.
- **An optimized built version** — live reload is the only way to run BikeTR, which is never deployed.
- **The paper-index builder in TypeScript** — the planned PDF search in Python (backlog B-1) replaces it.
- **Calculations served by the Coach service** — stays backlog item B-16; the browser keeps its TypeScript calculations.
- **Settings and activities stored on the server** — stays backlog item B-11.
- **Hover on the small segment sparklines** — too small to point at; they stay as they are.
- **Coach service changes** — apart from its reference script, the service is untouched; Stop relies on its existing stop-on-abandon behavior.
