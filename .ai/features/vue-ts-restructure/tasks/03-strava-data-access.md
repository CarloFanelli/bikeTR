# Task 03: strava-data-access

## Objective

Every Strava download, Auth server call and saved browser value goes through one typed layer that asks for a current access token right before each Strava download, so a tab left open for hours keeps working.

## Context

**Satisfies**: REQ-1, REQ-6, REQ-21, REQ-25

Both today's screens and the new ones read Strava and saved data through this layer. Today's screens are switched to it here, so the long-open-tab fix and the single copy of each helper reach the current app right away. Calculations (Tasks 04 and 05) build on its types and helpers.

## Depends on

- Task 01

## Expected Behavior

- Every Strava download (activity list, streams refresh, segment completion, activity detail, JSON export) gets its access token from the Auth server right before it starts.
- Saved browser data (settings, Coach settings, FTP history, mesocycle, skip and rainy days, stream and segment caches, export state) is read and written with today's names and formats.
- Time, date and distance formatting and the safe reading and writing of browser data each exist once and are used everywhere.
- Strava answers are typed, and fields Strava can omit are marked as possibly missing.

## Acceptance Criteria

- [ ] Every Strava download gets its access token from the Auth server right before it starts (REQ-21)
- [ ] A tab open more than 6 hours can refresh with streams and complete segments without reloading (REQ-21)
- [ ] Settings, FTP history, mesocycle, skip and rainy days, caches and the Strava connection read back unchanged after the update (REQ-25)
- [ ] Time, date and distance formatting and safe saving and loading each exist once, used by today's screens (REQ-6)
- [ ] Strava fields that can be missing are typed as possibly missing, and the layer passes the strict type check (REQ-1)

## Edge Cases

- A Strava response lacks a field the types expect (e.g. a ride without average watts) → types mark Strava fields as possibly missing; the screen shows what it shows today (REQ-1 from the spec edge-case table)
- Two screens format the same value differently (e.g. "1h05" and "65 min") → one helper with an option, not two copies (REQ-6)
- Saved data written by the old version → read exactly as today (REQ-11)
- Access token expires during a 40-ride streams refresh → each download gets a valid token; the refresh completes (REQ-21)
- Many downloads ask for a token at once → the Auth server renews once and all of them get the same token (its current behavior) (REQ-21)
- Auth server unreachable when a button is used → today's login-service message (REQ-21)
- Disconnected in another tab → the next download shows the "Collega Strava" screen (REQ-21)
- First use with no saved data → today's defaults (REQ-25)
- A tab of the old version still open after the switch → both read and write the same data formats; nothing is corrupted (REQ-25)
- Saved data the new version no longer uses → removed as today's cleanup does; nothing else is deleted (REQ-25)
