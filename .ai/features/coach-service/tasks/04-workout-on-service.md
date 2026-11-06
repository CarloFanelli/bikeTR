# Task 04: workout-on-service

## Objective

"Genera workout di oggi" asks the **Coach service**, which builds the workout from your rides and **athlete profile** exactly as the browser did, while the tab shows each step and the model's text as it arrives.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-11, REQ-17, REQ-18

This is the switch: the protocol catalog, prompts, paper search and fallback rules move from the browser to the service, and the browser keeps only the request and the drawing. Their results are captured from today's browser code before it is removed, so the tests compare against the real old behavior.

## Depends on

- Task 03

## Expected Behavior

- The Generate button sends the duration, the model name and the athlete profile to the Coach service.
- The tab names the running step (rides, ride details with progress, papers, model) and shows the model's text while it is written.
- The finished result looks as today: workout card, rationale, cited and retrieved papers, model name, time, tokens and raw answer.
- Invalid answers, unknown protocols and too-short durations fall back exactly as today.
- The browser no longer contains the protocol catalog, the prompts or the paper search.

## Acceptance Criteria

- [ ] Generate sends duration, model name and athlete profile; the service answers with the workout (REQ-1, REQ-2)
- [ ] For a fixed context and papers, the service's prompts equal today's browser prompts character for character (REQ-3)
- [ ] For a fixed model answer, protocol, watts, steps, rationale and cited papers equal today's browser result (REQ-4)
- [ ] The result shows everything today's card shows (REQ-5)
- [ ] The tab names each step, shows detail-download progress and the model's text as it arrives (REQ-11)
- [ ] Tests: the fallback choice and every protocol's watts and steps match the browser code at several FTPs and durations (REQ-17)
- [ ] Test: a fixed query vector returns the browser code's four papers in the same order (REQ-18)

## Edge Cases

- Duration below 20 or above 240 minutes → refused before any download: "La durata deve essere tra 20 e 240 minuti" (REQ-1 from the spec edge-case table)
- FTP missing from the profile → today's "FTP non disponibile" message; no Strava download, no model call (REQ-1)
- Coach service not running or not answering → "Coach non raggiungibile: avvia BikeTR con docker compose up -d" (REQ-1)
- Request coming from another website → refused; nothing downloaded, no model call (REQ-1)
- Two tabs ask for a workout at the same time → both are served; neither cancels the other; the second may wait for the model (REQ-1)
- Threshold or max heart rate, weight or weekly hours empty → same defaults and skipped calculations as today (REQ-2)
- A profile value that is not a positive number → refused, naming the field (REQ-2)
- Paper index missing or unreadable → error naming the file and how to restore it, as today (REQ-3)
- Ollama unreachable or embedding model missing during the paper search → "Errore retrieval paper" with today's checklist, updated for the service (REQ-3)
- Model answer not valid JSON, or naming an unknown protocol → today's deterministic fallback, with the warning badge (REQ-4)
- Duration too short for the chosen protocol → falls back to Z2 endurance with today's note (REQ-4)
- Answer cites unknown papers → ignored as today; the protocol's source paper is always added (REQ-4)
- Model cites no papers → only the protocol's source paper is shown (REQ-5)
- No activities at all → the Coach still answers (REQ-6)
- First request downloads 40 ride details → the tab shows the progress, e.g. "Scarico dettagli corse 12/40" (REQ-11)
- Model not installed in Ollama → error naming the model and the command that downloads it (REQ-14)
- Duration exactly at a protocol's minimum, and one minute below → same workout or same "too short" result as the browser code (REQ-17)
- Two papers with identical scores → same order as the browser code (REQ-18)
- Browser and service in different time zones → the request carries the browser's time zone; ride days and "OGGI" in the prompt follow it, as in today's browser Coach (REQ-3 · from code)

## Notes from implementation

- **Known limitation**: the browser's stream reader (`coachEvents` in `coach.js`) has no committed test, because the project has no browser test suite. It was checked by hand in Node: three events with accented letters and an emoji were cut into chunks at 3,075 different byte positions, plus a last line without a newline, and every case rebuilt the same events. The service side of the stream is covered by `tests/test_workout.py`. /dev, 2026-11-06.
