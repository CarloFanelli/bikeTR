# Task 03: coach-redesign

## Objective

Coach AI shows only what the athlete needs — duration, "Genera workout di oggi", the workout's title, target power and steps — with the reasoning and cited papers in an Info panel and the developer details in a closed **Dietro le quinte** section.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-16, REQ-17, REQ-18, REQ-19

Coach AI mixes the workout with model internals (context sent, raw output, search scores, timings). The user studies those parts, so they move into Dietro le quinte rather than away. The run keeps going across sections as today.

## Depends on

None

## Expected Behavior

- Heading "Coach AI" with one line on where the data goes (local model or cloud).
- Duration field and "Genera workout di oggi"; while running, the current step and a Stop button.
- The workout: title, target power, numbered steps; "Perché questo workout" opens an Info panel with the reasoning and the cited papers with their quotes and links.
- Fallback warning, model attempts, dropped citations and ride-source notes show as one-line notices; their full text in an Info panel.
- A closed Dietro le quinte section at the bottom: context sent, raw output, papers found with scores, model and timings.
- No emoji; at 360 px one column.

## Acceptance Criteria

- [ ] Duration and "Genera workout di oggi" open the screen; a run shows its step and Stop (REQ-16)
- [ ] Title, target power and steps on the page; reasoning and cited papers with links in an Info panel (REQ-17)
- [ ] Dietro le quinte is closed by default and holds context, raw output, papers with scores, model and timings (REQ-18)
- [ ] Fallback warning and Coach errors show as one-line notices with full text in an Info panel (REQ-19)
- [ ] No emoji and no visible text block over 30 words; nothing shown today is lost (REQ-1, REQ-3, REQ-4)

## Edge Cases

- Coach notes with emoji (attempts, dropped citations, ride source) → line icon or dropped (REQ-1)
- Width 360 px with the steps and the raw output → steps wrap; raw output scrolls inside its block (REQ-2)
- Coach reasoning longer than 30 words → page shows the start, cut at a sentence end; full text in the Info panel (REQ-3)
- Error message longer than 30 words → allowed: error notices are exempt (REQ-3)
- Duration outside 30–300 min → field shows its limit; generation does not start, as today (REQ-16)
- "Genera" clicked while a run is going → ignored until it ends or is stopped (REQ-16)
- Coach service unreachable → error notice in plain words, detail in the Info panel (REQ-16)
- Athlete presses Stop → "Richiesta interrotta" notice; no workout shown (REQ-16)
- Workout with no cited papers → no papers part in the Info panel (REQ-17)
- Workout with no target power → target line hidden; steps shown (REQ-17)
- No run yet → Dietro le quinte reads "Nessuna richiesta ancora: il contesto compare quando generi un workout"; the context exists only once a run starts (REQ-18 · from code)
- Context not available (Coach status fails) → Dietro le quinte says it is not available (REQ-18)
- Workout from the fallback rules → notice "Workout dalle regole di riserva", reason in the panel (REQ-19)
- Fallback warning and Coach error at the same time → error notice first, then the warning (REQ-19)
