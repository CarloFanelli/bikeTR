---
feature: ride-shape-labels
status: APPROVED
reviewed: 2026-11-20
head: 01b2e7d9bb87a7e347222f09ec0d859cd0f33e5c
---

# Review — ride-shape-labels

**Scope**: 22 files (primary — diff since base `a4cadab`; 11 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · nit · convention · ride shape docstring omits the load per hour   [ADDRESSED]
**File**: `docker/coach/app/ride_shape.py:1-3`
**Issue**: The module docstring lists blocks, recoveries and minutes per zone, but not the load per hour, which is the one figure the Label rule now reads.
**Change**: Add the load per hour from heart rate to the first sentence of the docstring, as `ride_shape()`'s own docstring at line 79 already does.

### F-2 · nit · convention · labels docstring wrapped unevenly   [ADDRESSED]
**File**: `docker/coach/app/labels.py:2-5`
**Issue**: The inserted clause leaves line 3 at 120 characters and line 4 at half width, unlike the rest of the docstring.
**Change**: Rewrap lines 2–5 of the docstring to the width of the surrounding lines.

### F-3 · nit · convention · glossary still says repeated blocks make ripetute   [ADDRESSED]
**File**: `.ai/memory/coach.md:120`
**Issue**: The Hard block term says two or more blocks of similar length make a ride ripetute, which the agreed change in task 04 replaced with the load per hour.
**Change**: Drop that sentence from Hard block and say in Ride shape that it carries the load per hour the Label rule reads.
**Why**: Task 04 notes, REQ-6 / REQ-7 divergence agreed on 2026-11-20.

## Runtime observations

- Gates skipped: no gate command in CLAUDE.md (there is no CLAUDE.md). The full Coach suite ran during /dev task 04: 1088 passed.
