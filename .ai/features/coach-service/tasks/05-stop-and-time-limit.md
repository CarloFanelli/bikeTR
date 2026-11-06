# Task 05: stop-and-time-limit

## Objective

The Coach waits as long as the model keeps writing, gives up only after 3 minutes of silence, and every abandoned request also stops Ollama within 5 seconds.

## Context

**Satisfies**: REQ-12, REQ-13

An abandoned answer that kept running in Ollama is what held the Mac's processor at 100%. With the answer now streamed (Task 04), the time limit can measure silence instead of total time, and closing the connection can reach Ollama.

## Depends on

- Task 04

## Expected Behavior

- The Coach gives up only after 3 minutes with no new text from the model, including the wait before the first word; total time is unlimited while text keeps arriving.
- An answer longer than 1,000 tokens is stopped and the fallback rules pick the protocol.
- A new request in the same tab, a reload, a closed tab or the time limit stops Ollama's work on that answer within 5 seconds.
- Another tab's request is not affected.

## Acceptance Criteria

- [ ] With text arriving steadily, a request lasting more than 3 minutes completes (REQ-12)
- [ ] With no text for 3 minutes, the tab shows "Il modello non ha scritto nulla per 3 minuti" and the README pointer (REQ-12)
- [ ] After a new request, a reload or a closed tab, Ollama stops the previous answer within 5 seconds (REQ-13)
- [ ] After the time limit, Ollama stops that answer within 5 seconds (REQ-13)
- [ ] Closing one of two running tabs stops only that tab's answer (REQ-13)

## Edge Cases

- Model writes nothing for 3 minutes, including before its first word → stops with "Il modello non ha scritto nulla per 3 minuti" and a pointer to the README's slow-computer section (REQ-12 from the spec edge-case table)
- Model keeps writing past 1,000 tokens → stopped; today's fallback rules pick the protocol, with the warning badge (REQ-12)
- Model returns an empty answer → today's fallback rules pick the protocol, with the warning badge (REQ-12)
- New request in the same tab while the previous one runs → the previous one stops; only the new one continues (REQ-13)
- Ollama already finished when the stop arrives → nothing happens; no error shown (REQ-13)
- Two tabs running, one closes → only the closed tab's answer stops (REQ-13)
- Connection between browser and service drops mid-answer → the tab shows "Connessione col Coach interrotta"; the service stops Ollama (REQ-11)

## Notes from implementation

- **Known limitation**: the browser side of stopping has no committed test, because the project has no browser test suite. It was checked by hand in Node with the real `coach.js` and a fake service: two quick clicks show only the second result, and the old result never appears while the second request runs (this check fails when the guard against late events is removed). A stream ending without a result, or a connection dropped mid-answer, shows "Connessione col Coach interrotta". A service that is down shows "Coach non raggiungibile". The silence message shows the README pointer, and a stop after the answer finished shows no error. The service side is covered by `tests/test_cancel.py`. /dev, 2026-11-06.
