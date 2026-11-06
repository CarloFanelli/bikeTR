# Task 12: switch-to-new-app

## Objective

The new app becomes BikeTR at http://localhost:5050: today's JavaScript app is removed, old activity-page links open the detail inside the app, the checks cover all the code, and the README and PROCESS.md describe the new app.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-4, REQ-5, REQ-7, REQ-11, REQ-16, REQ-22, REQ-25, REQ-26

Every section exists in the new app after Task 11, so the old one can go. Saved browser data and the Strava connection carry over untouched because the address stays the same. The structure checks, which skipped the old JavaScript until now, cover everything from here on.

## Depends on

- Task 02
- Task 07
- Task 08
- Task 09
- Task 10
- Task 11

## Expected Behavior

- http://localhost:5050 opens the new app; saved data and the Strava connection are kept.
- Old `activity.html?id=…` addresses open that activity's detail inside the app.
- No hand-written JavaScript remains outside the paper-index builder and the Coach reference tools; third-party libraries are unaffected.
- The type check, import-loop check and 500-line check pass over all the code.
- With the same data and settings, every screen shows the same information and values as today's app did.
- The README's feature list matches the sidebar, describes **Training v2** as the engine behind the plan and the Coach, and gives the new commands; PROCESS.md records the move.

## Acceptance Criteria

- [ ] http://localhost:5050 opens the new app, with saved data and the Strava connection kept (REQ-25)
- [ ] Old `activity.html?id=…` addresses open that activity's detail inside the app (REQ-16)
- [ ] No hand-written JavaScript remains outside the paper-index builder and the Coach reference tools (REQ-1)
- [ ] Type check, import-loop and 500-line checks pass over all the code, and the root keeps only documentation, configuration and data (REQ-2, REQ-4, REQ-5, REQ-7)
- [ ] Every screen shows the same information and values as today's app with the same data (REQ-11)
- [ ] The README's feature list matches the sidebar and describes Training v2 as an engine, not a tab (REQ-22)
- [ ] PROCESS.md records the move to Vue, TypeScript and a build step, pointing back to the reversed entry (REQ-26)

## Edge Cases

- A third-party library ships as JavaScript (e.g. the map library) → allowed: the rule covers only code written for BikeTR (REQ-1 from the spec edge-case table)
- Old address `activity.html?id=…` (bookmark or open tab) → opens that activity's detail inside the app (REQ-16)
- A tab of the old version still open after the switch → both read and write the same data formats; nothing is corrupted (REQ-25)
- Files move to new folders → every command in the README still works as written (REQ-7)
- N/A — all axes: documentation, checked by reading (REQ-22, REQ-26)
- A Strava connection that is denied, expired, rejected or unreachable → the new app shows today's message for it (REQ-12 · from code)

## Notes from implementation

- **Impacts Task 12**: `build_papers_index.mjs` still sits at the project root, which must keep only documentation, configuration and data files; the plan does not say where it goes. Move it to its own folder (writing `papers_index.json` at the root as today) and update the references. /dev, 2026-11-06.
- **Impacts Task 12**: `web/tests/reference/record.ts` (with `record-plan.ts`) records results by calling today's `strava.js`, `training.js`, `analysis.js`, `predictions.js` and `training_v2.js`. When those files go, retire both (the recorded files in `web/tests/fixtures/` stay as the reference the tests compare with; `plan-inputs.ts` stays, the tests use it) and update README §10, which shows how to run it. The Coach reference script no longer reads `web/*.js`, only `web/src/`. /dev, 2026-11-06.
