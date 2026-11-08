# Task 07: minimum-duration

## Objective

The Coach takes workouts of 30 to 240 minutes: the Coach service refuses any other duration in Italian, and the Coach screen opens on a duration the service accepts.

## Context

**Satisfies**: REQ-28, REQ-29, REQ-30

The selection rules already cover 30–240 minutes (Task 02), but the app still sends and accepts 20–29 minutes, which no rule test covers. This task lands before the prompt rewrite, so the app never follows the new rules with a duration they were not tested for.

## Depends on

None

## Expected Behavior

- The Coach service refuses a duration below 30 or above 240 minutes with "La durata deve essere tra 30 e 240 minuti", before any paper search or model call.
- A missing or not-whole duration is still refused with "La durata deve essere un numero intero di minuti".
- The Coach screen's duration field steps by 5 from 30 to 240; a typed value outside that range is sent, and the service's refusal appears in the error card.
- The Coach screen opens with the saved duration, raised to 30 when lower and lowered to 240 when higher; with nothing saved, 0, or a value that is not a number, it opens at 60.
- The live check and the evaluation set are unchanged.

## Acceptance Criteria

- [ ] 29 and 241 minutes are refused with "La durata deve essere tra 30 e 240 minuti"; 30 and 240 are accepted (REQ-28)
- [ ] A refused duration downloads no rides and calls no paper search or model, so nothing is spent (REQ-28)
- [ ] The duration field's arrows stop at 30 and 240, moving 5 minutes per click (REQ-29)
- [ ] A typed 25 shows the service's refusal in the error card (REQ-29)
- [ ] A saved 20 opens at 30, 45 at 45, 300 at 240; nothing saved opens at 60 (REQ-30)

## Edge Cases

- 29 or 241 minutes → refused with "La durata deve essere tra 30 e 240 minuti" before any paper search or model call, so nothing is spent (REQ-28)
- 30 or 240 minutes → accepted (REQ-28)
- A tab opened before the update sends 20 → refused with the same message; reloading the page brings the new field (REQ-28)
- Duration missing, or not a whole number (45.5) → refused with "La durata deve essere un numero intero di minuti", as today (REQ-28)
- The live check and the evaluation set → already use 45–90 and 30–240 minutes; unchanged (REQ-28)
- Arrows on the field at 30 or 240 → stop there; each click moves 5 minutes (REQ-29)
- Rider types 25 → the refusal appears in the error card; the field keeps 25 until changed (REQ-29)
- Field left empty → sends 60, as today (REQ-29)
- Saved 20 or 29 → opens at 30 (REQ-30)
- Saved 30 or 45 → opens as saved (REQ-30)
- Saved 300 (typed before this change) → opens at 240 (REQ-30)
- Nothing saved, 0, or a saved value that is not a number → opens at 60 (REQ-30)
