# Task 02: ride-shape-tool

## Objective

With the ride tools setting on, the Chat model can open the Ride shape of a bike ride from the last 14 days by its ride code.

## Context

**Satisfies**: REQ-5, REQ-6, REQ-7, REQ-8

The second Ride tool shares the loop, limit, step and Trace note of task 01 (REQ-7 and REQ-8 are listed again on purpose: the limit and the visibility must hold for this tool too). The ride codes come from the Load history.

## Depends on

01-load-history-tool

## Expected Behavior

- Called with a ride code from the Load history, the tool returns that ride's Hard blocks with duration and zone, recoveries, minutes per zone and load per hour.
- A code outside the last 14 days, unknown or malformed gets a short refusal naming the 14-day window.
- Every call, refused or not, counts toward the 4 Ride tool calls of the Draft and shows a step and a Trace note.

## Acceptance Criteria

- [ ] A valid ride code returns the ride's Hard blocks, recoveries, minutes per zone and load per hour. (REQ-5)
- [ ] A code from 15 days ago, unknown or malformed gets a refusal naming the 14-day window. (REQ-6)
- [ ] Ride shape calls count toward the same limit of 4 as the Load history. (REQ-7)
- [ ] Each Ride shape call emits a progress step and a Trace note with the ride code asked. (REQ-8)
- [ ] The answer stays under 2,000 characters and carries no Strava id, ride name or GPS data. (REQ-5)

## Edge Cases

- Ride without saved series (details not downloaded yet) → the tool says the shape is not available yet and gives the ride's averages (REQ-5)
- Ride with neither measured power nor heart rate → the tool says no shape can be computed (REQ-5)
- FTP or LTHR missing from the Athlete profile → zones from the missing value are left out and the tool says which (REQ-5)
- Code from 15 days ago, unknown or malformed → short refusal naming the window, counted toward the 4 calls (REQ-6)
- Same ride asked twice in one Draft → answered again, counted as a second call (REQ-7)
