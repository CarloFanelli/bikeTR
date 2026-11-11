# Task 04: filter-and-weeks

## Objective

Attività can be filtered by sport with chips, and its list is split into weeks, each headed by that week's totals.

## Context

**Satisfies**: REQ-14, REQ-15

Both work the same in card and table view, so they come after the two views exist.

## Depends on

Task 03

## Expected Behavior

- Chips Tutte, Bici, Corsa and Altro above the list; Tutte selected when Attività opens.
- The filter applies to both views and stays when switching view.
- The list is grouped by week, Monday to Sunday, most recent week first.
- Each week header shows its dates and the shown activities' total distance, moving time and climbing.

## Acceptance Criteria

- [ ] Chips filter both views; Tutte is selected on opening and the filter survives a view switch (REQ-14)
- [ ] Bike variants count as Bici, runs as Corsa, everything else as Altro (REQ-14)
- [ ] Activities are grouped in Monday–Sunday weeks, each with dates and totals of the shown activities (REQ-15)

## Edge Cases

- Filter with no matches → "Nessuna attività di questo tipo tra le ultime 60" (REQ-14)
- Bike variants (virtual, gravel, MTB, e-bike) → counted under Bici (REQ-14)
- Walks, swims, strength, other sports → counted under Altro (REQ-14)
- Switching view → filter stays as chosen (REQ-14)
- Week with no activity after filtering → week hidden (REQ-15)
- Current week → header shows dates up to today and totals so far (REQ-15)
- Activity near midnight → week from the activity's local date, as the rest of the app (REQ-15)
