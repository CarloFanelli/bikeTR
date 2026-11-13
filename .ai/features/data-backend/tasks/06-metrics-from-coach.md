# Task 06: metrics-from-coach

## Objective

The training load of every real activity and the daily fitness, fatigue and form come from the Coach service, with the same values the browser showed before; only the plan's simulated workouts keep a browser copy of the load formula, guarded by a test.

## Context

**Satisfies**: REQ-18, REQ-19, REQ-20

The formulas live today in both the browser and the Coach. Real activities move to one place; the four-week plan's simulation stays in the browser by user decision (backlog B-45).

## Depends on

03-app-reads-server

## Expected Behavior

- Home, Allenamento and Analisi show the training load, fitness, fatigue and form computed by the Coach service.
- For the same activities and athlete profile, every shown value equals what the browser computed before.
- The plan's simulated future workouts are the only place where the browser computes a load.
- A test compares the plan's copy with the Coach's formula and fails when they differ.

## Acceptance Criteria

- [ ] Home's weekly load, Allenamento and Analisi's form chart show values the Coach service computed (REQ-18)
- [ ] For a fixed set of activities and profile, each activity's load and each day's fitness, fatigue and form equal the old browser values (REQ-19)
- [ ] The browser computes load only for the plan's simulated workouts (REQ-20)
- [ ] Changing the Coach's load formula without the plan's copy makes a test fail (REQ-20)

## Edge Cases

- Activity without ride details → load from summary figures, as today (REQ-18, REQ-19)
- Profile without FTP or LTHR → the same load as the browser computed before (heart-rate or type fallback) (REQ-19)
- Run or other non-bike activity with ride details → its load comes from its details, like a ride, and may differ from the old summary-based value (REQ-19 · from code)
- Activity's type changed on Strava → its load is recomputed with the new type (REQ-7, REQ-18)
- Coach's load formula changes and the plan's copy does not → the comparison test fails (REQ-20)
- Plan simulated with no real activities → the simulation starts from zero fitness and fatigue, as today (REQ-20)

## Notes from implementation

- **REQ-18 / AC 1 — divergence**: the Coach computes each activity's load (`POST /coach/metrics`, `{profile, ids}` → `{loads}`); the browser computes the 90-day fitness, fatigue and form as the 42- and 7-day averages of those loads, by day in its own time zone, instead of reading a form computed on the server (ARCHITECTURE asked for the server form). Why: the four-week plan adds its simulated workouts to the same averages, so the real part and the simulated part must use the same arithmetic; with the Coach's loads and the browser's time zone the numbers equal the Coach's `form_trend` (its tests compare it with the same expected values), and the plan stays unchanged.
- **Known limitation**: the loads depend on FTP, LTHR and maximum heart rate, which change after saving Impostazioni or loading segments: the browser asks the Coach again then. If that request fails, the previous loads stay and a warning says so; if the Coach does not answer at opening, the app shows an error instead of computing loads itself.
- **Known limitation**: activities with ride details downloaded by the Coach now get the details-based load, while the browser before had them only for activities exported in the most detailed JSON mode: on real data those values change (more precise), as the "from code" edge case expected.
