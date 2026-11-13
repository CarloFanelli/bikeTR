# Task 05: athlete-data-server

## Objective

The athlete's own data (Impostazioni, rainy and rest days, FTP history, mesocycle, starred-segment cache, last Coach duration) lives on the server and is the same in every browser; the first browser hands over what it already holds.

## Context

**Satisfies**: REQ-10, REQ-11, REQ-12, REQ-13, REQ-23

Today this data exists only in one browser. The display choices (theme, last Analisi tab, Attività view) stay per device by user decision. Disconnecting keeps this data, except the segment cache, which is Strava's.

## Depends on

03-app-reads-server

## Expected Behavior

- Every screen reads and saves the athlete's data on the server.
- On the first opening after the update, the browser sends its saved data to an empty server, then deletes its copies.
- A browser that finds the server already holding data deletes its own copies without sending them.
- Theme, last Analisi tab and Attività view stay in each browser.
- "Disconnetti da Strava" keeps Impostazioni, calendar, FTP history, mesocycle and Coach duration, and deletes the segment cache.

## Acceptance Criteria

- [ ] A change saved in Impostazioni in one browser appears in another browser at its next opening (REQ-10)
- [ ] Theme, last Analisi tab and Attività view saved in one browser do not change another (REQ-11)
- [ ] With an empty server, the first browser's saved data appears on the server and its local copies are gone (REQ-12)
- [ ] A second browser opening later deletes its local copies, and the server keeps the first browser's data (REQ-13)
- [ ] The server refuses data with an unknown field or wrong type, names the field, and saves nothing (REQ-10)
- [ ] After "Disconnetti da Strava", Impostazioni, calendar, FTP history, mesocycle and Coach duration are still there; the segment cache is gone (REQ-23)

## Edge Cases

- Two browsers save Impostazioni at the same time → the last save wins; the other shows the new values at its next opening (REQ-10)
- Browser data unreadable (broken JSON) at migration → the unreadable item is skipped, the others are sent, the broken copies deleted (REQ-12)
- Two browsers migrate at the same moment → only the first is saved; the second is treated as a browser opening on a full server (REQ-12, REQ-13)
- Migration interrupted by a network error → the browser keeps its copies and retries at the next opening (REQ-12)
- Reconnection with a different Strava athlete → the athlete's own data is kept (REQ-23)

## Notes from implementation

- **Known limitation**: the opening saves the mesocycle and today's FTP point to the server even in a browser that had no saved data. If such a browser (another profile, a phone) opens the updated app first, the server is no longer empty, and the browser that held the real data deletes its copies without sending them (REQ-13 as written). The README tells the user to open the browser with the data first; a guard is proposed for the backlog.
- **Known limitation**: the old values are cleaned before the import (only the fields and types the server accepts are kept, unreadable entries are skipped), so a field left by an old version is dropped instead of making the server refuse everything.
- **Known limitation**: saves update the screen at once and are sent in order per key; on failure the screen goes back to the previous value and shows the error. The Coach duration's failed save is only logged in the console: the next request sends the duration anyway.
