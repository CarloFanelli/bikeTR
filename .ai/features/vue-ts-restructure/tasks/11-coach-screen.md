# Task 11: coach-screen

## Objective

In the new app, Coach AI asks the **Coach service** for today's workout, shows the running step and the answer as it arrives, and has a Stop button; automated tests cover reading the answer and cancelling older requests.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-15, REQ-27, REQ-28, REQ-29

The Coach screen ports what the Coach service feature delivered, plus a Stop button and the tests that were done only by hand then (backlog B-17, B-18). The service already stops Ollama when the browser abandons a request, so Stop needs no service change. The **athlete profile** it sends uses the values Impostazioni and the calculations provide.

## Depends on

- Task 05
- Task 07

## Expected Behavior

- "Genera workout di oggi" sends the duration, model and **athlete profile**, then shows the running step, the model's text as it arrives, and the result card, rationale, papers and raw answer as today.
- A Stop button shows only while a request runs; Stop ends it, keeps the text written so far with "Richiesta interrotta", and Ollama stops within 5 seconds.
- A new request or Stop cancels the older one; none of its late events are drawn.
- Switching section while the Coach answers does not stop it; returning shows its progress or result.
- Automated tests feed made-up streams to the answer reader and the cancellation logic.

## Acceptance Criteria

- [ ] "Genera workout di oggi" shows the steps, live text and result as today's Coach tab (REQ-11, REQ-12)
- [ ] Stop ends the running request, keeps the text with "Richiesta interrotta", and Ollama stops within 5 seconds (REQ-29)
- [ ] Tests show answers whose lines or characters are split between chunks are read correctly (REQ-27)
- [ ] Tests show a new request or Stop cancels the older one, with no late events drawn (REQ-28)
- [ ] Switching section during an answer keeps it running, and returning shows it (REQ-15)

## Edge Cases

- Switching section during a Coach answer → it keeps running and shows its progress or result on return, as today (REQ-15 from the spec edge-case table)
- A character such as "è" or an emoji split between two chunks → shown whole (REQ-27)
- One event line split across three or more chunks → read as one event (REQ-27)
- The stream ends without its final event → "Connessione col Coach interrotta", as today (REQ-27)
- A late event of the older request arrives after the new one started → ignored (REQ-28)
- The older request's refusal is read after it was cancelled → nothing is drawn over the new request (REQ-28)
- N/A — network, permission: the tests feed made-up streams; no service runs (REQ-27, REQ-28)
- Nothing is running → no Stop button is shown (REQ-29)
- After Stop → the text written so far stays, with "Richiesta interrotta"; no workout card (REQ-29)
- Stop while ride details are downloading → details already downloaded are kept, as the Coach service does today (REQ-29)
- Stop and the end of the answer happen together → whichever comes first wins; no error is shown (REQ-29)
- Two tabs running, Stop in one → only that tab's answer stops (REQ-29)
