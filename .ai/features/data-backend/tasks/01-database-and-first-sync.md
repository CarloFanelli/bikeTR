# Task 01: database-and-first-sync

## Objective

The server keeps the athlete's whole Strava history, athlete and all-time stats in a database that survives every restart, and brings it up to date from Strava when asked, at most once every 5 minutes. The Coach reads its rides from there.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-5, REQ-7, REQ-21, REQ-23

Everything else in the feature reads what this task stores. The browser keeps working as today until task 03 switches it; here the sync is reachable through the service and used by the Coach's own workout request. Disconnecting deletes the Strava data saved here; the athlete's own data arrives in task 05.

## Depends on

None

## Expected Behavior

- Starting BikeTR with the usual Docker command also starts the database, with no extra step.
- The first sync saves every Strava activity of the athlete, the athlete's profile and all-time stats.
- A later sync asks Strava only for activities newer than the last saved, and re-reads the last 30 days.
- A sync asked within 5 minutes of the previous one answers with the saved data and calls nobody.
- The Coach's workout uses the saved activities and ride details; no separate rides file exists any more.
- "Disconnetti da Strava" deletes activities, ride details, athlete and stats.

## Acceptance Criteria

- [ ] After `docker compose down` and `up`, the saved activities, athlete and stats are still there (REQ-1)
- [ ] With an empty database, one sync saves every activity Strava lists for the athlete, plus athlete and stats (REQ-2)
- [ ] A second sync within 5 minutes makes no Strava request; after 5 minutes it asks only for newer activities and the last 30 days (REQ-5, REQ-7)
- [ ] A rename, type change or deletion made on Strava within 30 days appears in the saved data after the next sync (REQ-7)
- [ ] The Coach's workout request reads rides and ride details from the database, and the old rides file is no longer written (REQ-21)
- [ ] "Disconnetti da Strava" leaves no activity, ride detail, athlete or stats saved (REQ-23)

## Edge Cases

- Athlete with 0 activities → the first sync saves athlete and stats; nothing else to download (REQ-2)
- Strava answers 429 during the first sync → the part already saved is kept, the answer says when the next try happens (REQ-2, REQ-5)
- Strava unreachable during a sync → the saved data is answered with the time of the last successful sync (REQ-5)
- Two syncs asked at the same moment → one Strava check only; both get the same result (REQ-5)
- Strava disconnected while a sync runs → the sync stops and saves nothing more (REQ-6, REQ-23)
- Activity deleted on Strava within the last 30 days → removed at the next sync, with its ride details (REQ-7)
- Activity edited on Strava more than 30 days ago → the old version stays (REQ-7)
- Activity's type changed (e.g. Ride to VirtualRide) → the new type is saved (REQ-7, REQ-18)
- Reconnection with a different Strava athlete → the previous athlete's Strava data is deleted before the first sync (REQ-23)

## Notes from implementation

- **No connection pool**: the user approved "psycopg 3 with its pool", but each database operation opens its own connection (`docker/coach/app/db.py`). The Coach tests run each in its own asyncio loop, and a pool stays bound to the loop that created it; one athlete makes few requests, so the cost is not noticeable. psycopg-pool is not installed.
- **The whole Strava activity is saved**: the user chose to store each activity as Strava lists it, name and route included, replacing the earlier rule that kept only the Coach's figures (PROCESS.md, 2026-11-13). The Coach still reads only `KEPT_FIELDS`.
- **Interrupted first sync resumes**: the sync state keeps `history_complete`; until it is true, the next sync continues before the oldest saved activity instead of starting over. A 429 answers `paused` with the next quarter hour as retry time; any failed check also counts for the 5-minute wait.
