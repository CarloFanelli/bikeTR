# Task 01: keep-ride-series

## Objective

Every saved bike ride with power or heart rate keeps a compact copy of its power and heart-rate data, including rides saved before this feature.

## Context

**Satisfies**: REQ-1, REQ-5

The Coach downloads each ride's second-by-second data and keeps only four numbers. The Ride shape needs the whole ride, so a compact series is kept beside Ride details, and older rides are downloaded again in background.

## Depends on

None

## Expected Behavior

- A ride downloaded from now on keeps its power and heart rate as averages over short steps, beside its Ride details.
- A ride saved before this feature is downloaded again in background, oldest work last, within the Strava budget.
- The series of a 4-hour ride holds under 1,000 points per signal.
- A ride deleted with "Disconnetti da Strava" or on Strava loses its series too.

## Acceptance Criteria

- [ ] A new download saves the ride's compact series together with its Ride details (REQ-1)
- [ ] A ride with Ride details but no series is picked by the background download (REQ-5)
- [ ] A 4-hour ride's series has under 1,000 points per signal (REQ-1)
- [ ] The background download still stops at the Strava budget and resumes later (REQ-5)
- [ ] Disconnecting deletes saved series (REQ-1)

## Edge Cases

- Heart-rate dropouts or zeros → kept as gaps, not as low values (REQ-1, REQ-3)
- Strava limit reached while downloading again → stops and resumes in the next quarter hour, as today (REQ-5)
- Ride deleted on Strava or download refused → keeps its old Ride details, no series (REQ-5, REQ-9)
- Downloading again while the user syncs → same budget, the same ride never downloaded twice at once (REQ-5)
