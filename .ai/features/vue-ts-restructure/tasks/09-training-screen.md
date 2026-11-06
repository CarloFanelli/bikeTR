# Task 09: training-screen

## Objective

In the new app, Allenamento shows today's recommendation, the 28-day calendar where each day is marked skip, rainy or normal, the monthly plan and the week schedule, and a training-load chart that shows exact values on hover.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-16, REQ-19

The training-load chart is the first interactive chart; Analisi (Task 10) reuses the same hover behavior. The 28-day calendar has no ready-made counterpart in the component library and is built from its basic pieces.

## Depends on

- Task 05
- Task 06

## Expected Behavior

- The recommendation, calendar, monthly plan (with the **Training v2** workouts) and week schedule show the same content and values as today's Training tab.
- Clicking a calendar day cycles skip, rainy and normal as today; today's app sees the same marks.
- Hovering the training-load chart shows the exact date and values of the nearest point.
- Links to activities open their detail inside the app.

## Acceptance Criteria

- [ ] The recommendation, calendar, monthly plan and week schedule match today's Training tab (REQ-11)
- [ ] Marking a day skip, rainy or normal works as today, and today's app shows the same marks (REQ-12)
- [ ] Hovering the training-load chart shows the exact date and values under the pointer (REQ-19)
- [ ] Links to activities open their detail inside the app (REQ-16)

## Edge Cases

- Values shown rounded (TSS, IF, W/kg) → same rounding as today (REQ-11 from the spec edge-case table)
- A screen needs a piece the library lacks (e.g. the 28-day calendar) → built from the library's basic pieces with the same colors and spacing (REQ-18)
- Pointer between two points → values of the nearest point (REQ-19)
- Chart with a single point → that point's values on hover (REQ-19)
- N/A — network, concurrent: charts draw data already loaded (REQ-19)

## Notes from implementation

- **Impacts Task 09**: the Training calculations are in `web/src/core/plan/` (recommendation, load chart days, model, week and 4-week plan), `web/src/core/meso.ts` and `web/src/core/training-v2.ts`; they take a `PlanInputs` value (`plan/inputs.ts`) built from the clock and `web/src/data/storage.ts` (segment cache, FTP history, `loadMesocycle`, `loadRainyDays`). Before computing anything, the screen updates the mesocycle with `nextMesocycle` and saves it only when it says so, as `initMesocycle` does today. Show the recommendation's text as plain text (it can contain an activity name), and catch the error `recommend` throws on an FTP plateau without a power deficit, or the screen stops drawing as today's tab does. /dev, 2026-11-06.
