# Task 07: mesocycle-on-open

## Objective

Opening Allenamento saves the current mesocycle week, so the plan and its banner show the block's real week instead of always week 1.

## Context

**Satisfies**: REQ-22

Today the mesocycle is saved only on the first opening and at the end of a block (backlog B-21). It is now athlete data on the server, so this task builds on task 05.

## Depends on

05-athlete-data-server

## Expected Behavior

- Each opening of Allenamento saves the mesocycle with the current week.
- The plan and its banner show the week of the block that matches today.

## Acceptance Criteria

- [ ] Opening Allenamento in the second week of a block shows "settimana 2" in the plan and its banner (REQ-22)
- [ ] The saved mesocycle on the server holds the current week after Allenamento opens (REQ-22)
- [ ] Opening Allenamento twice on the same day saves the same week (REQ-22)

## Edge Cases

None in the spec.

## Notes from implementation

- **Known limitation**: the mesocycle is brought to today's week both when the app opens and when Allenamento opens (an app left open across the end of a week); each time it is saved only if the week or the block changed, so two openings on the same day save nothing the second time. The recorded plan expectations kept the old "saved only at a new block" state; the tests now check that after an opening the saved mesocycle is today's.
