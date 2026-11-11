---
feature: ui-redesign
version: 1.0
status: approved
completed: true
base: a6bd671c169b58965ad8dc7becac3e37ab6f9130
---

# UI Redesign — foundation and pilot screens

## Overview

BikeTR's screens are crowded with text, long explanations sit open on the page, and the look is ad hoc (emoji titles, fixed dark colours). This feature sets one visual language for the whole app — direction B, "light editorial", with a matching dark theme — and a standard way to explain things: a short **Info popover** beside a label, leading to an **Info panel** for longer text. It applies both to the app shell and to two pilot screens: Home, which becomes a **Daily overview**, and Allenamento. Every other screen gets the new shell and themes but keeps its layout; each is redesigned in its own later spec.

## Project Context

- The app is in Italian; all new copy is Italian.
- Components stay on Vuetify with `@mdi` icons (licence decision in project memory).
- The calculations and the advice logic do not change: this feature is presentation only.
- Today the sidebar is permanent and the layout targets computer screens only.
- Values saved in the browser go through the app's existing browser-storage module.
- Tests cannot render Vuetify screens; screen behaviour is checked in a browser.
- The design reference is the canvas "BikeTR design directions", board B.

## Functional Requirements

### Look and shell

- REQ-1: The shell, Home and Allenamento use direction B: Space Grotesk headings, Inter text, thin dividers, one accent colour, line icons, no emoji.
- REQ-2: A top bar replaces the sidebar and links Home, Allenamento, Analisi, Attività, Coach AI and Libreria, highlighting the current section.
- REQ-3: An account menu in the top bar shows the athlete's name and Strava connection, and holds Impostazioni, Esporta allenamenti and the theme choice.
- REQ-4: While a workout export runs, the top bar shows its progress on every screen.
- REQ-5: Below 768 px wide, the top bar's sections move into a menu button that opens the full list.
- REQ-6: From 360 px wide, Home and Allenamento stack in one column with no horizontal scrolling.

### Themes

- REQ-7: With no saved choice, the theme follows the computer's light or dark setting, also when that setting changes.
- REQ-8: Choosing "Chiaro", "Scuro" or "Sistema" in the account menu applies at once and is still applied after reload.
- REQ-9: Every screen, pilot or not, shows readable text in both themes, with no fixed dark or light backgrounds left.
- REQ-10: Charts' axes, grid lines, legends and tooltips follow the active theme.

### Explanations

- REQ-11: A dotted-underlined label opens an **Info popover** beside it, at most two sentences, by click, tap, or keyboard Enter.
- REQ-12: When a topic has a longer explanation, its Info popover ends with "Approfondisci", which opens the **Info panel** on that topic.
- REQ-13: On computer widths the Info panel slides in from the right, leaving the screen visible behind it; below 768 px it fills the screen.
- REQ-14: Esc, the close button or a click outside closes an Info popover or Info panel and returns focus to the label that opened it.
- REQ-15: Each Info panel opens with at most three plain sentences; any technical detail sits below in a collapsed "Dettagli tecnici" section.
- REQ-16: No Info panel or popover text names code functions, variables or file names.
- REQ-17: On Home and Allenamento, no text block visible without opening a popover or panel exceeds 30 words.
- REQ-18: Every number and text that Home and Allenamento show today remains reachable, on the page or in a popover or panel.

### Home (Daily overview)

- REQ-19: Home opens with today's workout title and a link to Allenamento.
- REQ-20: Home shows the athlete's form and readiness, each label with an Info popover.
- REQ-21: Home shows the most recent ride's name, date, distance and moving time, linking to its detail screen.
- REQ-22: Home shows the estimated level, all-time totals and records; each record links to its ride.
- REQ-23: Home's data-precision section shows FTP, LTHR and the load source; the estimation method moves into an Info panel.
- REQ-24: "Aggiorna con streams" stays in the data-precision section, showing its progress while it runs.

### Allenamento

