---
feature: training-layout
status: APPROVED
reviewed: 2026-11-11
head: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Review — training-layout

**Scope**: 2 files re-verified (the Allenamento screen and the plan test data, touched by the fixes for F-4 and F-5; nothing was committed since the previous review, so git can't isolate the delta), out of 61 in the diff since base `92c9a49e`; 9 workflow artifacts under `.ai/` excluded
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · should-fix · bug · plan notice labels are too small to tap   [ADDRESSED]
**File**: `web/src/components/MonthPlan.vue:140`
**Issue**: The notice labels above the plan are 36 px tall, below the 44 × 44 px the spec sets for every label.
**Change**: Set `min-height: 44px` on `.notice`, as the calendar days use 48 px in `web/src/components/RestCalendar.vue`.
**Why**: Non-functional requirement "Every label and calendar day is at least 44 × 44 px to tap".

### F-2 · should-fix · bug · next-workout card leaves half a row empty on medium screens   [ADDRESSED]
**File**: `web/src/screens/TrainingScreen.vue:55`
**Issue**: Between 768 and 1279 px the grid has two columns, so today's card (two columns) fills the row and the next-workout card sits alone in the next row with an empty cell beside it, because the plan (two columns) can't fit there.
**Change**: In the existing 768–1279 px media query of this file, let today's card take one column when the next-workout card is shown (a class on the card, `grid-column: auto`), so the two sit side by side.
**Why**: REQ-4's intent (no empty cell beside today's card) and the spec's "Today is skipped" edge case.

### F-3 · should-fix · bug · Allenamento loading placeholder keeps the old layout   [ADDRESSED]
**File**: `web/src/components/LoadingPlaceholder.vue:26-31`
**Issue**: While data loads, Allenamento's grey placeholder still shows the old shape (today in two columns, a third card beside it, then two full-width cards), so the page jumps when the real cards arrive: today usually spans the row, then the plan in two columns with the calendar beside it, then the chart.
**Change**: Mirror the new layout as the Home and Analisi branches of the same file do: today full width, the plan in two columns and the calendar in one, then the chart full width.
**Why**: Placeholders shaped like their cards keep the page from jumping (the screen's grey placeholders were built for that); REQ-1 changed the shape they mirror.

### F-4 · should-fix · bug · advice error leaves an empty cell beside today   [ADDRESSED]
**File**: `web/src/screens/TrainingScreen.vue:55`
**Issue**: When the advice can't be calculated, tomorrow's card is hidden but today's card keeps two of three columns (one of two between 768 and 1279 px), so an empty cell sits beside the error notice.
**Change**: Bind the class to the advice as the card did before: `:class="view.advice.value ? 'span-2 today-card' : 'span-all'"`.
**Why**: REQ-4 (no empty cell in today's row) and the spec's "Advice can't be calculated" edge case.

### F-5 · nit · simplify · recorded next-non-skipped-day results no longer read   [ADDRESSED]
**File**: `web/tests/fixtures/plan-expected.json:78`
**Issue**: The fixture still holds 24 `nextNonSkip` blocks recorded for the removed next-non-skipped-day function; no test reads them any more.
**Change**: Delete every `nextNonSkip` key from the fixture, leaving the other recorded results untouched.
