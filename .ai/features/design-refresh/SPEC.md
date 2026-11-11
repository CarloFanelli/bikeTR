---
feature: design-refresh
version: 1.0
status: approved
completed: true
base: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Design Refresh — rounder, wider, and a richer Attività

## Overview

Direction B gave every screen one style, but each screen is still a single column capped at 880 px, which leaves wide monitors mostly empty. This feature rounds corners across the app, lays the card screens out in up to three columns, and rebuilds Attività as a switchable card view (large street map per activity) and table view (route **Mini map** per row), with a sport filter and weekly groups. Home gains this-week tiles, and loading screens show placeholders instead of "Carico…".

## Project Context

- The app stays on Vuetify; no Tailwind (user's choice).
- Direction B colours, fonts, themes, top bar, Info popover and Info panel stay as they are.
- Data series colours stay fixed, as decided in ui-redesign.
- The browser holds the last 60 activities; nothing new is downloaded from Strava.
- Calculation output keeps its emoji; screens show line icons or drop them.
- Values saved in the browser go through the existing browser-storage module, merging the UI values.
- Tests cannot render Vuetify screens; layout is checked in a browser.

## Functional Requirements

### Shape and layout

- REQ-1: Cards, panels, dialogs, the Info popover and Info panel have 16 px corners; buttons, fields, chips and toggles have 12 px.
- REQ-2: Home, Allenamento, the Analisi tabs and Coach AI lay cards in 3 columns from 1280 px, 2 from 768 px, 1 below.
- REQ-3: Cards holding a chart, a table or a map span every column of their row.
- REQ-4: Card screens use the width up to 1440 px with 24 px side margins; Impostazioni, Libreria and Dettaglio attività stay at 880 px.
- REQ-5: From 360 px wide no screen scrolls sideways; in one column, cards keep today's order.

### Attività

- REQ-6: Attività lists every activity in the browser (up to the last 60), most recent first.
- REQ-7: A switch above the list chooses between card view and table view.
- REQ-8: Attività opens on the view chosen last, also after a reload; with no saved choice, on card view.
- REQ-9: Each table row shows the mini map, sport icon, name, date, distance, moving time and climbing.
- REQ-10: The mini map draws only the route line in the route colour, without map tiles.
- REQ-11: Each card shows a large street map with the route, then sport icon, name, date, distance, moving time and climbing.
- REQ-12: A card's street map starts loading only when the card first scrolls into view.
- REQ-13: Clicking, tapping or pressing Enter on a row or card opens its activity detail.
- REQ-14: Chips Tutte, Bici, Corsa and Altro filter the list in both views; Tutte is selected when Attività opens.
- REQ-15: The list is grouped by week, Monday to Sunday, each headed by its dates and the shown activities' total distance, time and climbing.

### Home and loading

- REQ-16: Home opens with three tiles — kilometres, hours and load this week — each with its change versus the same days last week.
- REQ-17: While data loads, Home, Allenamento, Analisi and Attività show grey placeholders shaped like their cards instead of a loading sentence.

## Data & Dependencies

### Information the feature must retain

- Attività view — card or table, saved in the browser when the athlete flips the switch; valid until changed or the browser's data is cleared. Absent or unknown means card view.

### External capabilities relied on

- Street map tiles (OpenStreetMap) — for the large maps in card view, as the activity detail already uses.

## Non-Functional Requirements

- **Performance** — With 60 activities, either Attività view appears within 500 ms of opening, map tiles excluded.
- **Performance** — Card view requests map tiles only for cards that have entered the screen.
- **Validation** — Text contrast stays at least 4.5:1 (3:1 for 24 px and larger) in both themes on every changed screen.
- **Validation** — Below 768 px, the view switch, filter chips, rows and cards have touch areas of at least 44 × 44 px.
- **Validation** — The view switch, filter chips, rows and cards work with the keyboard alone.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Table or image inside a card | Clipped to the card's rounded corners | REQ-1 |
| Info panel full screen on a phone | Square corners: it fills the screen | REQ-1 |
| N/A — concurrent, permission, network: visual only | — | REQ-1 |
| Width exactly 1280 px / 768 px | 3 columns / 2 columns | REQ-2 |
| Last row with fewer cards than columns | Cards keep their column width, aligned left | REQ-2 |
| Screen with only one card (Coach before a run) | One card, columns not stretched | REQ-2 |
| Wide card at 1 column | Full width, like every card | REQ-3 |
| Wide table inside a wide card at 360 px | Table scrolls sideways inside its card | REQ-3 |
| Screen wider than 1440 px | Content centred, empty space split evenly | REQ-4 |
| Width below 360 px | Not designed for; page may scroll sideways | REQ-5 |
| No activities at all | "Nessuna attività" message, switch and chips hidden | REQ-6 |
| Fewer than 60 activities | Lists those there are | REQ-6 |
| Saved view unreadable or unknown | Card view | REQ-8 |
| Browser storage blocked | Choice lasts for the visit; card view after reload | REQ-8 |
| Theme and Analisi tab already saved | Saving the view keeps them | REQ-8 |
| Activity with no distance (strength, yoga) | Distance shown as "—"; time shown | REQ-9 |
| Activity with no climbing | Climbing shown as "—" | REQ-9 |
| Very long activity name | Wraps; row grows, no sideways scroll | REQ-9 |
| Activity without GPS (indoor, strength) | Sport icon in place of the mini map | REQ-10 |
| Route unreadable or a single point | Sport icon in place of the mini map | REQ-10 |
| Card activity without GPS | Sport icon panel the map's size in place of the map | REQ-11 |
| Map tiles fail (offline, server down) | Route line still drawn on an empty background | REQ-11 |
| Fast scroll through 60 cards | Only cards that entered the screen load maps; loaded maps stay | REQ-12 |
| Card scrolled away before its map loads | Map finishes loading; no error | REQ-12 |
| Activity detail fails to load after opening | Detail shows its error with the back link, as today | REQ-13 |
| Filter with no matches | "Nessuna attività di questo tipo tra le ultime 60" | REQ-14 |
| Bike variants (virtual, gravel, MTB, e-bike) | Counted under Bici | REQ-14 |
| Walks, swims, strength, other sports | Counted under Altro | REQ-14 |
| Switching view | Filter stays as chosen | REQ-14 |
| Week with no activity after filtering | Week hidden | REQ-15 |
| Current week | Header shows dates up to today and totals so far | REQ-15 |
| Activity near midnight | Week from the activity's local date, as the rest of the app | REQ-15 |
| No activity this week | Tiles show 0 with the change versus last week | REQ-16 |
| Nothing in the same days last week | Change shown as "+N", no percentage | REQ-16 |
| Rides without power or heart rate | Load computed as elsewhere in the app | REQ-16 |
| Loading fails | Placeholders replaced by the error notice | REQ-17 |
| Data already available | Cards shown at once, no placeholder flash | REQ-17 |

## Out of Scope

- Tailwind — user chose to keep Vuetify for components and styling.
- New colours, fonts or themes — direction B stays as decided in ui-redesign.
- More than 60 activities — needs activities stored on the server (B-11).
- Street tiles in the table's mini maps — user's choice: route line only, to keep the table light.
- Workout-shape chart on Allenamento (B-39) — needs block durations and power from the advice first.
