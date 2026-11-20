---
feature: ride-tools
status: APPROVED
reviewed: 2026-11-20
head: 01b2e7d9bb87a7e347222f09ec0d859cd0f33e5c
---

# Review — ride-tools

**Scope**: 2 files (re-verification — changed since the review of `01b2e7d9`: `docker/coach/app/graph.py`, `docker/coach/tests/test_ride_tools.py`; 1 addressed finding checked). Gates skipped: no gate command in CLAUDE.md (there is no CLAUDE.md); the full Coach suite ran green, 1224 tests.
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · nit · simplify · ride history rebuilt for every draft   [ADDRESSED]
**File**: `docker/coach/app/graph.py:319`
**Issue**: The draft node builds the ride history (a database read of the saved series plus the weekly and daily sums) before the first turn of every draft, even when the model never calls a Ride tool, so a Coach request with three drafts builds the same history three times.
**Change**: Build it on the first Ride tool call of the draft, inside the `ride_calls` branch at line 332, so a draft without calls reads nothing.
