# Task 01: load-history-tool

## Objective

With the ride tools setting on, the Chat model can ask for the Load history during a Draft and read the last 8 weeks and the last 14 days, each ride with its ride code.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, REQ-8

This task brings the setting, the call loop with its own limit, the progress step and the Trace note; the Ride shape tool (task 02) plugs into the same loop. With the setting off nothing changes, so the Coach stays as today until the user turns it on.

## Depends on

None

## Expected Behavior

- With the setting off (or missing), the Chat model gets no Ride tool, the prompt and its version are those of today.
- With the setting on, the Chat model can call the Load history in every Draft, with fixed or model Search mode; with model Search mode it sees the paper search tool too.
- The Load history has one line per Monday–Sunday week for the last 8 weeks (hours, training load, rides, CTL at week end) and one line per each of the last 14 days, with each bike ride's duration, training load and ride code.
- Each call shows a step on the Coach screen and is saved in the Trace with what was asked.
- At most 4 Ride tool calls per Draft, counted apart from Model searches.

## Acceptance Criteria

- [ ] With the setting off, the Draft's messages, tools and prompt version are identical to today's. (REQ-1)
- [ ] With the setting on, the Load history tool is offered in both Search modes. (REQ-2)
- [ ] The Load history lists 8 weeks with hours, training load, rides and CTL at week end. (REQ-3)
- [ ] The Load history lists 14 days, each bike ride with duration, training load and a ride code, never its Strava id or name. (REQ-4)
- [ ] A fifth Ride tool call gets a refusal; the 3 Model searches stay available. (REQ-7)
- [ ] Each call emits a progress step and a Trace note naming the tool asked. (REQ-8)

## Edge Cases

- Setting with an unknown value → the Coach service refuses to start and names the allowed values (REQ-1)
- Setting on, Search mode model → paper search tool and Ride tools offered together (REQ-2)
- Chosen Chat model cannot call tools → the request stops with a message saying to pick another model or turn the ride tools off in .env, as with model Search mode; this replaces the spec row "answers as today" (REQ-2 · from code)
- Fewer than 8 weeks of saved rides → earlier weeks listed with zero hours and zero rides (REQ-3)
- Week in progress → it is the last line, marked partial with the days counted so far (REQ-3)
- No bike ride in the last 14 days → every day line says no ride (REQ-4)
- Two rides the same day → both on that day's line, each with its own ride code (REQ-4)
- Other sports → counted in the week's load and hours, listed by type without a ride code (REQ-3, REQ-4)
- 4 refusals in a row → the Draft ends without an answer and the Fallback rules decide (REQ-7)
- Cloud model reaches the Spending cap during calls → no further turn, the Fallback rules decide (REQ-7)
- Trace deletion on Strava disconnect → Ride tool calls are deleted with the rest of the Trace (REQ-8)
