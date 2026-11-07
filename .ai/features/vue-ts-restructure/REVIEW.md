---
feature: vue-ts-restructure
status: DRAFT
reviewed: 2026-11-07
head: 8c73993970143ba6ea907a78d1f92e33ec1827d7
---

# Review — vue-ts-restructure

**Scope**: 137 files (primary — diff since base `c6f7bc5e`; 23 workflow artifacts under `.ai/` excluded)
**Findings**: 1 must-fix · 4 should-fix · 11 nit

## Findings

### F-1 · must-fix · bug · max export drops the stream metrics already downloaded when sign-in fails   [ADDRESSED]
**File**: `web/src/data/export.ts:179`
**Issue**: in the "max" export, an `AuthError` from the token request (auth server down, Strava unreachable during a token renewal, disconnected in another tab) is rethrown out of `throttledQueue` before `saveStreamsCache(streamsCache)` at line 230 runs, so the metrics computed for every ride downloaded until then are thrown away together with the export.
**Change**: save the streams cache before the error leaves the streams phase (wrap the streams `throttledQueue` call in `try { … } finally { saveStreamsCache(streamsCache); }`), as `web/src/data/streams.ts:29-31` does before rethrowing.
**Why**: task 08 edge case (REQ-12): when Strava fails during a long action, what was already downloaded is kept; the old `export.js` queue caught every error and carried on.

### F-2 · should-fix · dup · FTP and LTHR breakdowns copy the estimates they explain   [ADDRESSED]
**File**: `web/src/core/ftp.ts:142-153`, `web/src/core/ftp.ts:182-209`, `web/src/core/hr.ts:49-60`, `web/src/core/hr.ts:94-110`
**Issue**: `buildFtpBreakdown` re-declares `estimateFTP`'s age decay and its four duration buckets with their factors, and `buildLthrBreakdown` repeats `estimateLTHR`'s 0.91 and 0.98 factors and its 20–60 min window; the decay is a third copy of `effortDecay` (`web/src/core/segments.ts:49`), so a change in one copy makes the Analisi breakdown stop matching the number it explains.
**Change**: use `effortDecay(a.start_date_local, now)` for both decays, and export one bucket table (with its labels) and one set of LTHR constants from `hr.ts` that both the estimates and the breakdowns read.
**Why**: REQ-6 — each shared helper exists once.

### F-3 · should-fix · dead · most physiology constants are never read   [ADDRESSED]
**File**: `web/src/core/physio.ts:1-43`
**Issue**: only `Z2_PCT_LTHR`, `Z3_PCT_LTHR` and `Z4_PCT_LTHR` are read (`web/src/core/streams.ts:37-39`); the other fields (`LTHR_OVER_HRMAX`, `FTP_FACTOR_20MIN`, `CTL_TC_DAYS`, `ATL_TC_DAYS`, `Z1_MAX_PCT_LTHR`, `Z5_MIN_PCT_LTHR`, `HARD_*`, `FTP_DECAY_TAU_WEEKS`, `VOLUME_MUL`) are unused while the same values are written by hand in `hr.ts`, `form.ts` and `ftp.ts`, so the "Costanti fisiologiche centralizzate" header is untrue and editing one of those fields changes nothing.
**Change**: delete the unused fields and reword the header to say the file holds the heart-rate zone bounds.

### F-4 · should-fix · dup · day arithmetic rewritten beside the shared date helpers   [ADDRESSED]
**File**: `web/src/core/plan/model.ts:10-14`, `web/src/core/form.ts:27-31`, `web/src/core/plan/week.ts:160-168`
**Issue**: `model.ts`'s `daysFromIso` and `form.ts`'s day-delta loop re-implement `buildDateHelpers(0, now).ago` (`web/src/core/dates.ts:15-21`), and `week.ts` computes this week's Monday and today's date by hand where `currentMondayOffset` (`web/src/core/plan/dates.ts:11`) and `dayOffsetIso` (`web/src/core/dates.ts:32`) exist.
**Change**: use `buildDateHelpers(0, now).ago` in `model.ts` and `form.ts`, and `dayOffsetIso(currentMondayOffset(now), now)` and `dayOffsetIso(0, now)` in `week.ts`.
**Why**: REQ-6 — each shared helper exists once.

### F-5 · should-fix · dead · two ported plan functions have no caller   [ADDRESSED]
**File**: `web/src/core/plan/recommend.ts:319-347`, `web/src/core/meso.ts:275`
**Issue**: `synthActivityFromRec` and `mesoPhaseForWeek` are called only by their own tests (`web/tests/core/plan.test.ts`, `web/tests/core/meso.test.ts`), not by the app or the Coach reference script; they were already unused in the old `training.js`, and `synthActivityFromRec` is a second, different rule for simulating a planned ride beside `synthFromWorkout` (`web/src/core/plan/month.ts:22`), which is the one the plan uses.
**Change**: delete both functions and their test cases.

### F-6 · nit · dead · debug log left in the week plan calculation   [ADDRESSED]
**File**: `web/src/core/plan/week.ts:315-329`
**Issue**: `console.log('[BikeTR rainy-check]', …)` prints the athlete's latest activities, names included, every time the plan is built with today marked rainy; it is the only console call in `web/src/core/`.
**Change**: remove the block, together with the `strengthIsosDetected` and `recentActivities` data that only feed it.

### F-7 · nit · convention · export detects Strava's rate limit by searching the message text   [ADDRESSED]
**File**: `web/src/data/export.ts:180`
**Issue**: `(e as Error).message.includes('429')` also matches the activity id in the message (`API /activities/14290…: 404`), so a failed ride whose id contains "429" triggers a needless 60-second wait.
**Change**: `if (e instanceof StravaError && e.status === 429)`, as `web/src/data/segments.ts:77` does.

