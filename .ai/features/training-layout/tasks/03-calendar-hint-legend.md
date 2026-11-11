# Task 03: calendar-hint-legend

## Objective

The athlete understands the calendar without opening its explanation: a line says what a tap does and a legend shows each state's look.

## Context

**Satisfies**: REQ-11, REQ-12

The calendar's legend lived only inside the title's explanation, so the tap cycle (allenamento, salto, pioggia) was hidden.

## Depends on

None

## Expected Behavior

- Above the days: "Tocca un giorno per cambiarlo: allenamento, poi salto, poi pioggia."
- A legend shows allenamento, salto and pioggia with the look each day takes.
- Days stay at least 48 px tall, one tap each.

## Acceptance Criteria

- [ ] The tap hint appears above the days (REQ-11)
- [ ] The legend shows the three states with the same look as the days (REQ-11)
- [ ] Every calendar day is at least 48 px tall and changes state with one tap (REQ-12)

## Edge Cases

- Past days → shown faded, still tappable (REQ-12)
