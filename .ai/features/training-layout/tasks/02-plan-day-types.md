# Task 02: plan-day-types

## Objective

The athlete reads the week at a glance: each plan day shows its type in the load chart's colours, today stands out, and the plan notices sit in one row of labels.

## Context

**Satisfies**: REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-13

Every plan day looked the same, and four or five notice lines stacked above the plan. The load chart already defines the day types, their colours and the stripes and dots.

## Depends on

None

## Expected Behavior

- Each plan day has a bar in its type's colour (easy, hard, long, cross-training, rest), as in the load chart.
- Hard days' bars have stripes, long days' bars dots, and the type's name sits beside the title.
- A completed day takes the type of the ride done.
- Today's row is highlighted in the section colour and marked "Oggi".
- The notices (recovery week, cycle phase, training model, load source) form one row of labels, each opening its explanation; cycle phase and training model open it in the side panel.
- Week-role colours come from the theme.

## Acceptance Criteria

- [ ] Each plan day shows a bar in its type's load-chart colour (REQ-5)
- [ ] Hard bars have stripes, long bars dots, and every day shows its type's name (REQ-6)
- [ ] A completed day shows the type of the ride actually done (REQ-7)
- [ ] Today's row is highlighted and marked "Oggi" (REQ-8)
- [ ] The notices form one row of labels, each at least 44 px tall and opening its explanation (REQ-9)
- [ ] Cycle phase and training model open their explanation in the side panel (REQ-13)
- [ ] Week-role colours come from the theme and reach 3:1 on the card in both themes (REQ-10)

## Edge Cases

- Day category the colours don't cover (rest for rain, skipped) → shown as rest (REQ-5)
- Done ride with no recognised badge (a walk) → shown as rest (REQ-7)
- Done long ride → long colour and dots, not hard (REQ-7)
- Today's week collapsed → nothing highlighted until it is opened (REQ-8)
- No recovery week, no cycle → only the labels that apply are shown (REQ-9)
- Dark theme → role colours and day bars keep 3:1 on the dark card (REQ-5, REQ-10)
- Week without a role → the violet of the model's recovery week (REQ-10)
