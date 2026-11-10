# Task 04: drafts-on-screen

## Objective

On the Coach screen the athlete sees why the **Check** sent a **Draft** back and which attempt is running, and the workout card says how many drafts it took and when citations were dropped.

## Context

**Satisfies**: REQ-11, REQ-12

The browser side of tasks 01 and 02: until this task the screen keeps appending the text of every draft. The words shown are written by code, never by the model.

## Depends on

- Task 02

## Expected Behavior

- When a draft is sent back, the step line shows the reason and the attempt, e.g. "Il protocollo scelto non è ammesso oggi: il modello riprova, tentativo 2 di 3".
- The live text of the previous draft is replaced by the new draft's text.
- The card says how many drafts it took when more than one, and notes the citations dropped when that happened.
- A result from a service started before this task shows no drafts note.

## Acceptance Criteria

- [ ] A second draft clears the live text and the step line names the reason and "tentativo 2 di 3". (REQ-11)
- [ ] A card of a three-draft answer says it took 3 attempts. (REQ-12)
- [ ] A card of a one-draft answer has no attempts note. (REQ-12)
- [ ] A card whose citations were dropped says so. (REQ-12)

## Edge Cases

- Third draft passes → the card says it took 3 drafts (REQ-6, REQ-12)
- First draft passes → no attempts note (REQ-6)
- Stop during the second draft → the text of the second draft stays, as Stop keeps it today (REQ-11)
