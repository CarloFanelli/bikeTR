# Task 05: training-plan-calculations

## Objective

The training plan (daily recommendation, 28-day calendar, mesocycle, monthly plan and week schedule) and the **Training v2** engine become typed functions tested against today's results, and the **Coach service**'s reference results regenerate identically from them.

## Context

**Satisfies**: REQ-3, REQ-4, REQ-5, REQ-8, REQ-9

The plan builds on the load calculations of Task 04. Training and Training v2 import each other today; that loop ends here. The Coach service's reference script runs the browser's calculations to produce the results its Python tests compare against, so it must run on the typed calculations from now on.

## Depends on

- Task 04

## Expected Behavior

- Before conversion, today's JavaScript plan results on made-up rides, settings and dates are recorded.
- The plan and Training v2 calculations are typed functions separate from the screens, with the date as an input; tests compare them with the recorded results.
- Training and Training v2 no longer import each other.
- Regenerating the Coach service's reference results runs the typed calculations and writes files identical to today's.
- Today's Training tab and Coach show the same recommendation, plans and workouts as before.

## Acceptance Criteria

- [ ] Recorded results from today's JavaScript exist for the plan and Training v2, and tests show the typed calculations match them (REQ-8)
- [ ] Training and Training v2 calculations no longer import each other, directly or through others (REQ-4)
- [ ] No plan calculation file exceeds 500 lines (REQ-5)
- [ ] Regenerating the Coach service's reference results with the typed calculations writes files identical to today's (REQ-9)
- [ ] The Coach service's Python tests pass unchanged (REQ-9)
- [ ] Today's Training tab shows the same recommendation, calendar and plans as before (REQ-3)

## Edge Cases

- A calculation depends on today's date (e.g. last-7-days load) → it receives the date as an input, so tests can fix the day (REQ-3 from the spec edge-case table)
- No activities at all → calculations return today's empty results without errors (REQ-3)
- Today's JavaScript gives a questionable number → the port keeps it; formula fixes are a separate feature (REQ-8)
- Regenerated Coach reference results differ from today's files → treated as a port bug; the switch isn't complete until they are identical (REQ-9)
- The frozen copy of the old browser Coach used by the reference script → stays as it is; the script adapts it when it runs, as it already does today (REQ-9)
- N/A — network, permission: tests use only fixed local data (REQ-8, REQ-9, REQ-10)

## Notes from implementation

- **Impacts Task 05**: `buildDateHelpers` already lives in `web/src/core/dates.ts` (with `now` as input), not in the planned `plan/dates.ts`; the rest of `training.js:442-513` can import it. `training.js` keeps thin versions with the old arguments (`resolveHr`, `buildDateHelpers`, `buildFormTrend`, `compositeFatigueScore`, `buildFtpTrend`…) that read the clock and saved data; `analysis.js` imports several of them. Two mesocycle pieces wait for `core/meso.ts`: the mesocycle summary and athlete response that `analysis.js` passes to `formInsights`, and the mesocycle's last-20 FTP points that `analysis.js`'s `recordFtpPoint` saves. `tests/reference/record.ts` and `web/tests/fixtures/` are the pattern for this task's recorded results. When `make_reference.mjs` switches to shims, the `globalThis.__profile` override must stay on `resolveHr`. /dev, 2026-11-06.
