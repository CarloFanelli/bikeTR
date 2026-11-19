# Task 05: activity-label-badge

## Objective

With Ride labels on, every bike ride in Attività shows its Ride label as a badge, with no model call.

## Context

**Satisfies**: REQ-15, REQ-16, REQ-17, REQ-18

Attività lists the whole history, while the Label model only ever sees the last 7 days. Old rides take the Label rule's label, free and immediate; a saved Label model label wins where one exists.

## Depends on

Task 01

## Expected Behavior

- Attività asks the Coach for the labels of the listed rides, with today's FTP and LTHR, as it asks for their load.
- Each bike ride with power or heart rate shows a badge with its Ride label.
- The badge shows the saved Label model label when one exists, otherwise the Label rule's.
- With Ride labels off, the Coach returns no labels and Attività shows no badge.
- The README describes the badge.

## Acceptance Criteria

- [ ] With labels on, a bike ride with heart rate shows a badge with its Ride label (REQ-15)
- [ ] A ride with a saved Label model label shows that label, not the rule's (REQ-16)
- [ ] With labels off, no ride shows a badge (REQ-17)
- [ ] Opening Attività makes no Label model call (REQ-15)
- [ ] The README describes the badge (REQ-18)

## Edge Cases

- Attività ride with no power and no heart rate → no badge (REQ-15)
- FTP changed since an old ride → badge uses today's FTP and LTHR (REQ-16)
- Coach service unreachable when Attività opens → rides shown without badges, as today (REQ-15, REQ-17)
- N/A — permission: single local user, no roles (REQ-15)
