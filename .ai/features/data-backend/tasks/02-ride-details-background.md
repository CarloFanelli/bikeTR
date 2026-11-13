# Task 02: ride-details-background

## Objective

Ride details for every activity with power or heart rate arrive on their own in the background, newest first, without ever pushing Strava past its limits; Profilo e dati shows how far the download has gone.

## Context

**Satisfies**: REQ-3, REQ-4, REQ-9

Downloading every ride's details takes many requests, so it runs slowly on the server instead of behind a button in the browser. The budget leaves room for app syncs and the browser's segment jobs, which share Strava's per-app limit.

## Depends on

01-database-and-first-sync

## Expected Behavior

- After a sync, the server starts downloading missing ride details, newest activity first.
- Activities without power or heart rate are never requested.
- The download pauses when it reaches its budget and resumes by itself when the window resets.
- A restart resumes from the first activity still missing details.
- Profilo e dati shows "{N} su {M}" activities with details while the download continues, and "Dettagli completi" when done; "Aggiorna con streams" is gone.

## Acceptance Criteria

- [ ] Every activity with power or heart rate gets its ride details without any button, newest first (REQ-3)
- [ ] The background download never makes more than 60 Strava requests in 15 minutes or 600 in a day (REQ-4)
- [ ] When Strava reports the app's own 15-minute usage near 100, the background download pauses first (REQ-4)
- [ ] Profilo e dati shows how many activities with power or heart rate have details, out of how many (REQ-9)
- [ ] The "Aggiorna con streams" button no longer exists (REQ-9)

## Edge Cases

- Container recreated mid download → resumes from the first activity without details; nothing downloaded twice (REQ-1, REQ-3)
- Activity without power or heart rate (e.g. a walk) → no details requested; not counted in Profilo e dati's total (REQ-3, REQ-9)
- Strava stream request fails for one activity → that activity is skipped and retried after the others; the rest continue (REQ-3)
- Request budget reached (60 in 15 min or 600 in a day) → the download pauses until the window resets; app syncs still go through (REQ-4)
- App syncs plus segment jobs near Strava's 100 → the background download pauses first, leaving room for app syncs (REQ-4)
- Every activity already has details → Profilo e dati shows "Dettagli completi" and no progress (REQ-9)

## Notes from implementation

- **Budget counted in its own table, not in the sync state**: the background requests go in `detail_requests`, which "Disconnetti da Strava" does not empty. Strava's limit belongs to the app, not the athlete, so a disconnect and a new connection must not restart the count. Failed activities go in `detail_failures`, deleted with their activity.
- **"With power" means measured power**: an activity counts when Strava marks `device_watts` or `has_heartrate`. Power that Strava estimates for a ride without a power meter has no stream to download (on the real history, 50 rides have only estimated watts).
- **Impacts Task 05**: this task's migration is `002_detail_downloads.sql`, so the athlete-data migration that the architecture plan names `002_athlete_data.sql` becomes `003_athlete_data.sql`.
