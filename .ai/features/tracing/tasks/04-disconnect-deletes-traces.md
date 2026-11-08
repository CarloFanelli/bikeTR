# Task 04: disconnect-deletes-traces

## Objective

Disconnecting from Strava deletes the Coach screen's traces started before the disconnect, now or as soon as Phoenix answers again, and the README explains Phoenix, what a trace holds and that Disconnect deletes it.

## Context

**Satisfies**: REQ-12, REQ-13, REQ-14

Traces of the Coach screen hold numbers computed from the rider's Strava rides, so they follow the Strava rule already applied to the saved rides. The README comes last because it must describe the deletion too.

## Depends on

- Task 02

## Expected Behavior

- "Disconnetti da Strava" deletes, in Phoenix, every Coach screen trace that started before the click; Live check and Evaluation set traces stay.
- The Disconnect button answers as quickly as today, whether Phoenix is up or down.
- With Phoenix down, the Coach service remembers the deletion, also across its own restart, and runs it as soon as Phoenix answers again.
- A Coach request still running at the click leaves no trace in Phoenix afterwards.
- The README says how to open Phoenix, what a trace holds, which rider data it stores, and that Disconnect deletes it.

## Acceptance Criteria

- [ ] Disconnect deletes the Coach screen traces started before it and leaves later ones (REQ-12)
- [ ] Live check and Evaluation set traces survive a Disconnect (REQ-12)
- [ ] With Phoenix down, the deletion runs once Phoenix answers again, even after a Coach service restart (REQ-13)
- [ ] The Disconnect button's answer never waits for Phoenix (REQ-12)
- [ ] The README names Phoenix's address, a trace's contents, the rider data stored and the Disconnect rule (REQ-14)

## Edge Cases

- A Coach request still running when Disconnect is pressed → its trace is deleted too: it started before the disconnect (REQ-12)
- No Coach screen traces yet → Disconnect works; nothing to delete (REQ-12)
- Phoenix opened right after Disconnect → the Coach screen traces disappear within about 10 seconds (REQ-12 · from code)
- Live check and evaluation traces at Disconnect → untouched: made-up athletes, no Strava data (REQ-12)
- Phoenix still down when the Coach service restarts → the pending deletion survives the restart (REQ-13)
- Reconnect and new requests before Phoenix returns → only traces started before the disconnect are deleted (REQ-13)
- Phoenix's data was deleted meanwhile → nothing to delete; the pending deletion is cleared (REQ-13)
- The README is a document read with no running system → no concurrency or network case (REQ-14)
