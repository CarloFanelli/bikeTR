---
feature: data-backend
version: 1.1
status: approved
completed: true
base: 8dffed8f92ce666d8d9bdce1b9c3d016751dd6c2
---

# Data Backend — activities, settings and metrics on the server

## Overview

The athlete's whole Strava history, ride details and personal data move from the browser to a
database on the server, run by the Coach service. The app stops downloading the last 60
activities from Strava on every page load: the server syncs new activities when the app opens
or on request, and downloads ride details in the background within Strava's limits. Data
survives a browser change. Attività lists every activity, Home finds the last bike ride in the
whole history, training load and fitness/fatigue/form are computed only by the Coach service,
and Allenamento saves the mesocycle week whenever it opens.

## Project Context

- Single athlete, local use only: everything stays reachable from 127.0.0.1 alone.
- Strava tokens stay in the Auth server; the Coach service asks it for a token, as today.
- Strava allows 100 requests per 15 minutes and 1,000 per day per app; the browser's segment jobs share them.
- User decision: a PostgreSQL database in its own container, read and written only by the Coach service.
- Existing rule: disconnecting from Strava deletes the Strava data the server saved (Strava's terms).
- FTP/LTHR estimates, the daily recommendation and the plan stay in the browser, which sends the athlete profile as today.
- The browser and the Coach already share the load and form formulas, with tests comparing their results.
- One Docker command still starts everything, as the README promises.

## Functional Requirements

### Sync with Strava

- REQ-1: Activities, ride details and athlete data survive restarts and recreation of every container.
- REQ-2: The first sync downloads the list of all the athlete's Strava activities, with the athlete and their all-time stats.
- REQ-3: Ride details download in the background, newest first, for every activity with power or heart rate.
- REQ-4: Background downloads use at most 60 Strava requests per 15 minutes and 600 per day.
- REQ-5: When the app opens, the server asks Strava for activities newer than the last saved, at most once every 5 minutes.
- REQ-6: An "Aggiorna da Strava" item in the athlete's menu runs that check immediately, skipping the 5-minute wait.
- REQ-7: Each sync re-reads the last 30 days of activities from Strava, applying renames, edits and deletions.
- REQ-8: Loading the app makes no browser request to Strava for the athlete, stats or activities.
- REQ-9: Profilo e dati shows how many activities with power or heart rate have ride details, replacing "Aggiorna con streams".

### Athlete data

- REQ-10: Impostazioni, rainy and rest days, FTP history, mesocycle, starred-segment cache and last Coach duration are read from and saved on the server.
- REQ-11: Theme, last Analisi tab and Attività view stay saved in each browser.
- REQ-12: When the server holds no athlete data, the first browser to open sends its saved data, then deletes its copies.
- REQ-13: A browser opening when the server already holds athlete data deletes its own copies without sending them.

### Screens

- REQ-14: Attività lists every saved activity, 60 at a time, loading the next 60 when the list reaches its end.
- REQ-15: Attività's name search and sport filters cover every saved activity, not only the loaded ones.
- REQ-16: Home's "Ultima uscita" shows the most recent bike ride among all saved activities.
- REQ-17: Power curve, records, estimated level and charts keep today's windows and values for the same activities.

### Metrics and Coach

- REQ-18: The Coach service computes each activity's training load and daily fitness, fatigue and form; Home, Allenamento and Analisi show these values.
- REQ-19: For the same activities and athlete profile, those values equal what the browser computed before this feature.
- REQ-20: The browser computes training load only for the plan's simulated future workouts; a test fails when that formula differs from the Coach's.
- REQ-21: The Coach reads rides and ride details from the database and keeps no file of its own.

### Mesocycle and disconnect

- REQ-22: Opening Allenamento saves the current mesocycle week, so the plan and its banner show the block's real week.
- REQ-23: "Disconnetti da Strava" deletes activities, ride details, athlete, stats and segment cache; Impostazioni, calendar, FTP history, mesocycle and Coach duration stay.

## Data & Dependencies

### Information the feature must retain

- Activities — every Strava activity of the connected athlete; added at sync, changed or removed when Strava changes them within 30 days, deleted at disconnect.
- Ride details — second-by-second power and heart rate summarized per activity; downloaded once, deleted with their activity.
- Athlete and stats — Strava profile and all-time totals; refreshed at each sync, deleted at disconnect.
- Sync state — time of the last sync and how far the background download has gone; lets a restart resume instead of starting over.
- Athlete data — Impostazioni, calendar days, FTP history, mesocycle, segment cache, last Coach duration; written by the app, kept across disconnects (except the segment cache).

### External capabilities relied on

- Strava's activity list, athlete, stats and per-activity streams — the source of every activity.
- The Auth server's access token — the only way the server reaches Strava.

## Non-Functional Requirements

- **Performance** — With 2,000 saved activities, the app's first data answer arrives within 1 second on the development Mac.
- **Performance** — Reloading the app 30 times in 5 minutes makes at most 2 Strava requests.
- **Security** — The database accepts connections only from inside the Docker network; its password lives in `.env`, never committed.
- **Validation** — The server refuses athlete data with an unknown field or a wrong type, answering with the field's name, and saves nothing.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Database container down when the app opens | Error notice "Non riesco a leggere i tuoi dati" with Riprova; nothing is written in the browser | REQ-1 |
| Container recreated mid background download | Download resumes from the first activity without details; nothing downloaded twice | REQ-1, REQ-3 |
| Athlete with 0 activities | First sync saves athlete and stats; Attività shows its empty state; nothing to download | REQ-2 |
| Strava answers 429 during the first sync | Saved part kept; app shows the saved data and "Strava ha chiesto una pausa: riprovo alle {ora}" | REQ-2, REQ-5 |
| Strava unreachable when the app opens | App shows the saved data with "Dati aggiornati alle {ora}: Strava non raggiungibile" | REQ-5 |
| Activity without power or heart rate (e.g. a walk) | No details requested; not counted in Profilo e dati's total | REQ-3, REQ-9 |
| Strava stream request fails for one activity | That activity is skipped and retried after the others; the rest continue | REQ-3 |
| Request budget reached (60 in 15 min or 600 in a day) | Background download pauses until the window resets; app syncs still go through | REQ-4 |
| App syncs plus segment jobs near Strava's 100 | Background download pauses first, leaving room for app syncs | REQ-4 |
| App opened twice within 5 minutes | Second opening shows saved data and makes no Strava request | REQ-5 |
| Two tabs open the app at the same moment | One Strava check only; both show the same result | REQ-5 |
| "Aggiorna da Strava" pressed while a sync runs | No second sync; the item shows the running one and its result | REQ-6 |
| Strava disconnected while "Aggiorna da Strava" runs | Sync stops, saves nothing more, the app shows "Collega Strava" | REQ-6, REQ-23 |
| Activity deleted on Strava within the last 30 days | Removed from the server at the next sync, with its details | REQ-7 |
| Activity edited on Strava more than 30 days ago | Old version kept; stated in Out of Scope | REQ-7 |
| Activity's type changed (e.g. Ride to VirtualRide) | New type saved; its load recomputed | REQ-7, REQ-18 |
| Every ride already has details | Profilo e dati shows "Dettagli completi" and no progress | REQ-9 |
| Two browsers save Impostazioni at the same time | Last save wins; the other browser shows the new values at its next opening | REQ-10 |
| Browser data unreadable (broken JSON) at migration | The unreadable item is skipped, the others are sent, broken copies deleted | REQ-12 |
| Two browsers migrate at the same moment | Only the first is saved; the second is treated as REQ-13 | REQ-12, REQ-13 |
| Migration interrupted by a network error | Browser keeps its copies and retries at the next opening | REQ-12 |
| Fewer than 60 activities | Attività shows them all, no loading at the end | REQ-14 |
| Search with no match across all activities | Attività shows its existing "nessuna attività" text | REQ-15 |
| No bike ride in the whole history | Home's "Ultima uscita" shows its existing empty text | REQ-16 |
| Activity without ride details when load is computed | Load from summary figures, as today | REQ-18, REQ-19 |
| Profile without FTP or LTHR | Same load as the browser computed before (heart-rate or type fallback) | REQ-19 |
| Coach's load formula changes and the plan's copy does not | The comparison test fails before the change can land | REQ-20 |
| Plan simulated with no real activities | Simulation starts from zero fitness and fatigue, as today | REQ-20 |
| Reconnection with a different Strava athlete | Previous athlete's Strava data deleted before the first sync; athlete data kept | REQ-23 |
| N/A — permission: single athlete, no accounts or roles; access is local only (Project Context) | — | REQ-10 |

## Out of Scope

- **Analisi over the whole history** — power curve, records and level keep today's windows, so numbers stay comparable (user decision).
- **Sync with the app closed** — checks happen only on opening or on request (user decision); a timer or Strava's webhooks need a reachable address.
- **Edits older than 30 days** — re-reading the whole history at every sync would spend the request budget.
- **Database backup and export** — a single local athlete; the existing JSON export of workouts stays.
- **Moving segment downloads to the server** — segment jobs stay in the browser; only their cache moves.
- **FTP/LTHR estimates on the server** — they stay in the browser, which sends the profile as today.
- **Load of the plan's simulated workouts on the server** — the four-week plan simulates each future day from the previous one; moving it would rewrite the plan engine (user decision of 2026-11-13).
