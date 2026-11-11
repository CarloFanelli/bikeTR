# Task 06: home-and-profile-tab

## Objective

Home shows only what the athlete needs for today, and level, totals, records and data precision move to a new **Profilo e dati** tab in Analisi, remembered like the other tabs.

## Context

**Satisfies**: REQ-10, REQ-11, REQ-12

Home stacked about ten cards; the **Daily overview** now answers "what do I do today?" and the rest moves where analysis lives.

## Depends on

None

## Expected Behavior

- Home shows, in this order: today's workout, form, readiness, the three week tiles, last ride.
- Analisi gains a fifth tab, Profilo e dati, with the profile card (level, totals, records) and the data precision card with "Aggiorna con streams" and its progress.
- Opening Analisi reopens Profilo e dati when it was chosen last.

## Acceptance Criteria

- [ ] Home shows exactly today's workout, form, readiness, three week tiles and last ride, in that order (REQ-10)
- [ ] Analisi's Profilo e dati tab shows level, totals, records and data precision with "Aggiorna con streams" (REQ-11)
- [ ] Choosing Profilo e dati, leaving and reopening Analisi (or reloading) opens it again (REQ-12)
- [ ] Saving the tab keeps the saved theme and Attività view (REQ-12)

## Edge Cases

- No advice available → the workout card shows its notice; the order stays (REQ-10)
- No rides → last ride shows its existing empty message (REQ-10)
- Streams download started from the tab, then Analisi left → download continues; progress shows on return (REQ-11)
- Saved tab unknown or unreadable → opens "Forma e carico" (REQ-12)
- Theme, Attività view and Analisi tab already saved → saving the tab keeps them (REQ-12)
