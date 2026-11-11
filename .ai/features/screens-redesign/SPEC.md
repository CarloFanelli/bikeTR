---
feature: screens-redesign
version: 1.0
status: approved
completed: true
base: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Screens Redesign — the remaining screens in direction B

## Overview

`ui-redesign` gave BikeTR one visual language (direction B, light and dark themes), the top bar, and the **Info popover** / **Info panel** pattern, applied to Home and Allenamento. The other screens still carry emoji titles, open accordions of formulas and long text on the page. This feature redesigns them with the same foundation: Analisi becomes four tabs, Attività and its detail get a clean list and header, Coach AI keeps only the workout on the page with the developer details in "Dietro le quinte", Libreria and Impostazioni are regrouped (Impostazioni with a save bar), and Collega Strava becomes a simple welcome card.

## Project Context

- The app is in Italian; all new copy is Italian.
- Reuses the `ui-redesign` foundation: themes, fonts, top bar, line icons, Info popover and Info panel.
- The calculations, the advice logic, the Coach service and the Strava calls do not change: presentation only.
- Calculation output keeps its emoji; screens turn them into line icons or drop them at display time.
- Values saved in the browser go through the app's existing browser-storage module.
- Tests cannot render Vuetify screens; screen behaviour is checked in a browser.
- Data series colours (zones, plan roles, FTP and power lines, gold marks, map route) stay fixed, as decided in `ui-redesign`.

## Functional Requirements

### All redesigned screens

- REQ-1: Analisi, Attività, Dettaglio attività, Coach AI, Libreria, Impostazioni and Collega Strava use direction B: heading as on Home, line icons, no emoji.
- REQ-2: From 360 px wide, each redesigned screen stacks in one column with no page-wide horizontal scroll.
- REQ-3: On every redesigned screen, no text block visible without opening a popover or panel exceeds 30 words.
- REQ-4: Every number, text and action these screens offer today remains reachable, on the page or in a popover or panel.
- REQ-5: On-page explanations (open accordions, prose legends, formula lists) move into Info popovers and Info panels, formulas under "Dettagli tecnici".

### Analisi

- REQ-6: Analisi shows four tabs — Forma e carico, Potenza, Soglie, Segmenti — and each of today's cards appears in exactly one tab.
- REQ-7: Forma e carico holds the load chart, the form trend with its insights, and the heart-rate zones.
- REQ-8: Potenza holds the power curve and the power profile.
- REQ-9: Soglie holds the FTP trend and the FTP/LTHR breakdown with its activity tables.
- REQ-10: Segmenti holds the segment predictions and the segment workouts.
- REQ-11: Analisi opens on the tab chosen last, also after a reload; with no saved choice it opens on Forma e carico.
- REQ-12: Each Analisi card title is an Info label explaining what the card shows and how to read it.

### Attività and Dettaglio attività

- REQ-13: Attività lists the 15 most recent activities; each row shows sport icon, name, date, distance and moving time, and opens its detail.
- REQ-14: Dettaglio attività opens with a back link, the name with sport icon and date, then key metrics, map, per-km splits and segments.
- REQ-15: Each segment row shows its KOM and PR positions as badges readable in both themes.

### Coach AI

- REQ-16: Coach AI opens with the available duration and "Genera workout di oggi"; while it runs, the current step and a Stop button show.
- REQ-17: The workout's title, target power and steps show on the page; its reasoning and cited papers open in an Info panel.
- REQ-18: A closed "Dietro le quinte" section at the bottom holds the context sent, the raw output, the papers found with scores, and model and timings.
- REQ-19: A fallback warning or a Coach error shows as a one-line notice; its full text opens in an Info panel.

### Libreria

- REQ-20: Libreria shows the PMID field and "Cerca su PubMed" above the paper list; each row shows citation, origin and passage count.
- REQ-21: Opening a paper shows its links, licence, text used and passages; adding, removing and restoring papers work as today.

### Impostazioni

