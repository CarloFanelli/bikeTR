# Task 07: activities-search

## Objective

The athlete finds an activity in Attività by typing part of its name, together with the sport filter, in both views.

## Context

**Satisfies**: REQ-15, REQ-16, REQ-17, REQ-18

Finding one ride among 60 meant scrolling through weeks.

## Depends on

None

## Expected Behavior

- A search box above the list filters by activity name, ignoring capital letters and accents.
- It combines with the sport filter and works in card and table view; weeks without matches are hidden.
- A clear button and Escape empty it; the search starts empty and is not saved.
- With no match: "Nessuna attività con «{testo}» tra le ultime N".

## Acceptance Criteria

- [ ] Typing part of a name keeps only matching activities, ignoring capitals and accents (REQ-15)
- [ ] Search and sport filter combine in both views; the search starts empty on every visit (REQ-16)
- [ ] The clear button and Escape empty the search (REQ-17)
- [ ] With no match the message names the typed text and the number of loaded activities (REQ-18)

## Edge Cases

- "giro" against "Giro del lago" or "GIRÒ" → both match (REQ-15)
- Search plus the Bici filter → only bike rides whose name matches (REQ-16)
- Weeks with no match → hidden, as with the filter (REQ-16)
- Switching view → search text stays (REQ-16)
- Spaces only → treated as empty (REQ-17)
- Name containing «» or quotes → shown as typed, never as markup (REQ-18)
