# Task 04: allenamento-redesign

## Objective

Allenamento opens with today's workout in direction B; its reasons, plan notices, the training model and the week diagnostics move into Info popovers and Info panels, and the screen works from 360 px wide.

## Context

**Satisfies**: REQ-1, REQ-6, REQ-17, REQ-18, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31

Allenamento carries the most on-page text, so it is the hardest test of the explanation pattern. Home's **Daily overview** (Task 05) links here, so this screen is redesigned first. The advice and plan calculations stay unchanged: only what is shown, and where, changes.

## Depends on

- Task 01
- Task 03

## Expected Behavior

- Top of the screen: today's workout title and detail, with a line icon in place of the title's emoji; a "Perché questo allenamento" label opens a panel with the reason and the number rows (readiness, freshness, load, ratio, hours, hard days, block).
- A "Chiedi al Coach" button opens Coach AI.
- When today is a skip day, the next workout shows as a compact card below with its own "Perché" panel.
- The 28-day calendar keeps the click cycle normale → salto → pioggia; each state shows a line icon; the legend sits in a popover.
- The 7-day plan shows one row per day with day label, icon and title; the day's detail opens in a panel; past days linked to a ride open the ride.
- Recovery-week, mesocycle/taper and training-model texts are one-line notices, each opening its full text in a panel.
- Week diagnostics and the load-source line are no longer on the page; they open from popovers or panels.
- The load chart stays, as restyled in Task 03.
- From 360 px wide everything stacks in one column, with no horizontal scroll.

## Acceptance Criteria

- [ ] Today's title and detail show first; reason and number rows open in the "Perché questo allenamento" panel (REQ-25)
- [ ] "Chiedi al Coach" opens the Coach AI screen (REQ-26)
- [ ] Clicking a calendar day cycles normale, salto, pioggia with line icons, legend in a popover (REQ-28)
- [ ] Each plan day is one row; its detail opens in a panel (REQ-29)
- [ ] No visible text block exceeds 30 words, and every value shown before is still reachable (REQ-17, REQ-18)
- [ ] At 360 px wide the screen has one column and no horizontal scroll (REQ-6)
- [ ] No emoji shows on the screen; line icons replace them (REQ-1)

## Edge Cases

- Calculation output carries emoji (plan rows, notices) → shown as a matching line icon; an emoji with no match shows no icon (REQ-1)
- Font files fail to load → text falls back to the system sans-serif; layout unchanged (REQ-1)
- Width 360 px with long workout titles → titles wrap; no horizontal scroll (REQ-6)
- Width below 360 px → not designed for; page may scroll sideways (REQ-6)
- Advice detail longer than 30 words → visible part cut at a sentence end; the rest in the Info panel (REQ-17)
- Advice detail with no sentence end within 30 words → cut at the 30th word with "…"; full text in the "Perché questo allenamento" panel (REQ-17 · from code)
- Error message (e.g. "Consiglio non disponibile") longer than 30 words → allowed: error notices are exempt (REQ-17)
- Value present today only under a condition (muscular fatigue, recovery week) → same condition still shows it, in its new place (REQ-18)
- Advice calculation fails → error notice in place of today's card; rest of the screen still shown (REQ-25)
- Advice has no number rows → panel shows the reason only (REQ-25)
- Coach service not running → Coach AI screen shows its existing error card (REQ-26)
- No next workout → preview card hidden (REQ-27)
- Next preview's calculation fails with today's → covered by today's error notice (REQ-27)
- Day clicked rapidly several times → each click advances one state; last state saved (REQ-28)
- Past day → shown faded and still clickable, as today (REQ-28)
- Plan calculation fails → "Piano non disponibile" notice, as today (REQ-29)
- Past day linked to a ride → row opens the ride detail; the info label opens the panel (REQ-29)
- Day with no detail text → row not clickable for a panel (REQ-29)
- No recovery week and no mesocycle → no notices shown (REQ-30)
- Both recovery week and mesocycle notices → both shown, recovery week first (REQ-30)
- Week with no diagnostic lines → no info entry for that week (REQ-31)
- Load source is the less precise heart-rate fallback → the popover says so and points to setting LTHR in Impostazioni (REQ-31)
