---
feature: reliable-ride-labels
status: APPROVED
reviewed: 2026-11-19
head: 9750ee8ef73612df2f51a9416e80ec0a05846def
---

# Review — reliable-ride-labels

**Scope**: re-verification — 3 files changed since the review of `9750ee8e` (`docker/coach/app/labeled_rides.py`, `docker/coach/tests/test_labeled_rides.py`, `eval-runs/README.md`), 2 addressed findings to check; nothing is committed since base, so the delta is read from the two findings' fixes; 6 workflow artifacts under `.ai/` excluded
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · should-fix · bug · Tuning set record trusted without checking it   [ADDRESSED]
**File**: `docker/coach/app/labeled_rides.py:128`
**Issue**: The Check set draft uses the Tuning set ids in `labeled-rides-sources.json` as they are, and every Tuning set draft overwrites them, so drafting the Tuning set again (without moving it into place) makes the record name rides that are not in `labeled_rides.json`, and the Check set can then repeat Tuning set rides.
**Change**: Before excluding, check the recorded ids against the Tuning set file ride by ride with `matches` (as `tuning_ids` does with today's picks), rebuilding them with `tuning_ids` when they disagree and raising `Overlap` when neither matches.
**Why**: REQ-2 and its edge cases: the Check set shares no ride with the Tuning set, and the record must name the Tuning set's rides.

### F-2 · nit · convention · Results README misses the allowed list with labels on   [ADDRESSED]
**File**: `eval-runs/README.md:43`
**Issue**: "Rules followed" says the answer's protocol is checked against the situation's allowed list, but with ride labels on a situation with `withLabels` is graded on that list instead (`docker/coach/app/grading.py`, `allowed_for`).
**Change**: Add that, with `COACH_RIDE_LABELS` on, a situation that has `withLabels` uses its allowed list.

## Runtime observations

Gates skipped: no gate command in CLAUDE.md (there is none; AGENTS.md names none). The full Coach suite (`docker compose run --rm coach pytest -q`) passed during this pass, 1054 tests.