- REQ-25: Allenamento opens with today's workout title and detail; its reason and number rows move into a "Perché questo allenamento" Info panel.
- REQ-26: A "Chiedi al Coach" button on today's workout opens the Coach AI screen.
- REQ-27: The next workout preview shows as a compact card below today's, with its own "Perché" Info panel.
- REQ-28: The 28-day calendar keeps the click cycle normale → salto → pioggia, each state shown by a line icon, legend in an Info popover.
- REQ-29: The 7-day plan shows one row per day with its title; the day's detail text opens in an Info panel.
- REQ-30: Recovery-week, mesocycle and training-model texts each show as one-line notices opening their full text in an Info panel.
- REQ-31: Week diagnostic lines and the load-source line leave the visible page and move into Info panels or popovers.
- REQ-32: The load chart stays on Allenamento with its legend and an Info popover explaining daily load.

## Data & Dependencies

### Information the feature must retain

- Theme choice — "Sistema", "Chiaro" or "Scuro", saved in the browser when the athlete picks one; valid until changed or the browser's data is cleared. Absent means "Sistema".
- Sidebar-collapsed preference — no longer used once the sidebar is gone; the saved value is ignored.

### External capabilities relied on

- The computer's light/dark setting, read from the browser — default for the theme (REQ-7).

## Non-Functional Requirements

