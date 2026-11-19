---
feature: reliable-ride-labels
spec-version: 1.0
status: approved
---

# Architecture Plan: Reliable Ride Labels

## Technical Approach

### Overview

Everything stays in the Coach service, plus one Attività change in the web app. The power-meter flag is Strava's `device_watts`, carried as a new ride field `potenzaMisurata` beside the existing ride facts; the Label rule, the Label model messages and the new Selection rules all read Ride labels from `ctx["recentDays"]`, which only `labels_node` fills, so with Ride labels off no new code path runs. The Check set reuses the draft and measurement commands with a set name instead of new commands. Attività's badge comes from a new Coach endpoint shaped like `/coach/metrics`, computed from saved rides with the Label rule and saved Label model labels, never a model call. No new dependency.

### Shared Concerns

#### Ride facts from a Strava summary

- **Appears in**: Task 01, Task 02, Task 05
- **Reference example**: `docker/coach/app/labels.py:25` (`ride_facts`) and `docker/coach/app/metrics.py:197` (`recent_rides`)
- **Rule**: one function in `labels.py` turns a Strava summary plus its ride details into the ride dict the Label rule and Label model read (including `potenzaMisurata`); `ride_facts`, the draft command and the badge endpoint all use it.

#### Tuning set measurement after each change

- **Appears in**: Task 01, Task 02, Task 04
- **Reference example**: `docker/coach/app/label_check.py`, `label-runs/README.md`
- **Rule**: a change to thresholds or the Label model prompt is followed by a Tuning set run, its file and README row kept; the user runs it when a real model is needed (Ollama on the Mac).

## Per-Task Technical Guidance

### Task 01: label-rule-by-source

**Files to modify:**
- `docker/coach/app/labels.py` — `intensity` reads power only when `potenzaMisurata`; separate `POWER_*` and `HR_*` thresholds with source comments; the shared ride-facts function adds the flag from `device_watts`.
- `docker/coach/app/labeled_rides.py:69` — `anonymized` writes `potenzaMisurata`.
- `docker/coach/evaluation/labeled_rides.json`, `docker/coach/evaluation/situations.json` — add the flag to every ride, inferred from `np` (one-off script in scratchpad, not committed).
- `docker/coach/app/label_check.py:34` — `labeled_rides` infers the flag from `np` when a ride lacks it.
- Tests: `docker/coach/tests/test_labels.py`, `test_labeled_rides.py`, `test_evaluation_set.py` (every ride has the flag).

**Patterns to reuse:**
- Threshold constants with a source comment, as `docker/coach/app/selection_rules.py:63-66`.

**Key decisions:**
- Heart-rate starting points from the published LTHR zone model (Friel), then tuned on the Tuning set only.

**Watch out for:**
- Changing `intensity` changes labels in existing Evaluation set runs with labels on — `docker/coach/app/graph.py:92` → expected; record the Tuning set score before and after in `label-runs/README.md`.

---

### Task 02: label-model-intensity

**Files to modify:**
- `docker/coach/app/labels.py:76` — `model_messages` adds share of FTP (power-meter only) and of LTHR per ride, `or_dash` for missing; `LABEL_SYSTEM` explains shares per label and demands every id.
- `docker/coach/app/label_check.py:118-129` — count rides with `model == ""` and print them in the model line; the score already counts them wrong.
- Tests: `docker/coach/tests/test_label_model.py`, `test_label_check.py`.

**Patterns to reuse:**
- `labels.intensity` from Task 01 for both shares, so rule and model read the same numbers.

**Key decisions:**
- Shares rounded to two decimals; the Strava id never enters the messages (unchanged short ids).

**Watch out for:**
- `prompts.prompt_version` does not hash `LABEL_SYSTEM` — `docker/coach/app/prompts.py:113` → results files name `labelModel.model` only; note the prompt change in `label-runs/README.md`.

---

### Task 03: check-set

