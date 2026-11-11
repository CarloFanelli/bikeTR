# Task 06: loading-placeholders

## Objective

While the app loads its data, Home, Allenamento, Analisi and Attività show grey placeholders shaped like their cards instead of a loading sentence.

## Context

**Satisfies**: REQ-17

Placeholders mirror the final layout, so they come after the columns and the new Attività and Home shapes.

## Depends on

Task 02, Task 03, Task 05

## Expected Behavior

- During the initial data load, the screen in the address shows grey card shapes in its column layout.
- When the data arrives the real cards replace them without the page jumping.
- Other screens keep a simple loading line.

## Acceptance Criteria

- [ ] Home, Allenamento, Analisi and Attività show card-shaped placeholders while data loads (REQ-17)
- [ ] The placeholders use the same columns and widths as the loaded screen (REQ-17)
- [ ] No "Carico i dati da Strava…" sentence on those four screens (REQ-17)

## Edge Cases

- Loading fails → placeholders replaced by the error notice (REQ-17)
- Data already available → cards shown at once, no placeholder flash (REQ-17)
