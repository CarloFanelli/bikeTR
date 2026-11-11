# Task 03: focus-motion-details

## Objective

Keyboard users always see where they are, animations stop when the system asks for reduced motion, numbers no longer shift as digits change, and every explaining label is recognisable by a small "i".

## Context

**Satisfies**: REQ-4, REQ-5, REQ-13, REQ-14

Four app-wide details, each a rule from WCAG or common typography practice, applied once for every screen.

## Depends on

None

## Expected Behavior

- Every focusable control shows a 2 px ring while focused from the keyboard; a mouse click shows none.
- With reduced motion on in the system, the Info panel, menus, placeholders and page changes appear without animation.
- Numbers in tiles, tables, week totals and chart summaries line up: digits have the same width.
- Each explaining label ends with a small circled "i" on the same line as its last word, inside the same control.

## Acceptance Criteria

- [ ] Keyboard focus shows a 2 px ring with at least 3:1 contrast on every focusable control (REQ-4)
- [ ] With reduced motion on, panels, menus, placeholders and page changes do not animate (REQ-5)
- [ ] Numbers across the app use fixed-width digits (REQ-13)
- [ ] Every explaining label shows a circled "i" inside the same clickable control (REQ-14)

## Edge Cases

- Focus on a section-coloured badge or button → the ring stays visible: it is drawn outside the control (REQ-4)
- Mouse click → no ring; it shows only for keyboard focus (REQ-4)
- Focus inside the Info panel → the ring shows there too (REQ-4)
- Reduced motion changed while the app is open → applies at once, no reload (REQ-5)
- Placeholders under reduced motion → shown without shimmer (REQ-5)
- Label inside a sentence → the "i" stays on the line of the label's last word (REQ-14)
- "Dettagli" that opens the Info panel directly → gets the "i" too (REQ-14)
