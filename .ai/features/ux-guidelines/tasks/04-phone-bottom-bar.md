# Task 04: phone-bottom-bar

## Objective

On a phone the five main sections are always one tap away in a **Bottom bar**, and Libreria moves into the account menu.

## Context

**Satisfies**: REQ-6, REQ-7

Today phones hide every section behind a menu button; hidden menus are used much less, and Material Design puts 3–5 destinations in a bottom bar.

## Depends on

None

## Expected Behavior

- Below 768 px, a Bottom bar shows Home, Allenamento, Analisi, Attività and Coach AI with icon and name; the open section is lit in its colour.
- Below 768 px, the top bar shows the brand and the account menu, no menu button; the account menu lists Libreria above Impostazioni.
- From 768 px, the top bar keeps its six sections and no Bottom bar shows.
- Pages leave room for the Bottom bar: the last card is fully visible.

## Acceptance Criteria

- [ ] Below 768 px the Bottom bar shows the five sections with icon and name, items at least 48 × 48 px (REQ-6)
- [ ] The open section is lit; the activity detail lights Attività (REQ-6)
- [ ] Below 768 px the top bar has no menu button and the account menu offers Libreria above Impostazioni (REQ-7)
- [ ] At 768 px and wider nothing changes from today (REQ-6, REQ-7)

## Edge Cases

- Width exactly 768 px → top-bar sections, no Bottom bar (REQ-6)
- Phone keyboard open (search, Coach duration) → Bottom bar may hide; content stays reachable (REQ-6)
- Bottom bar over content → pages leave room; the last card is fully visible (REQ-6)
- Activity detail open → "Attività" lit (REQ-6)
- Impostazioni or Libreria open → no Bottom bar item lit (REQ-6, REQ-7)
- Not connected to Strava, or loading → no Bottom bar, as with the top bar today (REQ-6)
