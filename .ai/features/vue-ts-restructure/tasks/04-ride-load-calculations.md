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
