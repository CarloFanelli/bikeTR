---
feature: ride-shape-labels
spec-version: 1.0
status: approved
---

# Architecture Plan: Ride Shape Labels

## Technical Approach

### Overview

Everything stays in the Coach service. The stream download already in `strava.py:_download` also saves a compact series (15-second averages of watts and heart rate, gaps as null) in a new table beside `ride_details`; the background downloader picks rides with details but no series, so old rides are downloaded again under the existing budget. A new pure module computes the Ride shape from a series plus today's FTP and LTHR, never stored, so a new FTP needs no download. The Label rule, the Label model messages, the badges and the label measurement all read the shape through `labels.ride`. Labeled rides carry the anonymized series, so the shape can be tuned on the Tuning set. No new dependency.

### Shared Concerns

#### Series to Ride shape

- **Appears in**: Task 02, Task 03, Task 04
- **Reference example**: `docker/coach/app/metrics.py:46` (`ride_details`), `docker/coach/app/labels.py:47` (`ride`)
- **Rule**: one function turns a series, a measured-power flag, FTP and LTHR into the Ride shape; the Coach, badges and `label_check` all call it, never a copy.

## Per-Task Technical Guidance

### Task 01: keep-ride-series

**Files to create:**
- `docker/coach/migrations/005_ride_series.sql` — table keyed by activity, cascade delete like `004_ride_labels.sql`; step seconds, watts and heart-rate arrays.

**Files to modify:**
- `docker/coach/app/metrics.py:46` — `ride_details` also returns the compact series (15 s averages; zero or missing heart rate as null).
- `docker/coach/app/activities.py:177` — `save_details` writes the series in the same `_write`; a new read of series by ids; `next_without_details` (`:94`) also selects rides with details and no series; `forget` covered by cascade.
- `docker/coach/app/strava.py:278` — unchanged call, passes the series through.
- Tests: `docker/coach/tests/test_details.py` (downloader), `test_metrics.py` (averaging).

**Key decisions:**
- 15 s steps: a 4-hour ride is 960 points; a 20-second dip is one or two steps.

**Watch out for:**
- `save_details` uses `ON CONFLICT DO NOTHING` — `activities.py:181` → a re-download of a ride with details must still insert its series; test it.
- `details_progress` counts rides with details — `activities.py:104` → it stays as is; series progress is not shown (Dietro le quinte unchanged).
- A ride whose streams have neither signal gets an empty series row, or it is re-downloaded forever — `activities.py:94`.

---

### Task 02: ride-shape

**Files to create:**
- `docker/coach/app/ride_shape.py` — Hard blocks, recoveries, minutes per zone; thresholds as constants with source comments (Coggan power zones, Friel LTHR zones) like `labels.py:18-27`.
- `docker/coach/tests/test_ride_shape.py` — synthetic series: 2x20, 3x10 Z3, one activation, 50 s effort, 20 s dip, dropouts.

**Patterns to reuse:**
- `labels.power_share` / `hr_share` (`labels.py:56-64`) for when power counts as measured.

**Key decisions:**
- Power blocks only with `potenzaMisurata`; heart rate fills only where power is missing.
- Merge gap of 30 s; minimum block 60 s.

---

### Task 03: labeled-rides-series

**Files to modify:**
- `docker/coach/app/labeled_rides.py:92` — `anonymized` adds `serie` (step, watts, hr) scaled by one random factor per signal within `JITTER`; a `--add-series` option fills both existing sets through `labeled-rides-sources.json` by position, stopping on a missing ride.
- `docker/coach/app/label_check.py:41` — `labeled_rides` accepts `serie`; rides without one are labelled from averages.
- `docker/coach/evaluation/labeled_rides.json`, `labeled_rides_check.json` — series added; Tuning labels replaced by the user's 39 from the labelling page plus r37 when given.
- Tests: `test_labeled_rides.py`, `test_label_check.py`.

**Watch out for:**
- The sources record holds Strava ids and stays out of git — `.gitignore:13` → the command reads it, never copies ids into the sets.

---

### Task 04: shape-aware-labels

**Files to modify:**
- `docker/coach/app/labels.py:47` — `ride` adds the shape; `rule_label` (`:72`): gara, then repeated-block pattern gives ripetute, else today's averages path; `model_messages` (`:116`) describes blocks, recoveries and minutes per zone; `LABEL_SYSTEM` explains them.
- `docker/coach/app/graph.py:89` and `docker/coach/app/main.py:238` — pass series and FTP/LTHR so the Coach and badges see the shape.
- `label-runs/README.md` — Tuning and Check set rows for the new rule.
- Tests: `test_labels.py`, `test_label_model.py`, `test_loads.py` (badges).

**Key decisions:**
- "Similar length": longest block at most twice the shortest, tuned on the Tuning set only; Check set measured once after tuning.

**Watch out for:**
- Labels off must not change the Coach — `graph.py:89` runs only with labels on → keep the series read inside that path.
