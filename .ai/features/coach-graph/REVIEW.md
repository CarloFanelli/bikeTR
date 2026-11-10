---
feature: coach-graph
status: DRAFT
reviewed: 2026-11-10
head: 018cc1ebcc73c4d40ed499a23b68b8e4cfbc6551
---

# Review — coach-graph

**Scope**: 33 files (primary — diff since base `5f8edc05`; 12 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 3 should-fix · 7 nit

## Findings

### F-1 · should-fix · bug · old fallback answer without a cause crashes grading   [ADDRESSED]
**File**: `docker/coach/app/grading.py:97`
**Issue**: For a results file without `fallbackCause`, `fallback_cause` takes `usable(...).causes[0]`; if today's catalog or minimum minutes accept an answer the old code sent to the fallback, `causes` is empty and `grade()` raises `IndexError`, so the whole file cannot be graded.
**Change**: Return `None` (or count it under an "unknown" key) when `usable` gives no cause, and keep it out of `fallback_causes` without crashing.
**Why**: The grading docstring promises that old files are re-graded against today's set without running them again.

### F-2 · should-fix · convention · Stop during a later draft is untested   [ADDRESSED]
**File**: `docker/coach/tests/test_cancel.py`
**Issue**: Every cancellation test stops the first draft; nothing checks that Stop during the second draft closes the model connection and charges the drafts a cloud provider already accepted.
**Change**: Add a case beside `test_closing_one_of_two_requests_stops_only_that_one` where the first answer is sent back (e.g. an unreadable plan) and the request is stopped during the second, asserting the closed connection and the spending total of both drafts.
**Why**: SPEC edge case "Stop pressed during the second draft" (REQ-13).

### F-3 · should-fix · convention · PROCESS.md says the live check enters at papers   [ADDRESSED]
**File**: `PROCESS.md:401`
**Issue**: The decision says "the evaluation set and the live check enter at papers", but the live check calls `graph.run` (`docker/coach/app/live_check.py:146`) and enters at rides with its made-up rides, as decided at planning.
**Change**: Write that the evaluation set enters at papers, while the Coach screen and the live check enter at rides.

### F-4 · nit · convention · README diagram omits the spending-cap exit   [ADDRESSED]
**File**: `README.md:158`
**Issue**: The diagram's loop says "no, and fewer than 3 drafts ──► back to 4", but `after_check` (`docker/coach/app/graph.py:148`) also stops when a cloud model's spending total reaches the limit, as README.md:171 states.
**Change**: Add "and under the spending limit" to the loop line.

### F-5 · nit · convention · README still calls the narrower prompt the next step   [ADDRESSED]
**File**: `README.md:196`
**Issue**: The analysis of the old runs ends "so the next step is to show the model only those and let it choose and explain", which is now done.
**Change**: Say the Coach now shows the model only those workouts, as described in the Decisions above.

### F-6 · nit · dup · deliver re-runs the check the check node already ran   [ADDRESSED]
**File**: `docker/coach/app/workout.py:141-142`
**Issue**: `decide` calls `read_draft` and `check_draft` on the last draft again, though `check_node` (`docker/coach/app/graph.py:136-137`) stored the same `protocolId` and `verdict`; the delivered decision and the recorded check agree only because the same call runs twice.
**Change**: Let `deliver_node` pass the stored verdict and choice to `decide`, keeping the recompute only when none is given (the direct callers in `tests/test_workout.py`).

### F-7 · nit · convention · check import out of alphabetical order   [ADDRESSED]
**File**: `docker/coach/app/grading.py:28`
**Issue**: `from app.check import …` sits after `app.selection_rules`, while the other `app.` imports of the block are alphabetical.
**Change**: Move it above `from app.jscompat import js_round`, as in `docker/coach/app/workout.py:10-16`.

### F-8 · nit · convention · continuation lines misaligned after the rename   [ADDRESSED]
**File**: `docker/coach/app/main.py:142-143`
**Issue**: After `workout.run(` became `graph.run(`, the continuation lines kept the old indentation and sit two columns past the opening parenthesis.
**Change**: Align `embed=…` and `spending=…` with the parenthesis, like the other calls in `main.py`.

### F-9 · nit · convention · tracing docstring line too long   [ADDRESSED]
**File**: `docker/coach/app/tracing.py:3`
**Issue**: The rewritten module docstring line is 149 characters, while the module wraps prose near 100.
**Change**: Rewrap the docstring.

### F-10 · nit · convention · card header comment too long   [ADDRESSED]
**File**: `web/src/components/CoachWorkoutCard.vue:2`
**Issue**: The header comment's first line grew to about 145 characters; the rest of the comment wraps near 100.
**Change**: Rewrap the three comment lines.

## Runtime observations

- Gates skipped: no gate command in CLAUDE.md (there is no CLAUDE.md). The coach suite (761 tests) and the web `npm run check` were green at the end of `/dev`.
