# Task 05: home-week-tiles

## Objective

Home opens with three tiles — kilometres, hours and load this week — each showing its change versus the same days of last week.

## Context

**Satisfies**: REQ-16

Independent of Attività; it sits on Home's new column layout.

## Depends on

Task 02

## Expected Behavior

- Three tiles at the top of Home: kilometres, hours, load, from Monday to today.
- Each tile shows the change versus last week from Monday to the same weekday.
- Load is computed the same way as everywhere else in the app.

## Acceptance Criteria

- [ ] Home shows kilometres, hours and load from this Monday to today (REQ-16)
- [ ] Each tile shows its change versus the same days of last week, with a sign (REQ-16)
- [ ] Load matches the app's per-activity load used by the charts (REQ-16)

## Edge Cases

- No activity this week → tiles show 0 with the change versus last week (REQ-16)
- Nothing in the same days last week → change shown as "+N", no percentage (REQ-16)
- Rides without power or heart rate → load computed as elsewhere in the app (REQ-16)
