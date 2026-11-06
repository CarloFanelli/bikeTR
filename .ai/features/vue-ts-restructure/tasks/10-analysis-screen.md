# Task 10: analysis-screen

## Objective

In the new app, Analisi shows the power curve, fitness trend, heart-rate zones, power profile, FTP trend, FTP and threshold heart-rate breakdown and segment predictions; its charts show exact values on hover, and "Completa da dettagli attività" works.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-16, REQ-19, REQ-20

Analisi carries most of the charts and the segment list whose names were inserted as raw HTML (backlog B-9). It reuses the hover behavior built for the training-load chart in Task 09.

## Depends on

- Task 04
- Task 06
- Task 09

## Expected Behavior

- Every card shows the same content and values as today's Analysis tab.
- Hovering the power-curve, fitness-fatigue-form, heart-rate-zone or FTP-trend chart shows the exact values under the pointer; the small segment sparklines stay static.
- "Completa da dettagli attività" works as today; a second click while it runs does nothing.
- Segment names, in the predictions and in their error list, appear exactly as written.
- Links to activities (power-curve values, FTP breakdown) open their detail inside the app.

## Acceptance Criteria

- [ ] Every card matches today's Analysis tab values (REQ-11)
- [ ] Hovering the power-curve, fitness-fatigue-form, heart-rate-zone and FTP-trend charts shows the exact values under the pointer (REQ-19)
- [ ] "Completa da dettagli attività" works, and a second click while running does nothing (REQ-12)
- [ ] Segment names in the predictions and in the error list appear exactly as written (REQ-20)
- [ ] Links to activities open their detail inside the app (REQ-16)

## Edge Cases

- Athlete with no rides, or with no power meter → same messages as today, in the new layout (REQ-11 from the spec edge-case table)
- Chart with no data (e.g. no power meter: empty power curve) → today's empty message instead of the chart (REQ-19)
- Pointer between two points → values of the nearest point (REQ-19)
- A long action ("Completa da dettagli attività") clicked twice → the button stays disabled while it runs; the second click does nothing (REQ-12)
- Strava fails or hits its request limit during a long action → today's message; what was already downloaded is kept (REQ-12)
- Names containing `<`, `&`, quotes or emoji → shown literally (REQ-20)

## Notes from implementation

- **Impacts Task 10**: to show the same values as today, the Form card's observations and the heart-rate zones card take threshold and FTP from `resolveHr(settings, undefined, segmentEstimates, now)`, without estimates from activities. The other cards pass the activities. Today's `analysis.js` (`formInsights`, `buildHrZones`) does it this way and the recorded results depend on it. The FTP history is read and saved with `loadFtpHistory`/`saveFtpHistory` in `web/src/data/storage.ts`, and `nextFtpHistory` computes the next one. /dev, 2026-11-06.