### F-8 · nit · dup · cached stream metrics applied by three copies of the same loop   [ADDRESSED]
**File**: `web/src/data/storage.ts:90-95`, `web/src/data/streams.ts:39-42`, `web/src/data/export.ts:233-236`
**Issue**: the loop that puts each cached, non-failed stream entry on its activity as `_metrics` is written three times.
**Change**: give `applyCachedStreams` an optional cache argument (default `loadStreamsCache()`) and call it from `streams.ts` and `export.ts`.

### F-9 · nit · dup · sleep helper defined twice in the data layer   [ADDRESSED]
**File**: `web/src/data/export.ts:31`, `web/src/data/segments.ts:19`
**Issue**: the same one-line `sleep` promise helper exists in both files.
**Change**: keep one copy, exported from `web/src/data/strava.ts` (both files already import from it), and import it in both.

### F-10 · nit · dup · km/h conversion written twice   [ADDRESSED]
**File**: `web/src/core/home.ts:96`
**Issue**: the records row converts speed with `((a.average_speed || 0) * 3.6).toFixed(1)`, the same conversion as `kmh` in `web/src/core/activity-view.ts:10`.
**Change**: move `kmh` into `web/src/core/format.ts` beside `fmtKm` and use it in both files.

### F-11 · nit · dup · chart legend markup and style copied between cards   [ADDRESSED]
**File**: `web/src/components/FormTrendCard.vue:42-46,57-64`, `web/src/components/LoadChartCard.vue:38-42,47-54`
**Issue**: the legend row (flex container, one dot and label per series) and its six-line `.legend-dot` rule are identical in both cards, and `FtpTrendCard.vue:47-52` repeats the row with a line marker.
**Change**: extract one small legend component taking the series' color and label, and use it in the three cards.

### F-12 · nit · dead · rest-day count ignores its planned-rests argument   [ADDRESSED]
**File**: `web/src/core/plan/recommend.ts:20`
**Issue**: `restStreak` never reads `_plannedSet`, so `computeMetrics`'s `plannedRests` parameter (line 296) and the set it builds exist only to be passed to it.
**Change**: drop the parameter from `restStreak` and `computeMetrics` and from their callers (`recommend.ts:83` and `:313`, `week.ts:145`, `training-view.ts:38`, `web/tests/core/plan.test.ts:48-49`).

### F-13 · nit · convention · plan comments describe code that is not there   [ADDRESSED]
**File**: `web/src/core/plan/week.ts:150-153`, `web/src/core/plan/week.ts:95-99`, `web/src/core/training-v2.ts:12-17`
**Issue**: the comment at `week.ts:150` says build weeks never lose hard sessions, but the reduction at `week.ts:186-191` applies to every week on low form, a load spike or unbalanced polarization; the comments at `week.ts:95-99` and `training-v2.ts:12-17` compare with a "V1" workout catalog that no longer exists.
**Change**: reword each to describe what the code does now, or delete it.

### F-14 · nit · convention · auth server type check includes the browser's Vite types   [ADDRESSED]
**File**: `web/tsconfig.auth.json:3-5`
**Issue**: the Node-only auth server inherits `"types": ["node", "vite/client"]` from `web/tsconfig.json:7`, so a use of `import.meta.env` in `server.ts` would pass the check and be undefined at run time.
**Change**: add `"types": ["node"]` next to the `lib` override at line 4.
**Why**: ARCHITECTURE (task 02) gives the auth check `types: ["node"]`.

### F-15 · nit · dead · exports that nothing outside their file imports   [ADDRESSED]
**File**: `web/src/data/storage.ts:11`, `web/src/data/storage.ts:14-15`, `web/src/data/storage.ts:53`, `web/src/data/storage.ts:129`, `web/src/data/export.ts:21`, `web/src/data/export.ts:193`, `web/src/data/auth.ts:34`, `web/src/core/coach-types.ts:29`, `web/src/core/dates.ts:5`, `web/src/core/form.ts:47`, `web/src/core/ftp.ts:86`, `web/src/core/home.ts:15`, `web/src/core/home.ts:84`, `web/src/core/load.ts:8`, `web/src/core/meso.ts:10`, `web/src/core/meso.ts:28`, `web/src/core/plan/dates.ts:7`, `web/src/core/plan/week.ts:29`, `web/src/core/plan/week.ts:59`, `web/src/core/profile.ts:6`, `web/src/core/segments-view.ts:8`, `web/src/core/segments.ts:8`, `web/src/core/segments.ts:14`, `web/src/core/segments.ts:67`, `web/src/core/strava-types.ts:29`, `web/src/core/strava-types.ts:148`, `web/src/core/strava-types.ts:168`, `web/src/core/training-v2.ts:24`, `web/src/core/training-v2.ts:43`, `web/src/core/training-v2.ts:49`, `web/src/core/training-view.ts:73`, `web/src/core/training-view.ts:158`
**Issue**: these exports are used only inside their own file (no importer in `web/src`, `web/tests` or the Coach reference script), and `export type { Settings }` in `storage.ts:11` is a re-export nobody imports.
**Change**: drop the `export` keyword on each, and delete the `storage.ts:11` re-export.

### F-16 · nit · convention · README still names the streams button in English   [ADDRESSED]
**File**: `README.md:254`
**Issue**: the known-limitations entry says `Click "Refresh with streams"`, while the rest of the README (lines 15, 162, 179) and the button use "Aggiorna con streams".
**Change**: write `Click "Aggiorna con streams"`, as at `README.md:15`.