**Files to modify:**
- `docker/coach/app/labeled_rides.py` — `--set check`: picks from saved rides not in the local record, writes `labeled-rides-check-draft.json`; every draft also writes the local record `/project/labeled-rides-sources.json` (set, short id, Strava id).
- `docker/coach/app/label_check.py` — `--set tuning|check` selects `labeled_rides.json` or `labeled_rides_check.json`; `file_stem` and `readme_row` carry the set; on the Check set a verdict line per labeller (80% and half of each present label, inclusive).
- `.gitignore` — the record and the new draft.
- `label-runs/README.md`, `README.md` — set column, the two sets, the bar.
- Tests: `test_labeled_rides.py`, `test_label_check.py`.

**Patterns to reuse:**
- Draft write with `replace_file`, as `labeled_rides.py:111`; argparse choices as `docker/coach/app/evaluation.py`.

**Key decisions:**
- The Tuning set's record is rebuilt once: today's `picked()` matches all 40 Tuning set rides by position within the 3% jitter (checked during planning); the command refuses if any ride does not match.

**Watch out for:**
- The record holds Strava ids — `.gitignore` → add it before the first write; test: `git check-ignore` on the host.
- Rides synced later shift `picked()` — `labeled_rides.py:60` → exclusion reads the record, never re-picks.

---

### Task 04: label-selection-rules

**Files to modify:**
- `docker/coach/app/selection_rules.py` — `Rule` gains label conditions (gara yesterday; minimum ripetute-or-gara count in 3 days; quiet week: 3+ rides, none hard, in 7 days); `applies` receives the labelled rides; three rules inserted after `recupero` (post-race, two hard days) and after `un_po_stanco` (quality after endurance); `sentence` words them.
- `docker/coach/app/graph.py:76` — `labels_node` adds `giorniFa` to each ride from `Request.now_ms`; `from_context` takes an optional today.
- `docker/coach/app/evaluation.py:78` — passes a situation's `oggi` date.
- `docker/coach/app/grading.py:127` — allowed list from `withLabels` when the run's `labelsMode` is not off.
- `docker/coach/app/prompts.py:113` — label rules enter `prompt_version` only with labels on.
- `docker/coach/evaluation/situations.json` — six situations with `oggi` and `withLabels`.
- Tests: `test_selection_rules.py`, `test_evaluation_set.py`, `test_grading.py`, `test_prompts.py`.

**Key decisions:**
- Rules without labels or `giorniFa` never apply: off stays today's by construction.

**Watch out for:**
- A new `*_from`/`*_below` field joins the threshold test — `tests/test_evaluation_set.py:101` → name label conditions without those suffixes.
- `select` also drives fallback and grading — `selection_rules.py:91-106` → off-mode test over all 27 old situations.

---

### Task 05: activity-label-badge

**Files to modify:**
- `docker/coach/app/main.py` — `POST /coach/labels` with `{profile, ids}`, as `/coach/metrics` at `main.py:218`: `{labels: {}}` when Ride labels are off; else saved Label model labels (`activities.ride_labels`), the Label rule for the rest, rides without power or heart rate left out.
- `web/src/data/coach.ts` — `rideLabels`, as `activityLoads` at line 53.
- `web/src/app/all-activities.ts` — after the list, asks labels with `hrProfile()`; a failure leaves the map empty.
- `web/src/screens/ActivitiesScreen.vue` — badge beside the sport icon in rows and cards.
- `README.md` — the badge.
- Tests: `docker/coach/tests/test_loads.py` (beside the `/coach/metrics` tests), `web/tests/app/all-activities.test.ts`.

**Patterns to reuse:**
- Request shape and parsing from `workout.parse_loads_request`.

**Watch out for:**
- A new public contract the browser consumes — `web/src/data/coach.ts:53` → one answer shape for off and on (`labels` map); test: off returns an empty map, never an error.
- Ids not saved — `activities.summaries` drops them → missing ids get no badge.
