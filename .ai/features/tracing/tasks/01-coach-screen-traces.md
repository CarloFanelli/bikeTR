# Task 01: coach-screen-traces

## Objective

Phoenix starts with BikeTR, opens only from this computer and keeps its traces across restarts; every Coach screen request leaves one trace there with each step, its duration and what the Coach saw, sent and decided.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-9, REQ-11

The core of the feature: Phoenix running and the Coach screen's happy path fully recorded. Failures, Stop and a missing Phoenix come in Task 02; the Live check and the Evaluation set in Task 03; Disconnect in Task 04.

## Depends on

None

## Expected Behavior

- `docker compose up -d` also starts Phoenix; its screen opens at `http://localhost:6006` (or the port set in `.env`) from this computer only.
- A Coach screen request leaves exactly one trace in Phoenix's Coach screen project, named as coming from the Coach screen, with the minutes requested and the prompt version.
- The trace shows four steps in order, each with its duration: rides and numbers, paper search, Chat model call, decision.
- The rides step says whether the rides came from Strava or from the saved rides.
- The paper search step shows the search text and the papers found, each with its PMID, title and score.
- The Chat model step shows the Chat model, the messages sent, the raw answer, tokens read and written, the cost and whether the answer was cut off.
- The decision step shows the protocol the Chat model chose, the protocol given and the fallback warning when there is one.
- The workout card, the Live check and Evaluation set results files are unchanged.

## Acceptance Criteria

- [ ] One Coach screen request leaves one trace with the four steps in order, each with a duration (REQ-1, REQ-2)
- [ ] The paper search step holds the search text and each paper's PMID, title and score (REQ-3)
- [ ] The Chat model step holds model, messages, raw answer, both token counts, cost and cut-off flag (REQ-4)
- [ ] The decision step holds the chosen protocol, the given protocol and the fallback warning (REQ-5)
- [ ] The trace names its source, the minutes requested and the prompt version (REQ-6)
- [ ] Phoenix starts with `docker compose up -d`, answers only on 127.0.0.1, and keeps traces after `docker compose down` and up (REQ-9, REQ-11)

## Edge Cases

- Two tabs ask the Coach at the same time → two separate traces, steps never mixed (REQ-1)
- Strava unreachable, saved rides used → the rides step shows that saved rides were used (REQ-2)
- An answer cut off at the token limit → the Chat model step records it as cut off (REQ-4)
- The provider does not report tokens → tokens and cost recorded as unknown (REQ-4)
- Ollama answer → cost recorded as unknown, as on the workout card (REQ-4)
- An unreadable answer → no chosen protocol; the given protocol and the warning recorded (REQ-5)
- A protocol too long for the minutes → both the chosen and the given protocol recorded (REQ-5)
- One user, no roles → anyone at the computer sees every trace (REQ-6)
- Another device on the network opens Phoenix's address → no answer: Phoenix listens only on 127.0.0.1 (REQ-9)
- Phoenix's port is already taken → it can be changed in `.env`, like the app's port (REQ-9)
- `docker compose down`, then up again → traces still there (REQ-11)
- `docker compose down -v` → traces gone, like the saved rides (REQ-11)
