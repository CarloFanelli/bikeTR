# Task 03: app-reads-server

## Objective

Opening BikeTR shows the athlete, stats and activities saved on the server, with no Strava request from the browser; an "Aggiorna da Strava" item in the athlete's menu brings new rides in at once.

## Context

**Satisfies**: REQ-5, REQ-6, REQ-8

This is the step that stops the page-load downloads that hit Strava's limit. The screens keep showing the latest 60 activities as today; task 04 widens Attività and Home to the whole history.

## Depends on

01-database-and-first-sync

## Expected Behavior

- On opening, the app asks the server to sync, then shows what the server holds.
- Reloading many times in a few minutes makes at most one Strava check.
- "Aggiorna da Strava" in the athlete's menu runs a sync at once and shows its result.
- When Strava cannot be reached, the app still shows the saved data with when it was last updated.

## Acceptance Criteria

- [ ] Loading the app makes no browser request to Strava for athlete, stats or activities (REQ-8)
- [ ] Opening the app triggers a server sync; 30 reloads in 5 minutes cause at most 2 Strava requests (REQ-5)
- [ ] "Aggiorna da Strava" in the athlete's menu syncs immediately, skipping the 5-minute wait (REQ-6)
- [ ] A ride added on Strava appears in the app after "Aggiorna da Strava" without reloading the page (REQ-6)

## Edge Cases

- Database container down when the app opens → error notice "Non riesco a leggere i tuoi dati" with Riprova; nothing written in the browser (REQ-1)
- Strava answers 429 → the app shows the saved data and "Strava ha chiesto una pausa: riprovo alle {ora}" (REQ-2, REQ-5)
- Strava unreachable when the app opens → the app shows the saved data with "Dati aggiornati alle {ora}: Strava non raggiungibile" (REQ-5)
- App opened twice within 5 minutes → the second opening shows saved data and makes no Strava request (REQ-5)
- Two tabs open the app at the same moment → one Strava check only; both show the same result (REQ-5)
- "Aggiorna da Strava" pressed while a sync runs → no second sync; the item shows the running one and its result (REQ-6)
- Strava disconnected while "Aggiorna da Strava" runs → the sync stops, saves nothing more, the app shows "Collega Strava" (REQ-6, REQ-23)

## Notes from implementation

- **REQ-5 / AC 2 — divergence**: one sync makes three Strava requests (athlete, stats, activity list), so "30 reloads cause at most 2 Strava requests" holds as "at most 2 Strava checks". REQ-5 itself counts checks ("at most once every 5 minutes"), and that is what the server enforces and the tests verify.
- **Error answers carry the service's code**: the browser's Coach client now returns the service's `error` code with the message, so the app tells "not connected" and "disconnected during the sync" (shown as "Collega Strava") from other failures.
- **Database down**: the service answers 503 `database_unreachable` with a message naming `docker compose logs db`; the app shows it under "Non riesco a leggere i tuoi dati" with Riprova and writes nothing in the browser.
