# Task 01: analisi-tabs

## Objective

Analisi opens on four tabs — Forma e carico, Potenza, Soglie, Segmenti — remembers the last one, and every card title opens an Info popover explaining the card, in direction B.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12

Analisi is the longest screen (9 cards in one column) and carries the most on-page explanations (polarisation method, FTP/LTHR formulas). It goes first because its explanation texts are the largest rewrite and its saved tab is the only new browser value of the feature.

## Depends on

None

## Expected Behavior

- A heading "Analisi" as on Home, then four tabs; each of today's 9 cards sits in exactly one tab.
- Forma e carico: load chart, form trend with insights, heart-rate zones. Potenza: power curve, power profile. Soglie: FTP trend, FTP/LTHR breakdown with its activity tables. Segmenti: segment predictions, segment workouts.
- The chosen tab is remembered across visits and reloads; with no saved choice, Forma e carico.
- Every card title is an Info label; the polarisation method and the FTP/LTHR formulas move into Info panels, formulas under "Dettagli tecnici".
- Card titles and calculated texts show line icons, never emoji.
- At 360 px wide, one column; wide tables scroll inside their card.

## Acceptance Criteria

- [ ] Four tabs show, each holding the cards the spec assigns, every card in exactly one tab (REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [ ] The last chosen tab opens again after a reload; Forma e carico without a saved choice (REQ-11)
- [ ] Every card title opens an Info popover; method and formula texts sit in Info panels (REQ-12, REQ-5)
- [ ] No emoji and no visible text block over 30 words on Analisi; every value shown today is still reachable (REQ-1, REQ-3, REQ-4)
- [ ] At 360 px wide no page-wide horizontal scroll (REQ-2)

## Edge Cases

- Calculation text with emoji (insights, power profile, segment workouts) → matching line icon, or dropped when none matches (REQ-1)
- Width 360 px with the FTP/LTHR breakdown tables → the table scrolls sideways inside its card; the page does not (REQ-2)
- Width below 360 px → not designed for; page may scroll sideways (REQ-2)
- Error message longer than 30 words → allowed: error notices are exempt (REQ-3)
- Value shown today only under a condition (declared FTP note) → same condition still shows it, in its new place (REQ-4)
- Explanation that names code ("easyMin", "estimateFTP") → rewritten in plain words; formulas under "Dettagli tecnici" without code names (REQ-5)
- Explanation with figures (polarisation thresholds, FTP factors) → figures as rows in the Info panel, not prose (REQ-5)
- Four tab names at 360 px → tab bar scrolls sideways inside itself (REQ-6)
- Card with no data (no power meter, no starred segments) → its tab still lists the card with its "no data" message (REQ-6)
- No heart-rate data in the last 4 weeks → zones card shows its message, as today (REQ-7)
- Fewer than 90 days of activities → form trend draws the days there are (REQ-7)
- No power meter → power curve and power profile show their no-data messages (REQ-8)
- Power profile with no deficit or no strength → that side hidden, as today (REQ-8)
- No FTP history yet → FTP trend shows its message; the breakdown still shows (REQ-9)
- FTP declared in Impostazioni → breakdown shows the declared note above the estimates (REQ-9)
- Segments still loading when Segmenti opens → loading progress, then the cards (REQ-10)
- Segment loading fails → error inside the Segmenti tab; other tabs unaffected (REQ-10)
- No starred segments → predictions card's empty message; segment workouts hidden as today (REQ-10)
- Saved tab value unreadable or unknown → opens on Forma e carico (REQ-11)
- Browser storage blocked → tab choice lasts for the visit; Forma e carico after reload (REQ-11)
- Analisi opened from a link while on another screen → opens on the saved tab (REQ-11)
- Card with nothing longer to explain → popover only, no "Approfondisci" (REQ-12)
- Popover opened on a phone → opens on tap; card content unchanged (REQ-12)
