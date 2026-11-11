---
feature: design-refresh
status: APPROVED
reviewed: 2026-11-11
head: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Review — design-refresh

**Scope**: 6 files (re-verification: the four files the fixes changed and their two test files; nothing was committed since the previous review, so git cannot isolate the delta from the 70-file diff since base `92c9a49e`; 27 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · nit · bug · week tile change can read "−0.0 km"   [ADDRESSED]
**File**: `web/src/core/home.ts:150-153`
**Issue**: The sign comes from the unrounded difference, so a week 30 m shorter than last week shows "−0.0 km", and an hours difference under a minute shows "−0h 00m".
**Change**: Round the difference first, to one decimal for km and to whole minutes for time, then take the sign from the rounded value, and add the case to `web/tests/core/home.test.ts`.

### F-2 · nit · bug · one-day week header repeats the date   [ADDRESSED]
**File**: `web/src/core/activity-view.ts:59`
**Issue**: On a Monday, the current week's header reads "10 nov – 10 nov", because the end date is today and equals the Monday.
**Change**: Show a single date when the Monday and the end date fall on the same day, and add the case to `web/tests/core/activity-view.test.ts`.

### F-3 · nit · dup · the mini map decodes the route a second time   [ADDRESSED]
**File**: `web/src/components/MiniMap.vue:15-22`
**Issue**: `ActivitiesScreen.vue:27-35` already decodes each route, with a try/catch and the two-point rule, into `row.points`, and MiniMap decodes the same string again with its own try/catch.
**Change**: Pass `row.points` to MiniMap as a `LatLng[] | null` prop and have it call `routePath` directly, dropping its decode and try/catch.
