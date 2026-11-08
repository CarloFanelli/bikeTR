---
feature: fallback-reason
spec-version: 1.0
status: approved
---

# Architecture Plan: Fallback reason

## Technical Approach

### Overview

Both tasks change one function, `decide` in `docker/coach/app/workout.py`, which turns the model's text into the workout for the browser, the live check and the evaluation run. Task 01 sends a too-long catalog protocol through the same fallback path as the other three causes, using `fallback_protocol_id`. Task 02 has `decide` return the warning text with the workout; the card shows it. The service writes the text, as it already writes the fallback rationale (`workout.py:124`), because only the service knows catalog names and minimum minutes. No new files, no new dependencies.

## Per-Task Technical Guidance

### Task 01: too-long-uses-rules

**Files to modify:**
- `docker/coach/app/workout.py:111-147` — `decide`: when the chosen protocol's `build` returns `None`, take `fallback_protocol_id(ctx, duration)` with the fallback rationale and no model-cited papers, instead of the Z2 swap at `:130`; update the docstring.
- `docker/coach/tests/test_workout.py` — replace the too-short test at `:102` with tests for REQ-1..3 on `decide` (the recovery athlete, the 63/64-minute boundary, a fitting protocol the rule does not allow).
- `README.md:125-126` (request diagram) and `:339` (differences from the browser Coach) — the too-long case goes to the fallback rules.
- `PROCESS.md` — new `## fallback-reason` section with this decision and its reason, as in the sections above it.

**Patterns to reuse:**
- The unreadable-answer branch at `workout.py:121-126` is the target shape: the too-long case ends there.
- Per-case overrides of the browser reference: `SUPPORTING_PAPER_REFS` at `test_workout.py:29`.

**Watch out for:**
- The too-long workout would still cite the model's protocol's paper — `workout.py:142` reads `proto` from the model's choice → read the source of the protocol given; test: a too-long `z2_cadence_drills` cites no `27175601`.
- The browser comparison fails for the two 45-minute cases (`too-short`, `too-short-keeps-source`) — `test_workout.py:78` → override only their rationale and papers beside `:29`; never edit `coach_expected.json`.
- A comment turns untrue — `test_grading.py:57` says the Coach swaps in Z2 → reword to the fallback rules; scores do not change, grading reads the model's choice (`grading.py:60`).

---

### Task 02: fallback-warning

**Files to modify:**
- `docker/coach/app/workout.py` — `decide` returns `fallbackWarning`: one of the spec's four Italian texts, or `None` when the model's choice was used. The cause follows the existing branches: truncated, then not a JSON object, then no catalog `protocolId`, then too long. The too-long text uses `PROTOCOLS[id].name` and `minimum_minutes` from `selection_rules.py:97`.
- `docker/coach/tests/test_workout.py` — one test per cause with the exact text, plus the edge cases (empty answer, list, `null` id, 30 minutes, special-character names) and no warning for a used choice.
- `web/src/core/coach-types.ts:40` — `fallbackWarning: string | null` on `CoachWorkout`.
- `web/src/components/CoachWorkoutCard.vue:17-19` — show `workout.fallbackWarning` instead of the fixed text, as text interpolation.
- `PROCESS.md` — add the warning decision to the `## fallback-reason` section.

**Patterns to reuse:**
- The Italian text constants beside `NO_RATIONALE` at `workout.py:30`.
- The service-side wording of `minimum_minutes` already used by the prompt's "Durata minima" line (`prompts.py:18`).

**Key decisions:**
- `fellBack` stays: the live check, the evaluation and grading read it (`live_check.py:92`, `grading.py:90`).

**Watch out for:**
- Results files would gain a field the spec leaves out — `live_check.py:92` copies chosen fields → leave `record` unchanged; test: an evaluation answer keeps its current keys.
- The browser casts the result without checking it — `coach-run.ts:50` → the card shows the warning only when `fallbackWarning` is a non-empty string.
