---
feature: ride-classifier
status: APPROVED
reviewed: 2026-11-19
head: 9750ee8ef73612df2f51a9416e80ec0a05846def
---

# Review — ride-classifier

**Scope**: 36 files (re-verification — delta since review head `9750ee8e`, nothing committed since, so the whole feature diff; 16 workflow artifacts under `.ai/` excluded; the two `eval-runs/2026-11-19_08-*.json` results files predate this feature and were not reviewed)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · convention · README privacy statements now untrue with a cloud Label model   [ADDRESSED]
**File**: `README.md:274`, `README.md:337`
**Issue**: The README says activity names are never sent to a cloud provider and never stored in traces, but the Label model's messages carry each ride's name, so a cloud Label model receives them and the labels step's turn stores them in Phoenix.
**Change**: Rewrite both paragraphs: with `COACH_RIDE_LABELS=model` the Label model receives each recent ride's name (sent to its provider when `LABEL_PROVIDER=cloud`), and the labels step's turn stores those messages in the trace; the chat model's prompt still never carries names.
**Why**: These paragraphs are the project's privacy promise to the athlete; the feature changed what they describe.

### F-2 · should-fix · bug · measurement cost counts other spending   [ADDRESSED]
**File**: `docker/coach/app/label_check.py:107-120`
**Issue**: `totalCost` is the change of the shared spending total during the run, so a Coach request or another command spending at the same time is counted as the Label model's cost.
**Change**: Count only this run's charges, as `docker/coach/app/live_check.py:60` (`SituationSpending`) does, or sum each turn's `charged`.

### F-3 · nit · dup · accuracy formatting reimplements grading's ratio   [ADDRESSED]
**File**: `docker/coach/app/label_check.py:59-84`
**Issue**: `score_line` and `readme_row` each compute "N% (right/of)" by hand, twice in the same file, while `docker/coach/app/grading.py:185` (`ratio`) already formats a (hits, total) pair that way.
**Change**: Use `grading.ratio((right, of))` for both and drop the inline percentage code.

### F-4 · nit · dup · labeled rides path written twice   [ADDRESSED]
**File**: `docker/coach/app/labeled_rides.py:32`
**Issue**: `FINAL_FILE` spells the same path as `label_check.LABELED_FILE` (`docker/coach/app/label_check.py:27`) as a separate string.
**Change**: Derive the printed path from `label_check.LABELED_FILE` (relative to the project folder) instead of a second literal.

### F-5 · nit · simplify · ownership fixed twice   [ADDRESSED]
**File**: `docker/coach/app/labeled_rides.py:115`
**Issue**: `give_to_folder_owner(out)` repeats what `replace_file` already did on the file it renamed into place.
**Change**: Remove the call, as `docker/coach/app/evaluation.py` does after `replace_file`.

### F-6 · nit · convention · missing LABEL_MODEL message names the wrong setting in the measurement   [ADDRESSED]
**File**: `docker/coach/app/provider.py:106`
**Issue**: The measurement command calls `label_settings` with any `COACH_RIDE_LABELS`, yet the message starts "Con COACH_RIDE_LABELS=model manca", which is untrue when the setting is off or rule.
**Change**: Word it as "Manca in .env: LABEL_MODEL, il modello che etichetta le corse", true for both callers, and update `tests/test_label_model.py:179`.

### F-7 · nit · convention · docstrings wrapped past the line length   [ADDRESSED]
**File**: `docker/coach/app/graph.py:104-108`, `docker/coach/app/graph.py:126-130`, `docker/coach/app/activities.py:2`
**Issue**: Edited docstrings leave one line far past 120 characters and a line broken after "Nessuna", unlike every other docstring in these files.
**Change**: Rewrap them to the width of the surrounding docstrings, as in `docker/coach/app/graph.py:79-82`.

## Runtime observations

Gates skipped: no gate command in CLAUDE.md (there is none; AGENTS.md names none). The full Coach suite (`docker compose run --rm coach pytest -q`) passed, 938 tests, during this pass.
