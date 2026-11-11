# Task 02: activities-redesign

## Objective

The Attività list and the Dettaglio attività screen use direction B: rows with a sport icon, a detail header with back link, readable KOM and PR badges.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-13, REQ-14, REQ-15

Two small screens with little text; the work is the sport icons (types beyond bike, run and swim), the header and the badges, which today use a fixed gold.

## Depends on

None

## Expected Behavior

- Attività: heading, then the 15 most recent activities; each row has a sport line icon, name, date, distance and moving time, and opens its detail.
- Dettaglio attività: back link to Attività, name with sport icon and date, then key metrics, map, per-km splits and segments, each in its card.
- Segment rows show KOM and PR positions as badges readable in light and dark.
- No emoji anywhere on either screen; at 360 px one column.

## Acceptance Criteria

- [ ] Each list row shows sport icon, name, date, distance and moving time, and opens its detail (REQ-13)
- [ ] The detail opens with back link, name, sport icon and date, then metrics, map, splits and segments (REQ-14)
- [ ] KOM and PR badges meet the contrast target in both themes (REQ-15)
- [ ] No emoji on either screen; every value shown today is still reachable (REQ-1, REQ-4)
- [ ] At 360 px wide no page-wide horizontal scroll (REQ-2)

## Edge Cases

- Activity type with no matching icon (e.g. Yoga) → generic activity icon (REQ-1)
- Width 360 px with splits → splits fit or scroll inside their card; the page does not (REQ-2)
- Error message longer than 30 words → allowed: error notices are exempt (REQ-3)
- Value shown today only under a condition (KOM badge, average heart rate) → same condition still shows it (REQ-4)
- Fewer than 15 activities → lists those there are (REQ-13)
- No activities at all → "Nessuna attività" message (REQ-13)
- Activity with no name → existing fallback name (REQ-13)
- Activity with no distance (strength, yoga) → row shows moving time only (REQ-13)
- Detail opened for an unknown or someone else's id → "Attività non trovata" with link back, as today (REQ-14)
- Detail download fails → error notice with the back link (REQ-14)
- Activity with no GPS track (indoor) → map hidden; the rest shown (REQ-14)
- Activity with no splits or no segments → that card hidden (REQ-14)
- Segment with both KOM and PR → both badges (REQ-15)
- Very long segment name → wraps; badges stay beside or below it (REQ-15)
