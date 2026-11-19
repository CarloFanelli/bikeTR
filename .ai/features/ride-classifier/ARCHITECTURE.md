---
feature: ride-classifier
spec-version: 1.0
status: approved
---

# Architecture Plan: Ride Classifier and Model Routing

## Technical Approach

### Overview

A new `labels` node joins the Coach graph between metrics and papers; the Evaluation set's entry moves from papers to labels, so every entry point labels the same way. `coach_context` stays untouched (its output is compared with the browser reference): the node builds the classifier's ride facts itself, from `RideData` on the Coach screen or from the situation's `recentDays` in the Evaluation set, and writes each label into `recentDays`. The Label model reuses `ChatSettings`, `provider.stream`, `cost`/`charge` and the `Spending` total unchanged, so routing adds settings and one call, not a second client stack. Saved labels get their own table with a cascade on `strava_activities`, so Disconnect needs no new code.

### Shared Concerns

#### Ride labels setting

- **Appears in**: Task 01, Task 02, Task 05, Task 06
- **Reference example**: `docker/coach/app/provider.py:69` (`search_mode()`)
- **Rule**: `COACH_RIDE_LABELS` is read and checked at each request like `COACH_SEARCH_MODE`, carried on the request's settings, and written into every results file next to `searchMode`.

#### Label source

- **Appears in**: Task 01, Task 02, Task 03, Task 06
- **Reference example**: `docker/coach/app/graph.py:290` (`modelSearches` in the result)
- **Rule**: each ride's label travels as label plus source (rule, model, saved) in the result, the Trace and the results files; the prompt shows only the label.

## Per-Task Technical Guidance

### Task 01: rule-ride-labels

**Files to modify:**
- `docker/coach/app/provider.py` — `ride_labels()` like `search_mode()`; field on `ChatSettings`.
- `docker/coach/app/graph.py` — `labels_node`, edges metrics → labels → papers, `entry` sends `ctx` to labels; result gains `rideLabels`.
- `docker/coach/app/prompts.py` — `ride_line` appends the label when present; `prompt_version` includes the labels mode.
- `docker/coach/app/strava.py:28` — `KEPT_FIELDS` adds `name`, `workout_type`, `max_watts`, `max_heartrate`.
- `docker/coach/app/tracing.py` — `"labels"` step and `note_labels`.
- `docker/coach/app/live_check.py:88` — `record` writes `rideLabels`; run header writes the setting.
- `docker/coach/app/evaluation.py` — run header writes the setting.
- `docker/coach/evaluation/situations.json` — add the five fields to every ride.
- `compose.yaml:5` — `COACH_RIDE_LABELS` in `x-coach-env`; `.env.example`.

**Files to create:**
- `docker/coach/app/labels.py` — ride facts, the Label rule, the label vocabulary; pattern `docker/coach/app/selection_rules.py`.
- `docker/coach/tests/test_labels.py` — thresholds and node behavior.

**Key decisions:**
- Race flag is Strava's `workout_type == 11` (ride race).
- Intensity: normalized power, else weighted or average watts, over FTP; else average heart rate over LTHR.

**Watch out for:**
- Off must leave the prompt byte-identical — `prompts.py:132` `ride_line` → add text only when a label exists; test: `coach_expected.json` cases unchanged with the setting missing.
- Moving the Evaluation entry from papers to labels breaks `entry` — `graph.py:296` → return "labels" for `ctx`; test: Evaluation path with the setting off still skips rides and metrics.
- Ride names now reach the model and Phoenix; today `strava.py:30` keeps them out → only `labels.py` reads `name`; the browser `context` event stays as today.

---

### Task 02: label-model-call

**Files to modify:**
- `docker/coach/app/provider.py` — `label_settings()` from `LABEL_PROVIDER`, `LABEL_MODEL`, `LABEL_CLOUD_URL`, `LABEL_CLOUD_API_KEY`, `LABEL_PRICE_IN`, `LABEL_PRICE_OUT`, limit from `CLOUD_SPENDING_LIMIT`, returning a `ChatSettings`.
- `docker/coach/app/graph.py` — `Request` gains label settings and client; `labels_node` calls once, charges like `_model_turn` (`graph.py:160`).
- `docker/coach/app/main.py:167` — build label settings and client next to the chat ones; cap check before the call.
- `docker/coach/app/evaluation.py:45` — `affordable` adds one Label model call per answer.
- `docker/coach/app/tracing.py:209` — reuse `note_model` inside the labels step.
- `compose.yaml` — new settings; `ollama-pull` also pulls `LABEL_MODEL` when set.

