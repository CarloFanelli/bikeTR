# Task 03: activities-two-views

## Objective

Attività lists all loaded activities and switches between a card view, each card with a large street map, and a table view, each row with a **Mini map**; the last view chosen is remembered.

## Context

**Satisfies**: REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13

The two views are the core of the user's request. Filtering and weekly groups build on them in the next task.

## Depends on

Task 01

## Expected Behavior

- Attività lists every activity in the browser, up to the last 60, most recent first.
- A switch above the list chooses card view or table view; the choice survives a reload, card view the first time.
- Table rows: mini map (route line only, no tiles), sport icon, name, date, distance, moving time, climbing.
- Cards: large street map with the route, then sport icon, name, date, distance, moving time, climbing.
- A card's street map starts loading only when the card first scrolls into view.
- Clicking, tapping or pressing Enter on a row or card opens the activity detail.

## Acceptance Criteria

- [ ] All loaded activities (up to 60) show, most recent first, in both views (REQ-6)
- [ ] The switch flips between card and table view; after a reload the last choice opens, card view by default (REQ-7, REQ-8)
- [ ] Table rows show the mini map as a route line without tiles, plus icon, name, date, distance, time, climbing (REQ-9, REQ-10)
- [ ] Cards show a street map with the route and the same details; maps load only when the card enters the screen (REQ-11, REQ-12)
- [ ] Rows and cards open the activity detail by click, tap or Enter (REQ-13)

## Edge Cases

- No activities at all → "Nessuna attività" message, switch and chips hidden (REQ-6)
- Fewer than 60 activities → lists those there are (REQ-6)
- Saved view unreadable or unknown → card view (REQ-8)
- Browser storage blocked → choice lasts for the visit; card view after reload (REQ-8)
- Theme and Analisi tab already saved → saving the view keeps them (REQ-8)
- Activity with no distance (strength, yoga) → distance shown as "—"; time shown (REQ-9)
- Activity with no climbing → climbing shown as "—" (REQ-9)
- Very long activity name → wraps; row grows, no sideways scroll (REQ-9)
- Activity without GPS (indoor, strength) → sport icon in place of the mini map (REQ-10)
- Route unreadable or a single point → sport icon in place of the mini map (REQ-10)
- Card activity without GPS → sport icon panel the map's size in place of the map (REQ-11)
- Map tiles fail (offline, server down) → route line still drawn on an empty background (REQ-11)
- Fast scroll through 60 cards → only cards that entered the screen load maps; loaded maps stay (REQ-12)
- Card scrolled away before its map loads → map finishes loading; no error (REQ-12)
- Activity detail fails to load after opening → detail shows its error with the back link, as today (REQ-13)
- Dragging or zooming a card's street map → the map stays still; a click anywhere on the card, map included, opens the detail (REQ-11, REQ-13 · from code)
