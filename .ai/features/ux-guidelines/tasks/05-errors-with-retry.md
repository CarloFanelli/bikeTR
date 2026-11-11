# Task 05: errors-with-retry

## Objective

Every error tells the athlete in plain words what failed, keeps the technical message one click away, and lets a failed download from Strava be tried again.

## Context

**Satisfies**: REQ-8, REQ-9

Today errors show raw technical text and no way out; the athlete has to reload the page.

## Depends on

None

## Expected Behavior

- Every error notice opens with one plain sentence saying what failed and what still works.
- The technical message sits under a closed "Dettagli tecnici"; without one, nothing is shown there.
- Failed initial load, streams download, segment download and export carry a "Riprova" button that restarts that same download.
- Calculation errors (advice, plan) get the plain sentence and details but no "Riprova".

## Acceptance Criteria

- [ ] Every error notice shows one plain sentence first, technical text under a closed "Dettagli tecnici" (REQ-8)
- [ ] Initial load, streams, segments and export errors carry "Riprova" restarting that download (REQ-9)
- [ ] A second "Riprova" press while the retry runs does nothing (REQ-9)
- [ ] Advice and plan errors show no "Riprova" (REQ-8, REQ-9)

## Edge Cases

- Error without technical text → no "Dettagli tecnici" (REQ-8)
- Long technical message → wraps inside the notice, no sideways scroll (REQ-8)
- "Riprova" pressed twice → the second press does nothing while the retry runs (REQ-9)
- Retry fails again → the same notice returns, with "Riprova" (REQ-9)
- Strava disconnected during a retry → the "Collega Strava" screen, as today (REQ-9)
- Calculation errors (advice, plan) → plain sentence and "Dettagli tecnici", no "Riprova" (REQ-8, REQ-9)
- Activity detail fails to download → plain sentence, "Dettagli tecnici" and "Riprova" downloading it again (REQ-9 · from code)