- **Performance** — Switching theme repaints the current screen in under 200 ms, without reloading the page or re-downloading Strava data.
- **Performance** — An Info popover or Info panel opens in under 150 ms after the click.
- **Security** — Fonts and icons are served by the app itself; opening any screen makes no request to font or icon servers outside the app.
- **Validation** — Text contrast is at least 4.5:1 (3:1 for text 24 px and larger) in both themes, on every screen.
- **Validation** — On widths below 768 px, every button and link in the shell and pilot screens has a touch area of at least 44 × 44 px.
- **Validation** — Every Info popover, Info panel and menu can be opened, read and closed with the keyboard alone.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Font files fail to load | Text falls back to the system sans-serif; layout unchanged | REQ-1 |
| Calculation output carries emoji (plan rows, notices, precision mode) | Shown as a matching line icon; an emoji with no match shows no icon | REQ-1 |
| A section's screen fails to load its code | Top bar stays visible and usable; the error shows in the content area | REQ-2 |
| Athlete opens an unknown address | Redirects to Home as today; top bar highlights Home | REQ-2 |
| Athlete has no profile picture | Account menu shows initials of first and last name | REQ-3 |
| Very long athlete name | Shortened with "…" in the top bar; full name inside the account menu | REQ-3 |
| Strava disconnected in another tab | Next Strava call fails as today, the connect screen appears, in the active theme | REQ-3 |
| Export started, athlete changes screen | Progress stays in the top bar until the export ends or fails | REQ-4 |
| Export fails midway | Top bar progress replaced by an error notice the athlete can dismiss | REQ-4 |
| Width exactly 768 px | Full top bar shown; menu button appears from 767 px down | REQ-5 |
| Menu open, athlete picks a section | Menu closes and the section opens | REQ-5 |
| Width 360 px with long workout titles | Titles wrap; no horizontal scroll | REQ-6 |
| Width below 360 px | Not designed for; page may scroll sideways | REQ-6 |
| Browser does not report a light/dark setting | Light theme | REQ-7 |
| Computer switches to dark while the app is open, choice "Sistema" | App switches to dark without reload | REQ-7 |
| Saved theme value is unreadable or unknown | Treated as "Sistema" | REQ-8 |
| Browser storage blocked (private window) | Choice applies for this visit, falls back to "Sistema" after reload | REQ-8 |
| Two tabs open, theme changed in one | The other tab picks up the choice on its next reload | REQ-8 |
| Non-pilot screen with hard-coded dark colours (load chart, plan rows, calendar) in light theme | Uses the theme's colours; text stays readable | REQ-9 |
| Connect screen and loading message, before Strava data | Shown in the active theme | REQ-9 |
| Load-type colours on charts in light theme | Bars still distinguishable by lightness, not hue alone | REQ-10 |
| Theme changes while a chart is shown | Chart redraws in the new theme without reload | REQ-10 |
| Popover near the screen edge | Repositions to stay fully inside the screen | REQ-11 |
| Touch device (no hover) | Popover opens on tap, never only on hover | REQ-11 |
| Second popover opened while one is open | First one closes | REQ-11 |
| Topic has no longer explanation | Popover shows no "Approfondisci" | REQ-12 |
| "Approfondisci" clicked | Popover closes, panel opens | REQ-12 |
| Panel already open, another topic's panel requested | Panel content replaced; one panel at a time | REQ-13 |
| Phone rotated to landscape at 800 px with panel open | Panel switches to side layout; content kept | REQ-13 |
| Label scrolled out of view when panel closes | Focus returns to it and it scrolls into view | REQ-14 |
| Athlete navigates to another section with panel open | Panel closes | REQ-14 |
| Topic has no technical detail | No "Dettagli tecnici" section | REQ-15 |
| Panel text taller than the screen | The panel scrolls on its own; the page behind does not move | REQ-15 |
| Explanation needs a formula (e.g. form = fitness − fatigue) | Written in words and symbols, not code | REQ-16 |
| N/A — concurrent, network, permission: static copy | — | REQ-16 |
| Advice detail longer than 30 words | Visible part cut at a sentence end; the rest in the Info panel | REQ-17 |
| Error message (e.g. "Consiglio non disponibile") longer than 30 words | Allowed: error notices are exempt | REQ-17 |
| Value present today only under a condition (W/kg, recovery week) | Same condition still shows it, in its new place | REQ-18 |
| N/A — concurrent, network: layout only | — | REQ-18 |
| Advice calculation fails | Home shows "Consiglio non disponibile" with the link to Allenamento | REQ-19 |
| Today is a planned rest day | Home shows the rest advice as today's workout | REQ-19 |
| No heart-rate or fatigue data, so no readiness | Readiness shown as "—" with its popover explaining why | REQ-20 |
| Form is zero or negative | Shown with sign; colour from theme meaning (positive, neutral, negative) | REQ-20 |
| No rides at all | Last-ride block shows "Nessuna uscita ancora" | REQ-21 |
| Most recent activity is a run or swim | Shows the most recent bike ride | REQ-21 |
| Ride with no name | Uses the existing fallback name | REQ-21 |
| No records (under ~60 rides with data) | Records block hidden as today | REQ-22 |
| Record's ride no longer in loaded list | Record shown without link | REQ-22 |
| Strava stats not available | Totals hidden; level and records still shown | REQ-22 |
| No FTP or LTHR, neither declared nor estimated | Shows "—" with popover pointing to Impostazioni | REQ-23 |
| Segments still loading | Values update when the segment job ends, as today | REQ-23 |
| "Aggiorna con streams" clicked twice | Second click ignored while running, as today | REQ-24 |
| Strava rate limit hit during streams | Progress shows the wait, as today | REQ-24 |
| Streams job fails (Strava unreachable) | Error shown in the section; already downloaded data kept | REQ-24 |
| Advice calculation fails | Error notice in place of today's card; rest of the screen still shown | REQ-25 |
| Advice has no number rows | Panel shows the reason only | REQ-25 |
| Coach service not running | Coach AI screen shows its existing error card | REQ-26 |
| N/A — permission: single-user app | — | REQ-26 |
| No next workout | Preview card hidden | REQ-27 |
| Next preview's calculation fails with today's | Covered by today's error notice | REQ-27 |
| Day clicked rapidly several times | Each click advances one state; last state saved | REQ-28 |
| Past day | Shown faded and still clickable, as today | REQ-28 |
| Plan calculation fails | "Piano non disponibile" notice, as today | REQ-29 |
| Past day linked to a ride | Row opens the ride detail; the info icon opens the panel | REQ-29 |
| Day with no detail text | Row not clickable for a panel | REQ-29 |
| No recovery week and no mesocycle | No notices shown | REQ-30 |
| Both recovery week and mesocycle notices | Both shown, recovery week first | REQ-30 |
| Week with no diagnostic lines | No info entry for that week | REQ-31 |
| Load source is the less precise heart-rate fallback | The popover says so and points to setting LTHR in Impostazioni | REQ-31 |
| No rides in the last 30 days | Chart shows empty days and a zero average | REQ-32 |
| Chart shared with Analisi | Analisi shows the same restyled chart | REQ-32 |

## Out of Scope

- New layouts for Analisi, Attività, Dettaglio attività, Coach AI, Libreria, Impostazioni and Collega Strava — each gets its own spec, reusing this foundation.
- Changes to calculations, advice, or plan logic — this feature is presentation only; known logic bugs are already backlog items.
- Replacing Vuetify — kept for its licence; it can be themed to direction B.
- Screens narrower than 360 px — no current phone is that narrow.
- English or other UI languages — the app is Italian only.
- Workout charts with invented durations or targets, as in the mock — the advice provides only title, detail and reason today.
