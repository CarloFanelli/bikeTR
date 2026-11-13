---
feature: data-backend
status: APPROVED
reviewed: 2026-11-13
head: 8dffed8f92ce666d8d9bdce1b9c3d016751dd6c2
---

# Review — data-backend

**Scope**: 66 files (delta since the previous review head `8dffed8f`, uncommitted work included: the whole feature, with its 16 fixes; 16 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · bug · Another athlete inherits the previous segment cache   [ADDRESSED]
**File**: `docker/coach/app/activities.py:126-128`
**Issue**: When a different Strava athlete syncs, `start_sync` deletes the previous athlete's activities, details and sync state but leaves `segmentCache` in `athlete_data`, and `estimatesFromSegments` (`web/src/core/segments.ts:87`) reads every cached effort, so the new athlete's estimated FTP and LTHR include the old athlete's efforts.
**Change**: In the same transaction, also delete the Strava keys of `athlete_data` (`STRAVA_KEYS` in `docker/coach/app/athlete_data.py:92`, as `forget_strava` does), and add the case to `test_another_athlete_replaces_the_previous_strava_data` in `docker/coach/tests/test_sync.py:265`.
**Why**: The spec's edge case "Reconnection with a different Strava athlete" requires the previous athlete's Strava data deleted before the first sync, and REQ-23 lists the segment cache as Strava data.

### F-2 · must-fix · bug · A detail download that always fails is retried forever   [ADDRESSED]
**File**: `docker/coach/app/activities.py:84-89`, `docker/coach/app/details.py:75-79`
**Issue**: `next_without_details` returns failed activities again (only ordered last) and `step()` answers `timedelta(0)` after a failure, so once only permanently failing activities remain (for example a 404 on an activity deleted on Strava more than 30 days ago), the downloader spends its whole 60-per-quarter-hour and 600-per-day budget on them every day, taking requests from app syncs and segment jobs.
**Change**: Skip activities whose `failed_at` is more recent than a cooldown (for example one day) in the `next_without_details` query, so a failed activity is retried at most once a day; add a test beside `docker/coach/tests/test_details.py`.

### F-3 · should-fix · bug · A sync's wake-up can be lost   [ADDRESSED]
**File**: `docker/coach/app/details.py:44-52`
**Issue**: `_sleep` clears `wake` only after `step()` returned; a `poke()` from a sync that finishes while `step()` runs (after `next_without_details` returned None) is erased, and the downloader sleeps without a timeout until a later sync.
**Change**: Clear `wake` at the start of each loop iteration in `run()`, before `step()`, and remove the `clear()` from `_sleep`.

### F-4 · should-fix · bug · A sync after reconnecting joins the old sync   [ADDRESSED]
**File**: `docker/coach/app/strava.py:105-108`
**Issue**: The single-flight task is not tied to the store's generation: after "Disconnetti da Strava" and a new connection during a long first sync, the new opening joins the old task, receives its 409 `disconnected` and shows "Collega Strava" although connected.
**Change**: Keep the generation the task started with and create a new task when it differs from `self.store.generation`.

### F-5 · should-fix · bug · Auth server down after a recent sync breaks the workout   [ADDRESSED]
**File**: `docker/coach/app/strava.py:186-187`
**Issue**: When `sync` returned "recent" and the auth server answers with an error, `_access_token()` in `refresh` raises `StravaUnavailable`, which escapes as the generic "Errore interno del Coach" instead of letting the workout continue with the saved details.
**Change**: Catch `StravaUnavailable` around the token request and continue with `todo = []`, as the `from_saved` branch does.

### F-6 · should-fix · bug · Two failed saves leave an unsaved value on screen   [ADDRESSED]
**File**: `web/src/data/athlete-data.ts:18-22`
**Issue**: With two queued saves of one key that both fail (X→A, then A→B), the first finds memory at B and does not revert, the second reverts to its `before`, A, which the server never accepted: the screens show A as saved until the next opening.
**Change**: Keep a per-key last confirmed value (set by `loadAthleteData` and by each successful save) and revert to it on failure; add the case to `web/tests/data/athlete-data.test.ts`.

### F-7 · should-fix · bug · Skipped-to-rainy can half-save the day   [ADDRESSED]
**File**: `web/src/data/storage.ts:79-82`
**Issue**: Moving a day from skipped to rainy saves `plannedRests` and `rainyDays` as two independent writes; if only one fails, only that key reverts, so the day ends "normal" while `TrainingScreen.vue` says the day went back to how it was.
**Change**: When one of the two saves fails, write the other key back to its previous value too (the `skips` and `rainy` read at the top), and test the partial failure in `web/tests/data/storage.test.ts`.

### F-8 · should-fix · bug · Profilo e dati names a load source no longer used   [ADDRESSED]
**File**: `web/src/core/home.ts:35-46`
**Issue**: The load method row counts `_metrics` from the JSON export's streams cache and says "TSS da streams" or "TSS approssimato (Weighted Avg summary)", while every activity's load now comes from the Coach with the ride details it downloaded.
**Change**: Build the row from the Coach's source (ride details where the Coach has them, summary otherwise, as the "Dettagli corsa" row already counts) and drop the `_metrics` count, updating `web/tests/core/home.test.ts`.

### F-9 · should-fix · bug · Details polling outlives the card   [ADDRESSED]
**File**: `web/src/components/DataPrecisionCard.vue:42-51`
**Issue**: If the card unmounts while `detailsProgress()` is pending, `onBeforeUnmount` has already cleared the timer and `readDetails` then schedules a new one, so the 30-second polling goes on after leaving the screen.
**Change**: Set a flag in `onBeforeUnmount` and skip the `setTimeout` when it is set.

### F-10 · should-fix · convention · Docs still say settings are lost per address   [ADDRESSED]
**File**: `README.md:137`, `README.md:324`, `.env.example:5-6`
**Issue**: "under `127.0.0.1` your settings and caches are not visible", "after changing the port the data saved under the old one is not visible" and the matching `.env.example` comment are untrue now that settings, calendar, FTP history, mesocycle and segment cache live on the server.
**Change**: Say that only the display choices (theme, last Analisi tab, Attività view) and the export's streams cache stay per address, while the athlete's data is the same everywhere.

### F-11 · nit · convention · Connection-check comment sits on another type   [ADDRESSED]
**File**: `web/src/core/coach-types.ts:110-117`
**Issue**: The comment "La verifica della connessione: il provider ha il modello?…" now sits above `DetailsProgress`, and `ConnectionCheck` lost it.
**Change**: Move the `DetailsProgress` block above that comment.

### F-12 · nit · convention · Segment comment sits on another function   [ADDRESSED]
**File**: `web/src/data/segments.ts:11-19`
**Issue**: The comment "Uscite lette da 'Completa da dettagli attività': una richiesta per uscita." describes `MAX_SEGMENTS_HYDRATE` but now sits above `keepSegments`.
**Change**: Move `keepSegments` with its own comment below `MAX_SEGMENTS_HYDRATE`.

### F-13 · nit · dup · A second plain-object check   [ADDRESSED]
**File**: `web/src/core/athlete-data.ts:33`
**Issue**: `isObject` repeats `isPlainObject` in `web/src/data/storage.ts:56-57`.
**Change**: Export `isObject` from `web/src/core/athlete-data.ts` and use it in `storage.ts` instead of `isPlainObject`.

### F-14 · nit · simplify · Sync result checks success twice   [ADDRESSED]
**File**: `web/src/app/jobs.ts:26-28`
**Issue**: `loaded.ok && synced.ok` repeats a check (`loaded` is `synced` whenever `synced` failed), and the one-key `Object.assign` is verbose.
**Change**: Return early when `!synced.ok`, then set `syncJob.result = syncResult(synced.value)` when `loaded.ok`, as `refreshAllActivities` in `web/src/app/all-activities.ts` returns early.

### F-15 · nit · convention · Start list omits the database   [ADDRESSED]
**File**: `README.md:129`
**Issue**: "Start everything (web app, auth server, Coach service, AI Coach model, Phoenix)" leaves out the database the Coach now waits for.
**Change**: Add the PostgreSQL database to the list.

### F-16 · nit · convention · Request log comment says one day, code keeps two   [ADDRESSED]
**File**: `docker/coach/app/activities.py:105-108`
**Issue**: The docstring says requests older than a day are no longer needed, the code deletes those older than two days.
**Change**: Make the docstring say two days.

### F-17 · nit · security · Database password has a committed default   [WITHDRAWN]
**File**: `compose.yaml:18`, `compose.yaml:140`, `.env.example:24`
**Issue**: `${POSTGRES_PASSWORD:-biketr}` and `POSTGRES_PASSWORD=biketr` give every install the same known password, while the spec wants the password only in `.env`; the database has no published port, which limits the exposure.
**Change**: Leave `POSTGRES_PASSWORD=` empty in `.env.example` and use `${POSTGRES_PASSWORD:?Scrivi POSTGRES_PASSWORD in .env}` in `compose.yaml`, documenting it in README section 3.
**Dispute**: the database volume of existing installs was created with the default password and their .env does not set one (this user's included), so a required POSTGRES_PASSWORD stops docker compose up, and a different value needs docker compose down -v, which deletes every saved activity and the athlete data
