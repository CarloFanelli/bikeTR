# Task 03: labeled-rides-series

## Objective

Both Labeled ride sets carry each ride's compact series, anonymized, and the Tuning set holds the labels the user gave on 2026-11-19.

## Context

**Satisfies**: REQ-10, REQ-11

Thresholds and pattern can be tuned on the Tuning set only if its rides carry their series. The user relabelled the Tuning set without proposals; those labels replace the old ones.

## Depends on

01-keep-ride-series, 02-ride-shape

## Expected Behavior

- The draft command writes each ride's series into new drafts.
- A command adds the series to the existing Tuning set and Check set, finding each ride through the local record.
- The series carries no timestamp, GPS or Strava id; its values move like the ride's other figures.
- The Tuning set's labels are the user's labels of 2026-11-19.
- The measurement computes each Labeled ride's Ride shape from its series with the set's FTP and LTHR.

## Acceptance Criteria

- [ ] Every ride of both sets has its series, or the command names the ride it cannot find (REQ-10)
- [ ] No Labeled ride gains a timestamp, GPS point or Strava id (REQ-10)
- [ ] The Tuning set's labels match the user's 2026-11-19 labels (REQ-11)
- [ ] The measurement reads each Labeled ride's Ride shape (REQ-10)

## Edge Cases

- Labeled ride whose Strava ride is no longer saved → command stops naming it; no series invented (REQ-10)
- Tuning set ride without a label (r37) → measurement stops naming it until labelled (REQ-11)
- N/A — permission: single local user, no roles (REQ-1, REQ-10)
