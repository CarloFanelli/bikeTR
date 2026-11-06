# Task 08: home-and-activities

## Objective

In the new app, Home shows the athlete profile, all-time stats and data accuracy, with "Aggiorna con streams" and the JSON export; Attività lists the recent activities and opens each one's detail (map, splits, segments) inside the app.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-15, REQ-16, REQ-20

Home and the activity detail show the most Strava text (athlete, activity and segment names), so the raw-HTML fix lands here first. The activity detail stops being a separate page; Task 12 sends old links to it.

## Depends on

- Task 04
- Task 06

## Expected Behavior

- Home shows the same profile, all-time stats and data-accuracy values as today.
- "Aggiorna con streams" and the JSON export work as today; a second click while one runs does nothing, and switching section does not stop them.
- Attività lists the 15 most recent activities; clicking one opens its detail inside the app, with map, per-kilometer splits and segments with KOM/PR badges, and a way back.
- Each activity detail has its own address: reloading reopens it, Back returns to the list.
- Strava names appear exactly as written.

## Acceptance Criteria

- [ ] Home shows the same profile, all-time stats and data-accuracy values as today's app (REQ-11)
- [ ] "Aggiorna con streams" and the JSON export work, and a second click while running does nothing (REQ-12)
- [ ] Clicking an activity opens its detail inside the app, with map, splits and segments with KOM/PR badges (REQ-16)
- [ ] An activity detail has its own address; reload reopens it and Back returns to the list (REQ-15)
- [ ] Strava names appear exactly as written: a segment named `<b>Muro</b>` shows those characters (REQ-20)

## Edge Cases

- Values shown rounded (TSS, IF, W/kg) → same rounding as today (REQ-11 from the spec edge-case table)
- Athlete with no rides, or with no power meter → same messages as today, in the new layout (REQ-11)
- A long action ("Aggiorna con streams", JSON export) clicked twice → the button stays disabled while it runs; the second click does nothing (REQ-12)
- Strava fails or hits its request limit during a long action → today's message; what was already downloaded is kept (REQ-12)
- Switching section during a streams refresh or a JSON export → it keeps running and shows its progress or result on return, as today (REQ-15)
- Address of an activity that doesn't exist or isn't the connected athlete's → "Attività non trovata" with a link to the list (REQ-15)
- Reload of an activity detail while Strava is unreachable → today's activity-page error message (REQ-15)
- Indoor ride without GPS → no map, as today; splits and segments shown (REQ-16)
- Map tiles fail to load → details, splits and segments still shown; the map area stays empty (REQ-16)
- Names containing `<`, `&`, quotes or emoji → shown literally (REQ-20)
- Empty segment or activity name → today's placeholder (e.g. the activity number) (REQ-20)
