# Task 02: ride-shape

## Objective

From a ride's compact series and today's FTP and LTHR, the Coach finds the ride's Hard blocks, the recoveries between them and its minutes per zone.

## Context

**Satisfies**: REQ-2, REQ-3, REQ-4

The Ride shape is what the Label rule and Label model will read. It is computed when needed, never saved, so a new FTP or LTHR changes it without downloading anything.

## Depends on

01-keep-ride-series

## Expected Behavior

- A Hard block is at least 1 minute above Z2: power from 76% of FTP when a power meter measured it, otherwise heart rate from 85% of LTHR.
- The Ride shape lists each Hard block with duration and highest zone reached, each recovery after it, and minutes per zone.
- The same series gives a different Ride shape with a different FTP or LTHR.

## Acceptance Criteria

- [ ] A 50-second effort above Z2 is not a Hard block (REQ-2)
- [ ] With a power meter, blocks come from power; with estimated power, from heart rate (REQ-2)
- [ ] Ride shape lists blocks (duration, zone), recoveries and minutes per zone (REQ-3)
- [ ] Changing FTP or LTHR changes the Ride shape of the same saved series (REQ-4)

## Edge Cases

- Ride with power meter and heart rate → blocks from power; heart rate only where power is missing (REQ-2)
- Ride with only Strava-estimated power → blocks from heart rate only (REQ-2)
- Two blocks joined by a 20-second dip → one block (REQ-2, REQ-3)
- Heart-rate dropouts → ignored, not counted as recovery (REQ-1, REQ-3)
- No LTHR saved → no heart-rate blocks (REQ-2, REQ-9)
- No FTP saved → no power blocks; heart rate used (REQ-2)
- FTP changed since the ride → shape computed with today's FTP, no download (REQ-4)
