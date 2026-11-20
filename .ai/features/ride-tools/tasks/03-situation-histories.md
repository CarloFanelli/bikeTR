# Task 03: situation-histories

## Objective

Every Evaluation set situation carries a made-up Load history and the Ride shapes of its rides, so an Evaluation set run with the tools on gets real tool answers, and the run records the tools' use.

## Context

**Satisfies**: REQ-9, REQ-11

The Evaluation set reaches the Coach without saved activities, so the tools must answer from the situation's own data. The repository is public: every history is made up.

## Depends on

02-ride-shape-tool

## Expected Behavior

- Each situation has a made-up 8-week history and 14 days of rides with their Ride shapes, consistent with its recent rides and CTL.
- With the tools on, the Load history and Ride shape tools answer from that data, in the same format as for the athlete's own rides.
- A run file records whether the Ride tools were on, and each answer records how many Ride tool calls it made.

## Acceptance Criteria

- [ ] Every situation in the set file has its Load history and the Ride shapes of its 14 days. (REQ-9)
- [ ] With the tools on, an Evaluation set answer gets tool answers built from the situation's data. (REQ-9)
- [ ] The run records whether the Ride tools were on. (REQ-11)
- [ ] Each answer in the run records its number of Ride tool calls, zero included. (REQ-11)
- [ ] The cost estimate printed before a run counts the extra model turns the Ride tools allow. (REQ-11)

## Edge Cases

- Situation missing its history (old file) → the Evaluation set refuses to run and names the situation (REQ-9)
- Tools on and a model that never calls them → the run records zero calls per answer and the grade is still computed (REQ-11)
