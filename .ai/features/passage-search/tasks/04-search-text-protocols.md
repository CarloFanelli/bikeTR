# Task 04: search-text-protocols

## Objective

The search text also names the protocols the selection rules allow today, so the search looks for evidence about the options the athlete actually has.

## Context

**Satisfies**: REQ-7

In the trial, adding the allowed protocols' names raised the **Search score** from 11 to 14 of 20. The **Selection rules** already give the allowed protocols in code for the **Fallback rules**; the search reuses them on the Coach screen, in the **Live check**, in the evaluation and in the search-only run.

## Depends on

- Task 02

## Expected Behavior

- The search text keeps today's description of form, hard share and minutes, and adds the names of the protocols the selection rules allow for that form, hard share and minutes.
- The Coach screen, the live check, the evaluation and the search-only run all build the search text this way.

## Acceptance Criteria

- [ ] The search text holds today's description plus the name of every protocol the selection rules allow for that request (REQ-7)
- [ ] With the hard share unknown, the hard-share words are left out and the allowed protocols are still named (REQ-7)
- [ ] The live check, the evaluation and the search-only run build the search text the same way as the Coach screen (REQ-7)

## Edge Cases

- The rules allow only rest → the search text names rest; the search runs as usual (REQ-7)
- Hard share unknown → the hard-share words are left out, as today; the allowed protocols are still named (REQ-7)
- Live check and evaluation → the search text is built the same way from the made-up situation (REQ-7)
