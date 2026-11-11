# Task 01: page-order-layout

## Objective

The athlete opens Allenamento and sees today's workout, then the plan, then the calendar, then the load chart, with the calendar beside the plan on wide screens and no empty cells.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4

The plan was below the calendar and the chart, so the athlete scrolled past the tools to reach what to do. The layout uses the shared card grid (1, 2 or 3 columns).

## Depends on

None

## Expected Behavior

- Cards appear in this order: today and tomorrow, plan, calendar, load chart.
- From 1280 px the calendar sits beside the plan and stays in view while the page scrolls.
- Between 768 and 1279 px the calendar takes a full row under the plan; below 768 px every card takes a full row.
- Today's card never leaves an empty cell beside it.

## Acceptance Criteria

- [ ] The four cards appear in the stated order at every width (REQ-1)
- [ ] From 1280 px the calendar is beside the plan and stays in view while scrolling (REQ-2)
- [ ] Between 768 and 1279 px the calendar spans the row; below 768 px all cards do (REQ-3)
- [ ] Today's and tomorrow's cards always show and fill their row with no empty cell (REQ-4)

## Edge Cases

- Advice can't be calculated → today's card shows its error notice; the order stays (REQ-1)
- Plan can't be calculated → the plan card shows its error notice; calendar and chart still show (REQ-1, REQ-2)
- Plan much taller than the calendar → the calendar stays in view beside it until the plan ends (REQ-2)
- Window resized across 768 or 1280 px → the layout switches without a reload (REQ-2, REQ-3)
- Today or tomorrow skipped → its card stays and shows the planned rest; at 3 columns today takes two and tomorrow the third, at 2 columns one each (REQ-4)
