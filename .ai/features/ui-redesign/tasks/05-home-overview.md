# Task 05: home-overview

## Objective

Home becomes the **Daily overview**: today's workout with a link to Allenamento, form and readiness, the last ride, level, totals and records, then data precision with its method in an Info panel — in direction B, from 360 px wide.

## Context

**Satisfies**: REQ-1, REQ-6, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24

Last because it summarises what the other tasks build: today's workout comes from Allenamento's advice (Task 04), the explanations from Task 03, and the export button already moved to the account menu in Task 02.

## Depends on

- Task 02
- Task 03
- Task 04

## Expected Behavior

- First block: today's workout title with its line icon and a link "Vai ad Allenamento".
- Form and readiness show as two values; each label opens a popover explaining it.
- The most recent bike ride shows name, date, distance and moving time, and opens its detail screen.
- Estimated level (popover for its meaning), all-time totals per sport and records; each record opens its ride.
- Data precision: FTP, LTHR and the load source, each value with its note; a label opens the Info panel with the estimation method in plain words, technical detail collapsed.
- "Aggiorna con streams" stays in the data-precision section with its progress.
- The export button and its progress line are no longer on Home (they live in the account menu and top bar).
- From 360 px wide everything stacks in one column, with no horizontal scroll.

## Acceptance Criteria

- [ ] Home opens with today's workout title and a link to Allenamento (REQ-19)
- [ ] Form and readiness show with their popovers (REQ-20)
- [ ] The last bike ride shows name, date, distance, moving time and opens its detail (REQ-21)
- [ ] Level, totals and records show; each record opens its ride (REQ-22)
- [ ] FTP, LTHR and load source show; the estimation method opens in an Info panel (REQ-23)
- [ ] "Aggiorna con streams" works with its progress; no visible block exceeds 30 words; nothing shown before is lost (REQ-24, REQ-17, REQ-18)
- [ ] At 360 px wide one column, no horizontal scroll, no emoji (REQ-6, REQ-1)

## Edge Cases

- Precision mode carries emoji → shown as a matching line icon; an emoji with no match shows no icon (REQ-1)
- Width 360 px with long ride names → names wrap; no horizontal scroll (REQ-6)
- Width below 360 px → not designed for; page may scroll sideways (REQ-6)
- Error message longer than 30 words → allowed: error notices are exempt (REQ-17)
- Value present today only under a condition (W/kg) → same condition still shows it, in its new place (REQ-18)
- Advice calculation fails → Home shows "Consiglio non disponibile" with the link to Allenamento (REQ-19)
- Today is a planned rest day → Home shows the rest advice as today's workout (REQ-19)
- No heart-rate or fatigue data, so no readiness → readiness shown as "—" with its popover explaining why (REQ-20)
- Form is zero or negative → shown with sign; colour from theme meaning (positive, neutral, negative) (REQ-20)
- No rides at all → last-ride block shows "Nessuna uscita ancora" (REQ-21)
- Most recent activity is a run or swim → shows the most recent bike ride (REQ-21)
- No bike ride among the loaded activities (only the last 60 are loaded) → "Nessuna uscita in bici tra le ultime 60 attività", never "Nessuna uscita ancora" (REQ-21 · from code)
- Ride with no name → uses the existing fallback name (REQ-21)
- No records (under ~60 rides with data) → records block hidden as today (REQ-22)
- Record's ride no longer in loaded list → record shown without link (REQ-22)
- Strava stats not available → totals hidden; level and records still shown (REQ-22)
- No FTP or LTHR, neither declared nor estimated → shows "—" with popover pointing to Impostazioni (REQ-23)
- Segments still loading → values update when the segment job ends, as today (REQ-23)
- "Aggiorna con streams" clicked twice → second click ignored while running, as today (REQ-24)
- Strava rate limit hit during streams → progress shows the wait, as today (REQ-24)
- Streams job fails (Strava unreachable) → error shown in the section; already downloaded data kept (REQ-24)
