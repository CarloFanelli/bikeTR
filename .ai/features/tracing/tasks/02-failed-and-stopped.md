# Task 02: failed-and-stopped

## Objective

A Coach request that fails or that the user stops still leaves its trace, showing where and why it ended and what it cost; when Phoenix does not answer, the Coach answers as usual and its log says the trace was lost.

## Context

**Satisfies**: REQ-7, REQ-8, REQ-10

Task 01 records requests that end with a workout. This task covers the other endings (an error, Stop) and the Coach's behavior without Phoenix, including the one-second limit on delays. The Live check and the Evaluation set reuse all of it in Task 03.

## Depends on

- Task 01

## Expected Behavior

- A request that fails leaves a trace whose failing step is marked as failed with the error message the user saw; the steps after it are missing.
- A request stopped with Stop leaves a trace marked as stopped, with the partial answer written so far and the dollars charged for it.
- With Phoenix stopped, starting up or slow, the Coach screen shows the same workout in the same time, give or take one second.
- The Coach service's log gets one line saying traces are being lost, never one line per failed attempt.
- No error message in a trace contains the cloud key, a Strava token or a request header.

## Acceptance Criteria

- [ ] A failing step is marked failed with the error message; no later step appears (REQ-7)
- [ ] A stopped request's trace is marked stopped, with the partial answer and the dollars charged (REQ-8)
- [ ] With a trace receiver that never answers, no Coach result arrives more than 1 second later (REQ-10)
- [ ] With Phoenix down, the Coach answers as usual and its log gets one line saying traces were lost (REQ-10)
- [ ] An error caused by a cloud key or a Strava token never shows the key or the token in the trace (REQ-7)

## Edge Cases

- The Chat model writes nothing for 3 minutes → the Chat model step ends with the silence error (REQ-2, REQ-7)
- The paper index is missing or made by another Search model → the search step shows the error; no Chat model step follows (REQ-3, REQ-7)
- Strava refuses the token or the rides download fails → the rides step shows the error (REQ-7)
- Stop after the provider accepted the request → stopped, with the partial answer and the dollars charged (REQ-8)
- Stop before the provider accepted → stopped, $0 charged (REQ-8)
- Tests and checks run with `--no-deps`, so Phoenix is not started → everything works; traces are lost silently in tests (REQ-10)
- Phoenix still starting up → same as Phoenix down (REQ-10)
- Phoenix answers after 30 seconds → the Coach never waits; the trace may be lost (REQ-10)
- Phoenix down for many requests in a row → one log line when traces start being lost, then nothing until a send succeeds again (REQ-10 · from code)
