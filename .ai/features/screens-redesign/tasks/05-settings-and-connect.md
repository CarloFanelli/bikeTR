# Task 05: settings-and-connect

## Objective

Impostazioni groups its fields in titled sections with help in Info popovers, a save bar that appears on any change and a confirmation before losing unsaved changes; Collega Strava becomes a centred welcome card.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27

Both screens come from one backlog item (Impostazioni and Collega Strava). Impostazioni already asks before leaving with unsaved changes, with the browser's plain confirm; this task gives it the save bar and an in-app dialog.

## Depends on

None

## Expected Behavior

- Impostazioni: heading, then sections Soglie, Volume, Disponibilità, Gara, Recupero, Coach, Strava.
- Field help (hints, the Ollama instructions) moves into Info popovers and panels; commands under "Dettagli tecnici".
- Any change brings up a save bar at the bottom with "Salva" and "Annulla"; it disappears after saving, cancelling, or undoing the change by hand.
- Leaving with unsaved changes opens a dialog "Esci senza salvare" / "Resta"; reload or tab close triggers the browser's leave warning.
- Collega Strava: centred card with app name, one sentence and "Collega Strava"; with credentials missing, a short numbered list of setup steps instead of the button.
- No emoji; at 360 px one column.

## Acceptance Criteria

- [ ] Fields grouped under the seven titled sections; help text in Info popovers (REQ-22, REQ-23)
- [ ] The save bar appears on any change and disappears after "Salva", "Annulla" or undoing by hand (REQ-24)
- [ ] Leaving with unsaved changes asks "Esci senza salvare" or "Resta" (REQ-25)
- [ ] Collega Strava shows app name, one sentence and the button; missing credentials show the steps instead (REQ-26, REQ-27)
- [ ] No emoji, no visible text block over 30 words, nothing shown today lost; one column at 360 px (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5)

## Edge Cases

- Labels or notes with emoji → line icon or dropped (REQ-1)
- Width 360 px with day toggles → toggles wrap to two rows (REQ-2, REQ-22)
- Error message longer than 30 words → allowed: error notices are exempt (REQ-3)
- Value shown today only under a condition (estimated FTP and LTHR, spending line) → same condition still shows it (REQ-4)
- Ollama instructions naming files and commands → plain lead; file names and commands under "Dettagli tecnici" (REQ-5)
- Section with no fields set (no race) → section shown with empty fields (REQ-22)
- Coach model check fails (Ollama off) → Coach section shows the check error, as today (REQ-22)
- Field with no help text → plain label, no popover (REQ-23)
- Help text longer than two sentences → popover gets the first two; the rest in the Info panel (REQ-23)
- Invalid value (FTP 0, letters) → field shows its error; "Salva" disabled until fixed (REQ-24)
- Saving fails (browser storage full or blocked) → error in the save bar; changes kept on screen (REQ-24)
- Change undone by hand back to the saved value → save bar disappears (REQ-24)
- Save bar covering the last field on a phone → extra space at the page bottom keeps it reachable (REQ-24)
- Athlete switches section with unsaved changes → dialog "Esci senza salvare" or "Resta" (REQ-25)
- Reload or tab close with unsaved changes → the browser's own leave-page warning (REQ-25)
- Disconnect Strava with unsaved changes → same dialog first (REQ-25)
- Strava refuses the connection or the athlete cancels → Collega Strava shows the error from Strava, as today (REQ-26)
- Auth server unreachable → error notice on the card; button stays (REQ-26)
- Only one of the two credentials missing → steps name the missing one, as today (REQ-27)
- Credentials added and page reloaded → button replaces the steps (REQ-27)

## Notes from implementation

- **Known limitation**: when the Auth server is unreachable, the app still shows its general error notice instead of the welcome card with the button. Today the session cannot tell "auth server down" from a failed Strava download (both end in the same error state), and telling them apart means changing the session start, which this presentation-only feature leaves alone. The Strava refusal case keeps showing Strava's error above the card, as before.
