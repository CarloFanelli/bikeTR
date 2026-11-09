---
feature: tracing
version: 1.0
status: approved
completed: true
base: f01222be1ea4e52dad89dc42728a2eeb4608efa8
---

# Tracing

## Overview

Today a Coach answer leaves only its workout card, or a results file for the live check and the evaluation run. When an answer looks wrong, nothing shows what happened on the way. This feature records every Coach request as a trace in Phoenix, a tracing tool running in its own container next to BikeTR. A trace shows each step with its duration (rides, numbers, paper search, model call, decision), the exact prompt, the papers found, the raw answer, tokens, cost and the decision taken. Traces stay on the computer, never stop the Coach, and the app's traces follow the Strava rule: Disconnect deletes them.

## Project Context

- Phoenix runs as one more container started with the rest of BikeTR; it is free and needs no account.
- Traces are sent with OpenTelemetry, the standard format, so another tool later is a configuration change.
- No Ollama or paid model in development or tests: tests use fake models and a fake trace receiver.
- The live check and the evaluation run in the `coach-tools` container; the user runs them on the Mac.
- The live-check and evaluation results files keep their current fields.
- Disconnecting from Strava already deletes the rides the Coach service saved; traces follow the same rule.
- The development laptop gives WSL 10 GB, so the tracing tool must stay light.

## Functional Requirements

### Traces

- REQ-1: Every Coach request from the Coach screen, the live check and the evaluation run leaves one trace in Phoenix.
- REQ-2: A trace shows each step with its duration: rides download and numbers (Coach screen only), paper search, model call, decision.
- REQ-3: The paper search step records the search text and the papers found, with their scores.
- REQ-4: The model call step records the chat model, the messages sent, the raw answer, input and output tokens, cost, and whether it was cut off.
- REQ-5: The decision step records the protocol the model chose, the protocol given, and the fallback warning when there is one.
- REQ-6: Each trace names its source (Coach screen, live check, evaluation), the minutes requested, the prompt version, and for test runs the situation and repeat.
- REQ-7: A request that fails leaves a trace showing the step that failed and its error message.
- REQ-8: A request stopped by the user leaves a trace marked as stopped, with the dollars charged for it.

### Phoenix

- REQ-9: Phoenix starts with the one-command start of BikeTR, and its screen opens only from the computer itself.
- REQ-10: When Phoenix does not answer, the Coach answers as usual and its log gets one line saying the trace was lost.
- REQ-11: Traces survive a restart of Phoenix and of BikeTR.

### Disconnect

- REQ-12: Disconnecting from Strava deletes the Coach screen's traces started before the disconnect; live check and evaluation traces stay.
- REQ-13: If Phoenix is down at the disconnect, the Coach service deletes those traces as soon as Phoenix answers again.

### Docs

- REQ-14: The README says how to open Phoenix, what a trace holds, which rider data it stores, and that Disconnect deletes it.

## Non-Functional Requirements

- **Performance** — a trace receiver that never answers delays no Coach result by more than 1 second.
- **Security** — Phoenix listens only on 127.0.0.1; the cloud key, Strava tokens and request headers never appear in a trace; traces never leave the computer.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Two tabs ask the Coach at the same time | two separate traces, steps never mixed | REQ-1 |
| An evaluation with `--repeat 3` on 27 situations | 81 traces, one per answer | REQ-1, REQ-6 |
| Strava unreachable, saved rides used | the rides step shows that saved rides were used | REQ-2 |
| The model writes nothing for 3 minutes | the model step ends with the silence error | REQ-2, REQ-7 |
| The paper index is missing or made by another search model | the search step shows the error; no model step follows | REQ-3, REQ-7 |
| An answer cut off at the token limit | the model step records it as cut off | REQ-4 |
| The provider does not report tokens | tokens and cost recorded as unknown | REQ-4 |
| Ollama answer | cost recorded as unknown, as on the workout card | REQ-4 |
| An unreadable answer | no chosen protocol; given protocol and warning recorded | REQ-5 |
| A protocol too long for the minutes | both the chosen and the given protocol recorded | REQ-5 |
| N/A — permission: one user, no roles; anyone at the computer sees every trace | — | REQ-6 |
| A live check situation | source live check and the situation name; repeat only for evaluations | REQ-6 |
| Strava refuses the token or the rides download fails | the rides step shows the error | REQ-7 |
| Stop after the provider accepted the request | stopped, with the partial answer and the dollars charged | REQ-8 |
| Stop before the provider accepted | stopped, $0 charged | REQ-8 |
| Ctrl+C during an evaluation answer | finished answers keep their traces; the one in progress may be lost | REQ-8, REQ-10 |
| Another device on the network opens Phoenix's address | no answer: Phoenix listens only on 127.0.0.1 | REQ-9 |
| Phoenix's port is already taken | it can be changed in `.env`, like the app's port | REQ-9 |
| Tests and checks run with `--no-deps`, so Phoenix is not started | everything works; traces are lost silently in tests | REQ-10 |
| Phoenix still starting up | same as Phoenix down | REQ-10 |
| Phoenix answers after 30 seconds | the Coach never waits; the trace may be lost | REQ-10 |
| An evaluation run while Phoenix is not started | the run completes as usual; one line says traces were lost | REQ-10 |
| `docker compose down`, then up again | traces still there | REQ-11 |
| `docker compose down -v` (volumes deleted) | traces gone, like the saved rides | REQ-11 |
| A Coach request still running when Disconnect is pressed | its trace is deleted too: it started before the disconnect | REQ-12 |
| No Coach screen traces yet | Disconnect works; nothing to delete | REQ-12 |
| Live check and evaluation traces at Disconnect | untouched: made-up athletes, no Strava data | REQ-12 |
| Phoenix still down when the Coach service restarts | the pending deletion survives the restart | REQ-13 |
| Reconnect and new requests before Phoenix returns | only traces started before the disconnect are deleted | REQ-13 |
| Phoenix's data was deleted meanwhile | nothing to delete; the pending deletion is cleared | REQ-13 |
| N/A — concurrent, network: a document, read with no running system | — | REQ-14 |

## Out of Scope

- **A link from the workout card to its trace** — new screen work; Phoenix's own list finds a trace by time and source.
- **Langfuse or another tracing tool** — OpenTelemetry keeps it a configuration change; Phoenix covers the need today.
- **Automatic deletion of old traces** — one user and a few traces a day; `docker compose down -v` or Phoenix's screen empties them.
- **Grading results inside Phoenix** — the evaluation's scores stay in its results files and the README table.
- **The Coach service's other endpoints (status, connection check, Disconnect)** — they produce no workout, so a trace adds nothing to understand an answer.
