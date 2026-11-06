# Task 04: ride-load-calculations

## Objective

The ride and load calculations (normalized power, training load, fitness, fatigue and form, power curve, heart-rate zones, power profile, FTP and threshold heart-rate estimates and trend, segment predictions) become typed functions tested against today's results, and today's screens use them.

## Context

**Satisfies**: REQ-1, REQ-3, REQ-4, REQ-5, REQ-8

The numbers are what the restructuring must not change. Today's results are recorded from the current JavaScript before anything is converted, then each typed calculation must reproduce them. Today's screens switch to the new calculations, so any drift shows in the app as well as in the tests.

## Depends on

- Task 03

## Expected Behavior

- Before conversion, today's JavaScript runs on made-up rides and settings, and its results are recorded.
- Each calculation is a typed function separate from the screens: it reads no page, no saved browser data and no clock.
- Calculations that depend on today's date receive it as an input.
- Tests compare every calculation with the recorded results, after the rounding the app displays.
- Today's Home and Analysis screens show the same values as before.

## Acceptance Criteria

- [ ] Before conversion, today's JavaScript results on made-up rides and settings are recorded (REQ-8)
- [ ] Tests show each converted calculation returns the recorded results, compared after display rounding (REQ-8)
- [ ] The calculations run in tests without a browser, a page or saved browser data (REQ-3)
- [ ] Calculations that depend on today's date receive it as an input (REQ-3)
- [ ] No calculation file imports one that imports it back, and none exceeds 500 lines (REQ-4, REQ-5)
- [ ] Today's Home and Analysis screens show the same values as before the conversion (REQ-3, REQ-1)

## Edge Cases

- A calculation depends on today's date (e.g. last-7-days load) → it receives the date as an input, so tests can fix the day (REQ-3 from the spec edge-case table)
- No activities at all → calculations return today's empty results (fitness 0, empty power curve) without errors (REQ-3)
- Rides with power only, heart rate only, or neither; runs, hikes, strength sessions; FTP and heart-rate settings empty → each case has recorded results and a matching test (REQ-8)
- No rides at all → the recorded empty results match (REQ-8)
- TypeScript and recorded results differ only in the last decimals → compared after the rounding the app displays (REQ-8)
- Today's JavaScript gives a questionable number → the port keeps it; formula fixes are a separate feature (REQ-8)
- N/A — network, permission: tests use only fixed local data (REQ-8, REQ-9, REQ-10)

## Notes from implementation

- **Design — where the types live**: the Strava data shapes (activity, segment, effort, streams) and the stream metrics moved from `web/src/data/strava-types.ts` to `web/src/core/strava-types.ts`. Calculations may import only other calculation files, and they take activities as input; the data layer now imports these types from `src/core/`. /dev, 2026-11-06.
- **Design — inputs of the calculations**: every function in `web/src/core/` that depends on the day gets `now` as its last argument (a `Date`, never changed). FTP and threshold values come in as a profile from `resolveHr(settings, activities, segmentEstimates, now)`, and segment estimates come from `estimatesFromSegments(segmentCache, now)`. FTP history comes in as a list, and `nextFtpHistory` returns the list to save, or nothing when there is nothing to add. The form observations (`formInsights`) receive the mesocycle in progress and the athlete's response to the block as inputs, because both still come from the training plan code. /dev, 2026-11-06.
- **Design — the old names stay**: `training.js`, `analysis.js` and `predictions.js` keep exporting every old name with its old arguments. Each is a thin version that reads the clock and saved data and calls `src/core/`. `tests/reference/record.ts` recorded the results through these names before the move; recording again after the move gave an identical file, which shows today's screens get the same numbers. The Coach reference generator still replaces the profile in `training.js`'s `resolveHr`, whose first line is unchanged. /dev, 2026-11-06.
