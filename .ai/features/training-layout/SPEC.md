---
feature: training-layout
version: 1.1
status: approved
completed: true
base: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Training Layout — Allenamento reads at a glance, with less scrolling

## Overview

Allenamento stacked today's workout, a large calendar, the load chart and then the plan, with every plan day in the same plain text. The athlete had to scroll past the tools to reach what they will do. This feature puts the plan right after today, sets the calendar beside it on wide screens, marks each plan day with the load chart's colour for its type, explains the calendar on the page, and gathers the plan notices into one row. The code was written before this spec; the spec records the agreed behaviour so the review can check it.

## Project Context

- Screens use the shared card grid: 1 column below 768 px, 2 up to 1279 px, 3 from 1280 px.
- Load types and their colours already exist for the load chart (easy, hard, long, cross-training, rest).
- Hard and long days already carry stripes and dots in the chart legend.
- The plan engine gives each day a category (HARD, LONG, EASY…) and done days a badge in their detail.
- Tests cannot render Vuetify screens; layout is checked in a browser.

## Functional Requirements

### Page layout

- REQ-1: Allenamento shows, in order: today's and tomorrow's workouts, the plan, the 28-day calendar, the load chart.
- REQ-2: From 1280 px wide, the calendar sits beside the plan and stays in view while the page scrolls.
- REQ-3: Between 768 and 1279 px the calendar takes a full row under the plan; below 768 px every card takes a full row.
- REQ-4: Today's and tomorrow's cards fill their row with no empty cell; a skipped day shows its planned rest.

### Plan

- REQ-5: Each plan day shows a bar in its type's colour (easy, hard, long, cross-training, rest), the same colours as the load chart.
- REQ-6: Hard days' bars carry stripes, long days' bars dots, and the type's name is written beside the day's title.
- REQ-7: A completed day takes the type of the ride actually done, not the type that was planned.
- REQ-8: Today's row in the plan is highlighted in the section colour and marked "Oggi".
- REQ-9: The plan notices (recovery week, cycle phase, training model, load source) form one row of labels, each opening its explanation.
- REQ-10: Week-role colours (build, peak, deload, taper) come from the theme and reach 3:1 contrast on the card in both themes.

### Calendar

- REQ-11: Above the days, the calendar says a tap cycles allenamento, salto, pioggia, with a legend showing each state's look.
- REQ-12: Calendar days stay at least 48 px tall and stay one tap each.
- REQ-13: The cycle-phase and training-model labels open their explanation in the side panel.

## Data & Dependencies

### Information the feature must retain

- None new: skipped and rainy days are saved as today.

### External capabilities relied on

- None new.

## Non-Functional Requirements

- **Accessibility** — The day type is readable without colour: a pattern for hard and long days, and the type's name for all.
- **Accessibility** — Every label and calendar day is at least 44 × 44 px to tap.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Advice can't be calculated | Today's card shows its error notice; the order stays | REQ-1 |
| Plan can't be calculated | The plan card shows its error notice; the calendar and chart still show | REQ-1, REQ-2 |
| Plan much taller than the calendar (several weeks open) | The calendar stays in view beside it until the plan ends | REQ-2 |
| Window resized across 768 or 1280 px | The layout switches without a reload | REQ-2, REQ-3 |
| Today or tomorrow skipped | Its card stays and shows the planned rest | REQ-4 |
| Day category the colours don't cover (e.g. rest for rain, skipped) | Shown as rest | REQ-5 |
| Done ride with no recognised badge (e.g. a walk) | Shown as rest | REQ-7 |
| Done long ride | Long colour and dots, not hard | REQ-7 |
| Today is outside the open week (today's week collapsed) | Nothing highlighted until that week is opened | REQ-8 |
| No recovery week, no cycle | Only the labels that apply are shown | REQ-9 |
| Dark theme | Role colours and day bars keep 3:1 on the dark card | REQ-5, REQ-10 |
| Week without a role | Uses the violet of the model's recovery week, as today | REQ-10 |
| Past days in the calendar | Shown faded, still tappable, as today | REQ-12 |
| Phone width | The side panel opens full width, as elsewhere | REQ-13 |
| No cycle in the plan | No cycle-phase label; the training model still opens the panel | REQ-13 |
| N/A — concurrent, permission, network: display only, no new data | — | REQ-2, REQ-3, REQ-6, REQ-11 |

## Out of Scope

- A chart of today's workout blocks — needs the training engine to give durations and power per block (B-39).
- Changing how the plan or the advice is computed — this feature only changes how they are shown.
- Removing the load chart from Allenamento, though Analisi also has it — it stays, at the bottom.
- Restyling the Coach and Home screens — they were not part of this request.
