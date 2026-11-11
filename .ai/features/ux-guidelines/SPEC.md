---
feature: ux-guidelines
version: 1.0
status: approved
completed: true
base: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# UX Guidelines — fixes from published rules (WCAG 2.2, Nielsen, Material Design 3)

## Overview

Comparing BikeTR with published accessibility and usability rules found chart colours too faint or carrying meaning by colour alone, charts without a text version, a weak keyboard focus, animations that ignore reduced motion, a hidden menu on phones, errors without a way out, an overloaded Home, shifting digits, explanation labels hard to spot, and no search in Attività. This feature fixes each one.

## Project Context

- Vuetify, the section colours, the corners and the card columns stay as they are.
- Data series keep their hues, only darker where contrast falls short.
- Values saved in the browser go through the existing merging saver (`biketr_ui`).
- Calculation output keeps its emoji; screens show line icons or drop them.
- Tests cannot render Vuetify screens; layout and focus are checked in a browser.

## Functional Requirements

### Accessibility

- REQ-1: Every chart bar, line and legend swatch reaches 3:1 contrast against the card in both themes.
- REQ-2: In the daily load chart, hard days show diagonal stripes and long days dots, on bars and in the legend.
- REQ-3: Load, form trend, FTP trend, power curve and heart-rate zone charts each show one summary sentence of at most 25 words.
- REQ-4: Every control that takes keyboard focus shows a 2 px ring with 3:1 contrast while focused.
- REQ-5: When the system asks for reduced motion, panels, menus, placeholders and page changes appear without animation.

### Navigation and errors

- REQ-6: Below 768 px, a **Bottom bar** always shows Home, Allenamento, Analisi, Attività and Coach AI, with icon and name.
- REQ-7: Below 768 px the top bar has no menu button; Libreria sits in the account menu above Impostazioni.
- REQ-8: Each error notice states in one plain sentence what failed; the technical message sits under a closed "Dettagli tecnici".
- REQ-9: Errors from Strava downloads (initial load, streams, segments, export) carry a "Riprova" button that restarts that download.

### Home and Analisi

- REQ-10: Home shows, in this order: today's workout, form, readiness, the three week tiles, last ride.
- REQ-11: Analisi gains a **Profilo e dati** tab with level, totals, records and data precision, including "Aggiorna con streams".
- REQ-12: The Profilo e dati tab is remembered like the other Analisi tabs.

### Detail

- REQ-13: Numbers in tiles, tables, week totals and chart summaries use fixed-width digits.
- REQ-14: Each explaining label shows a small circled "i" after its text, inside the same clickable control.
- REQ-15: Attività has a search box filtering by activity name, ignoring capital letters and accents.
- REQ-16: Search and sport filter combine in both views; the search is not saved and starts empty.
- REQ-17: The search box has a clear button, and Escape clears it.
- REQ-18: With no match, Attività says "Nessuna attività con «{testo}» tra le ultime N".

## Data & Dependencies

### Information the feature must retain

- Analisi tab — gains the value for Profilo e dati, saved in the browser with the other UI values; unknown values open "Forma e carico".

### External capabilities relied on

- None new: patterns are drawn by the current chart library.

## Non-Functional Requirements

- **Accessibility** — Text contrast stays at least 4.5:1 in both themes.
- **Accessibility** — Bottom-bar items and the search box are at least 48 × 48 px.
- **Performance** — Filtering 60 activities by search updates the list within 100 ms of typing.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Dark theme | Darker colours meet 3:1 on the dark card too | REQ-1 |
| A day type absent from the chart's period | Its legend entry still shows | REQ-1, REQ-2 |
| Printing or high-contrast mode | Patterns stay; colours may change | REQ-2 |
| Bar too thin for a pattern (many days) | Pattern scaled down, still visible | REQ-2 |
| N/A — concurrent, permission, network: visual only | — | REQ-1, REQ-2, REQ-4, REQ-5, REQ-13, REQ-14 |
| Chart with no data | The sentence says there is no data yet, e.g. "Nessun carico negli ultimi 60 giorni" | REQ-3 |
| Chart data still arriving (segments, streams) | The sentence follows the data when it arrives | REQ-3 |
| Focus on a section-coloured badge or button | The ring stays visible: it is drawn outside the control | REQ-4 |
| Mouse click | No ring; it shows only for keyboard focus | REQ-4 |
| Focus inside the Info panel | The ring shows there too | REQ-4 |
| Reduced motion changed while the app is open | Applies at once, no reload | REQ-5 |
| Placeholders under reduced motion | Shown without shimmer | REQ-5 |
| Width exactly 768 px | Top-bar sections, no Bottom bar | REQ-6 |
| Phone keyboard open (search, Coach duration) | Bottom bar may hide; content stays reachable | REQ-6 |
| Bottom bar over content | Pages leave room at the bottom; the last card is fully visible | REQ-6 |
| Activity detail open | "Attività" lit in the Bottom bar | REQ-6 |
| Impostazioni or Libreria open | No Bottom bar item lit | REQ-6, REQ-7 |
| Not connected to Strava, or loading | No Bottom bar, as with the top bar today | REQ-6 |
| Error without technical text | No "Dettagli tecnici" | REQ-8 |
| Long technical message | Wraps inside the notice, no sideways scroll | REQ-8 |
| "Riprova" pressed twice | The second press does nothing while the retry runs | REQ-9 |
| Retry fails again | The same notice returns, with "Riprova" | REQ-9 |
| Strava disconnected during a retry | The "Collega Strava" screen, as today | REQ-9 |
| Calculation errors (advice, plan) | Plain sentence and "Dettagli tecnici", no "Riprova": same data, same result | REQ-8, REQ-9 |
| No advice available | The workout card shows its notice; the order stays | REQ-10 |
| No rides | Last ride shows its existing empty message | REQ-10 |
| Streams download started from the tab, then Analisi left | Download continues; progress shows on return | REQ-11 |
| Saved tab unknown or unreadable | Opens "Forma e carico" | REQ-12 |
| Theme, Attività view and Analisi tab already saved | Saving the tab keeps them | REQ-12 |
| Label inside a sentence | The "i" stays on the line of the label's last word | REQ-14 |
| "Dettagli" that opens the Info panel directly | Gets the "i" too | REQ-14 |
| "giro" against "Giro del lago" or "GIRÒ" | Both match | REQ-15 |
| Search plus the Bici filter | Only bike rides whose name matches | REQ-16 |
| Weeks with no match | Hidden, as with the filter | REQ-16 |
| Switching view | Search text stays | REQ-16 |
| Spaces only | Treated as empty | REQ-17 |
| Name containing «» or quotes | Shown as typed, never as markup | REQ-18 |

## Out of Scope

- Summary sentences for segment sparklines — their numbers are already written beside them.
- Searching beyond the last 60 activities — needs activities stored on the server (B-11).
- Restyling Libreria and Impostazioni — narrow screens, already outside the column layout.
- A different chart library — patterns are drawn by the current one.
- Translating the app or rewording other texts — not part of the rules found.
