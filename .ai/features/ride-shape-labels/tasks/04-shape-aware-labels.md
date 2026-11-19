# Task 04: shape-aware-labels

## Objective

The Label rule and the Label model label a ride from its Ride shape: repeated Hard blocks make ripetute, a single activation or irregular climbs stay fondo.

## Context

**Satisfies**: REQ-6, REQ-7, REQ-8, REQ-9

This is where labels change. Thresholds and the repeated-block pattern are tuned on the Tuning set only, then the Check set is measured once.

## Depends on

02-ride-shape, 03-labeled-rides-series

## Expected Behavior

- A ride with 2+ Hard blocks of similar length, each followed by a recovery, is ripetute.
- A single Hard block, or irregular blocks on a long ride, leave it fondo.
- The race flag still gives gara first.
- The Label model's message describes each ride's Ride shape beside its averages.
- A ride without a series is labelled from its averages, as today.
- Badges in Attività and the Coach's labels use the same rule.

## Acceptance Criteria

- [ ] 2x20 at threshold and 3x10 in Z3 are labelled ripetute (REQ-6)
- [ ] A Z2 ride with one Z3 activation is fondo (REQ-7)
- [ ] A 4-hour ride with five climbs of different lengths is fondo (REQ-7)
- [ ] The Label model's message includes each ride's blocks, recoveries and minutes per zone (REQ-8)
- [ ] A ride without series gets today's label from averages (REQ-9)
- [ ] The rule's score on the Tuning set and on the Check set is recorded in the label runs README (REQ-6, REQ-7)

## Edge Cases

- Race flag set → gara, whatever the shape (REQ-6)
- Label model ignores the shape and answers anyway → measured as today: wrong labels count wrong (REQ-8)
- Ride deleted on Strava or download refused → labelled from averages (REQ-9)

## Notes from implementation

- **Known limitation**: the AC "rule's score on the Tuning set and on the Check set recorded in the label runs README" is not met yet, and "similar length" (2×) is not tuned yet. The Labeled rides have no series until the Coach restarts (it applies the new table at startup), the background download refills the series of old rides, and `--add-series` runs; r37 still has no label, so the Tuning set measurement stops on it. Task stays IN_PROGRESS until then. /dev, 2026-11-19.
