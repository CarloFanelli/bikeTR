# Task 01: rounder-corners

## Objective

Every screen has rounder corners: 16 px on cards, panels, dialogs and popovers, 12 px on buttons, fields, chips and toggles.

## Context

**Satisfies**: REQ-1

The corner change is app-wide and touches no layout, so it comes first and every later task is built on the new shape.

## Depends on

None

## Expected Behavior

- Cards, expansion panels, alerts, dialogs, the Info popover and the Info panel show 16 px corners.
- Buttons, text fields, selects, chips and toggle groups show 12 px corners.
- Content inside a card (tables, maps, images) is clipped to the card's corners.
- Both themes look the same apart from colours.

## Acceptance Criteria

- [ ] Cards, panels, alerts, dialogs, Info popover and Info panel have 16 px corners in both themes (REQ-1)
- [ ] Buttons, fields, chips and toggle groups have 12 px corners in both themes (REQ-1)
- [ ] A table or map inside a card does not poke out of its rounded corners (REQ-1)

## Edge Cases

- Table or image inside a card → clipped to the card's rounded corners (REQ-1)
- Info panel full screen on a phone → square corners: it fills the screen (REQ-1)