**Files to create:**
- `docker/coach/tests/test_label_model.py` — fake Label model answers (good, partial, broken, unreachable).

**Patterns to reuse:**
- `tests/fakes.py` fake chat client; `provider.py:85` settings checks.

**Key decisions:**
- One JSON answer `{id: label}`; anything else falls back per ride. Prompt and answer in Italian labels.

**Watch out for:**
- Label call failing must not raise — `graph.py:177` turns `ModelError` into a 502 → catch it in `labels_node`, rule labels; test: unreachable fake Label model, request still answers.
- Label cost escaping the cap — `spending.py:57` → `check` before the call, `add` after, as in `_model_turn`; test: cap reached, no call.

---

### Task 03: saved-ride-labels

**Files to modify:**
- `docker/coach/app/activities.py` — `ride_labels(ids, model)` and `save_ride_labels(generation, …)`, through `_write` like `save_details` (`activities.py:171`).
- `docker/coach/app/strava.py` / `graph.py` — the store reaches `labels_node` only on the Coach screen; Live check and Evaluation never save.

**Files to create:**
- `docker/coach/migrations/004_ride_labels.sql` — activity id (cascade on `strava_activities`), label, Label model name; pattern `migrations/001_strava_data.sql`.

**Key decisions:**
- Upsert keyed by activity id: the last save wins; another model's row is overwritten.

**Watch out for:**
- A save after Disconnect writing labels for a reconnected athlete — `activities.py:43` `_write(generation)` → save through it; test: generation bumped, nothing saved.
- Stop mid-call must save nothing → save only after a complete answer; test: cancelled call, no row.

---

### Task 04: labeled-rides-draft

**Files to create:**
- `docker/coach/app/labeled_rides.py` — command reading saved rides with `ActivityStore.latest` and `details`, anonymizing, label left empty; pattern `docker/coach/app/live_check.py:215` (`main`, `give_to_folder_owner`).
- `docker/coach/tests/test_labeled_rides.py`.

**Files to modify:**
- `.gitignore` — the draft file at the project root.
- `compose.yaml:95` — mention the command in the `coach-tools` comment.

**Key decisions:**
- Names rebuilt from a word list of training terms (numbers like `6x3'`, Z2, VO2, soglia, gara, recupero, fondo); every other word dropped; nothing left gives "Uscita".
- Numbers jittered by a seeded ±3 %; dates moved into a fixed made-up week.
- Proposed labels are written in the /dev session by Claude, not by code: a rule-made proposal would favour the Label rule.

**Watch out for:**
- A place or person surviving in a name — new code in `labeled_rides.py` → keep only listed words; test: "Giro del lago con Marco" gives no "lago" nor "Marco".

---

### Task 05: label-accuracy-check

**Files to create:**
- `docker/coach/app/label_check.py` — command; pattern `docker/coach/app/evaluation.py` (`affordable`, `write_results`, `money`).
- `label-runs/README.md` — results table; pattern `eval-runs/README.md`.
- `docker/coach/tests/test_label_check.py`.

**Files to modify:**
- `compose.yaml:95` — `coach-tools` comment.

**Patterns to reuse:**
- `live_check.file_stem` and `write_results` for the results file; labelling through `labels.py` from Task 02.

**Key decisions:**
- The Labeled rides file lives in `docker/coach/evaluation/labeled_rides.json`, next to the situations.

---

### Task 06: cost-split-readme

**Files to modify:**
- `docker/coach/app/grading.py:187` — report and `table_row` add the labels mode and Label model cost and seconds; a run without them reads as off.
- `docker/coach/app/graph.py` — result carries label tokens, cost and seconds apart from the Chat model's.
- `docker/coach/app/live_check.py:88` — `record` copies them.
- `README.md` — Coach section and results tables.
- `docker/coach/tests/test_grading.py`.

**Watch out for:**
- Old results files lacking the new fields — `grading.py:182` reads `searchMode` with a default → same `run.get` default for labels; test: grading a 2026-11-19 file unchanged.