- REQ-22: Impostazioni groups its fields under titled sections: Soglie, Volume, Disponibilità, Gara, Recupero, Coach, Strava.
- REQ-23: Each field's help text moves into an Info popover beside its label.
- REQ-24: After any change, a save bar fixed at the bottom shows "Salva" and "Annulla"; it disappears after saving or cancelling.
- REQ-25: Leaving Impostazioni with unsaved changes asks the athlete to confirm before discarding them.

### Collega Strava

- REQ-26: Collega Strava shows a centred card with the app name, one sentence on what BikeTR does, and the "Collega Strava" button.
- REQ-27: With Strava credentials missing, the card shows the setup steps as a short numbered list instead of the button.

## Data & Dependencies

### Information the feature must retain

- Last Analisi tab — the tab the athlete opened last, saved in the browser when they switch tab; valid until changed or the browser's data is cleared. Absent or unknown means Forma e carico.

## Non-Functional Requirements

- **Performance** — Switching Analisi tab shows the new tab's cards in under 300 ms, without downloading Strava data again.
- **Validation** — Text contrast is at least 4.5:1 (3:1 for text 24 px and larger) in both themes, on every redesigned screen.
- **Validation** — On widths below 768 px, every button, link and tab on the redesigned screens has a touch area of at least 44 × 44 px.
- **Validation** — Tabs, the save bar, "Dietro le quinte" and every Info popover and panel work with the keyboard alone.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Calculation text with emoji (insights, power profile, segment workouts, Coach notes) | Shown as a matching line icon, or dropped when none matches | REQ-1 |
| Activity type with no matching icon (e.g. Yoga) | Generic activity icon | REQ-1 |
| Width 360 px with wide tables (FTP/LTHR breakdown, splits) | The table scrolls sideways inside its card; the page does not | REQ-2 |
| Width below 360 px | Not designed for; page may scroll sideways | REQ-2 |
| Coach reasoning longer than 30 words | Page shows the start, cut at a sentence end; full text in the Info panel | REQ-3 |
| Error message longer than 30 words | Allowed: error notices are exempt | REQ-3 |
| Value shown today only under a condition (declared FTP note, KOM badge, removed base papers) | Same condition still shows it, in its new place | REQ-4 |
| N/A — concurrent, network: layout only | — | REQ-4 |
| Explanation that names code (e.g. "easyMin", "estimateFTP") | Rewritten in plain words; formulas under "Dettagli tecnici" without code names | REQ-5 |
| Explanation with figures (polarisation thresholds, FTP factors) | Figures shown as rows in the Info panel, not in prose | REQ-5 |
| Four tab names at 360 px | Tab bar scrolls sideways inside itself; the page does not | REQ-6 |
| Card with no data (no power meter, no starred segments) | Its tab still lists the card with its "no data" message | REQ-6 |
| No heart-rate data in the last 4 weeks | Zones card shows its message, as today | REQ-7 |
| Fewer than 90 days of activities | Form trend draws the days there are, as today | REQ-7 |
| No power meter | Power curve and power profile show their no-data messages | REQ-8 |
| Power profile with no deficit or no strength | That side hidden, as today | REQ-8 |
| No FTP history yet | FTP trend shows its message; the breakdown still shows | REQ-9 |
| FTP declared in Impostazioni | Breakdown shows the declared note above the estimates, as today | REQ-9 |
| Segments still loading when Segmenti opens | Tab shows the loading progress, then the cards, as today | REQ-10 |
| Segment loading fails | Error shown inside the Segmenti tab; other tabs unaffected | REQ-10 |
| No starred segments | Segmenti shows the predictions card's empty message; segment workouts hidden as today | REQ-10 |
| Saved tab value unreadable or unknown | Opens on Forma e carico | REQ-11 |
| Browser storage blocked | Tab choice lasts for the visit; Forma e carico after reload | REQ-11 |
| Analisi opened from a link while on another screen | Opens on the saved tab | REQ-11 |
| Card with nothing longer to explain | Popover only, no "Approfondisci" | REQ-12 |
| Popover opened on a phone | Opens on tap; card content unchanged | REQ-12 |
| Fewer than 15 activities | Lists those there are | REQ-13 |
| No activities at all | "Nessuna attività" message | REQ-13 |
| Activity with no name | Uses the existing fallback name | REQ-13 |
| Activity with no distance (strength, yoga) | Row shows moving time only | REQ-13 |
| Detail opened for an unknown or someone else's id | "Attività non trovata" with link back to the list, as today | REQ-14 |
| Detail download fails | Error notice with the back link | REQ-14 |
| Activity with no GPS track (indoor) | Map hidden; the rest shown | REQ-14 |
| Activity with no splits or no segments | That card hidden, as today | REQ-14 |
| Segment with both KOM and PR | Both badges shown | REQ-15 |
| Very long segment name | Wraps; badges stay beside or below it | REQ-15 |
| Duration outside 30–300 min | Field shows its limit message; generation does not start, as today | REQ-16 |
| "Genera" clicked while a run is going | Ignored until it ends or is stopped | REQ-16 |
| Coach service unreachable | Error notice in plain words, detail in the Info panel | REQ-16 |
| Athlete presses Stop | "Richiesta interrotta" notice; no workout shown | REQ-16 |
| Workout with no cited papers | No papers part in the Info panel | REQ-17 |
| Workout with no target power (no FTP) | Target line hidden; steps shown | REQ-17 |
| No run yet | "Dietro le quinte" shows only the context that would be sent | REQ-18 |
| Context not available (Coach status fails) | "Dietro le quinte" says it is not available | REQ-18 |
| Workout from the fallback rules | Notice "Workout dalle regole di riserva" with the reason in the panel | REQ-19 |
| Fallback warning and Coach error at the same time | Error notice first, then the warning | REQ-19 |
| N/A — network: the notice shows whatever the Coach returned | — | REQ-19 |
| Library service unreachable | Error notice in place of the list; the PMID field stays | REQ-20 |
| PMID empty or not a number | Search does not start; field shows the message, as today | REQ-20 |
| PMID already in the library | Message says so, as today | REQ-20 |
| Paper with no journal or no licence | Those parts hidden | REQ-21 |
| Passages fail to load | Error inside the opened paper only | REQ-21 |
| Removing a base paper | Moves to "Paper di base tolti" with "Ripristina", as today | REQ-21 |
| Section with no fields set (no race) | Section shown with empty fields | REQ-22 |
| Field with no help text | Plain label, no popover | REQ-23 |
| Coach model check fails (Ollama off) | Coach section shows the check error, as today | REQ-22 |
| Width 360 px with day toggles | Day toggles wrap to two rows | REQ-22 |
| Help text longer than two sentences | Popover gets the first two; the rest in the Info panel | REQ-23 |
| Invalid value (FTP 0, letters) | Field shows its error; "Salva" disabled until fixed | REQ-24 |
| Saving fails (browser storage full or blocked) | Error notice in the save bar; changes kept on screen | REQ-24 |
| Change undone by hand back to the saved value | Save bar disappears | REQ-24 |
| Save bar covering the last field on a phone | Page bottom gets extra space so the last field stays reachable | REQ-24 |
| Athlete switches section with unsaved changes | Confirm dialog: "Esci senza salvare" or "Resta" | REQ-25 |
| Athlete reloads or closes the tab with unsaved changes | The browser's own leave-page warning | REQ-25 |
| Disconnect Strava with unsaved changes | Same confirm first | REQ-25 |
| Strava refuses the connection or the athlete cancels | Collega Strava shows the error from Strava, as today | REQ-26 |
| Auth server unreachable | Error notice on the card; button stays | REQ-26 |
| Credentials added and page reloaded | Button replaces the steps | REQ-27 |
| Only one of the two credentials missing | Steps name the missing one, as today | REQ-27 |

## Out of Scope

- Overall design changes across the app — their own spec after this one, once every screen is in the new style (user's choice).
- Workout-shape chart on Allenamento (B-39) — needs the advice to provide block durations and power first.
- New data on any screen (more than 15 activities, new charts, PubMed search by title B-32) — presentation only.
- Recolouring data series for the light theme — kept fixed, as decided in `ui-redesign`.
