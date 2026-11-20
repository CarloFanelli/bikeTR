---
feature: ride-tools
version: 1.0
status: approved
completed: true
base: 01b2e7d9bb87a7e347222f09ec0d859cd0f33e5c
---

# Ride Tools

## Overview

Today the **Chat model** sees only the averages of the last 7 days' rides and today's CTL, ATL and TSB. A ride with easy averages and three blocks in Z4 looks like an endurance ride, and a load that grew too fast over a month is invisible. This feature gives the Chat model two **Ride tools** it can call during a **Draft**: the **Load history** (the last 8 weeks and the last 14 days) and the **Ride shape** of one ride from the last 14 days. A Coach setting turns them on, off by default. The **Evaluation set** gains made-up histories and shapes, plus situations where only the tools reveal the right choice, and a run with the tools on is compared with a run with them off.

## Project Context

- The Ride shape already exists: computed from the saved 15-second series with today's FTP and LTHR, never stored.
- The Coach service already computes each day's training load and CTL over the last 90 days from saved activities.
- Model searches (paper searches the Chat model asks for) keep working as today, with their own limit of 3 per Draft.
- Settings live in `.env`, like the Search mode and Ride labels; the browser never chooses them.
- Ollama's local models and cloud models reached through the OpenAI-compatible endpoint must both be able to call the tools.
- Tests use fake models only; no paid model call without the user's OK.
- The repository is public: Evaluation set data stays made up, with no real ride, date or Strava id.

## Functional Requirements

### Setting

- REQ-1: With the ride tools setting off (the default), the Chat model receives no Ride tool and the Coach answers exactly as today.
- REQ-2: With the setting on, the Chat model can call both Ride tools in every Draft, with either Search mode.

### Load history

- REQ-3: The Load history returns one line for each of the last 8 Monday–Sunday weeks: hours, training load, number of rides, CTL at week end.
- REQ-4: The Load history also returns one line for each of the last 14 days, listing each bike ride's duration, training load and ride code.

### Ride shape

- REQ-5: The Ride shape tool returns a ride's Hard blocks with duration and zone, recoveries, minutes per zone and load per hour.
- REQ-6: The Ride shape tool opens only bike rides of the last 14 days; any other code gets a short refusal naming that window.

### Limits and visibility

- REQ-7: At most 4 Ride tool calls per Draft, counted apart from Model searches; each further call gets a refusal and the Draft continues.
- REQ-8: Each Ride tool call shows a progress step on the Coach screen and is saved in the Trace with what was asked.

### Evaluation

- REQ-9: Every Evaluation set situation carries a made-up 8-week Load history and 14 days of rides with their Ride shapes, served by the tools.
- REQ-10: The Evaluation set gains at least 4 situations whose right protocols depend on something only the Ride tools show.
- REQ-11: An Evaluation set run records whether the Ride tools were on, and how many calls each answer made.
- REQ-12: The eval runs README records the grade of one Chat model with the tools off and on; the setting stays off whatever the result.

## Data & Dependencies

### Information the feature must retain

- Ride tool calls of a Draft — what the model asked and what it got back, kept in the Trace for as long as Traces are kept today.
- Situation histories — the made-up Load history and ride shapes of each Evaluation set situation, part of the set file in the repository.

### External capabilities relied on

- Tool calling of the Chat model — the same capability Model searches use, for both local and cloud models.

## Non-Functional Requirements

- **Security** — No Strava activity id, ride name or GPS data reaches the Chat model through the tools: rides are named by a ride code valid only within the request.
- **Performance** — A Ride tool answer is built from saved data in under 200 ms; no tool call contacts Strava.
- **Validation** — A Ride tool answer stays under 2,000 characters, so a small local model can read it.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Setting has an unknown value | The Coach service refuses to start and names the allowed values, like the other settings | REQ-1 |
| Setting on, Search mode model | The model sees the paper search tool and both Ride tools together | REQ-2 |
| The chosen Chat model cannot call tools | The Draft gets no tool answer; the Coach answers as it does today when a model ignores tools | REQ-2 |
| Athlete with fewer than 8 weeks of saved rides | Weeks before the first saved ride are listed with zero hours and zero rides | REQ-3 |
| Week in progress (today is Wednesday) | The current week is the last line, marked as partial with the days counted so far | REQ-3 |
| No bike ride in the last 14 days | The 14 day lines all say no ride; the Ride shape tool has nothing to open | REQ-4 |
| Two rides on the same day | Both are listed on that day's line, each with its own ride code | REQ-4 |
| Other sports (run, hike) | Counted in the week's training load and hours, listed by type without a ride code | REQ-3, REQ-4 |
| Ride without saved series (details not downloaded yet) | The tool says the shape is not available yet and gives the ride's averages | REQ-5 |
| Ride with neither measured power nor heart rate | The tool says no shape can be computed for that ride | REQ-5 |
| FTP or LTHR missing from the Athlete profile | Zones from the missing value are left out; the tool says which | REQ-5 |
| Ride code from 15 days ago, unknown or malformed | Short refusal naming the 14-day window; counts toward the 4 calls | REQ-6 |
| Same ride asked twice in one Draft | Answered again; counts as a second call | REQ-7 |
| Fifth Ride tool call | Refused with a message saying the limit is reached; the paper search limit is not touched | REQ-7 |
| 4 refusals in a row | The Draft ends without an answer, as with Model searches, and the Fallback rules decide | REQ-7 |
| Cloud model reaches the Spending cap during tool calls | No further turn; the Fallback rules decide, as today | REQ-7 |
| Trace deletion on Strava disconnect | Ride tool calls are deleted with the rest of the Trace | REQ-8 |
| Situation missing its history (old file) | The Evaluation set refuses to run and names the situation | REQ-9 |
| New situation solvable from the averages alone | Not accepted: each new situation states which tool answer changes the allowed protocols | REQ-10 |
| Run with tools on and a model that never calls them | The run records zero calls per answer; the grade is still compared | REQ-11 |
| N/A — concurrent: tool answers read saved data only and write nothing | — | REQ-3, REQ-5 |
| N/A — permission: the Coach serves one local athlete, every request already sees all their rides | — | REQ-6 |

## Out of Scope

- **Turning the tools on by default** — a separate decision after the measurement, as for Ride labels.
- **Minute-by-minute heart rate and power in the tool answer** — the shape is shorter and already computed; a small model would get lost in 90 numbers.
- **Rides older than 14 days** — they matter little for today's choice and would let the model wander through hundreds of rides.
- **Ride labels inside the tool answers** — labels are not reliable yet (70% on the Check set).
- **New tools beyond these two** (for example segments or records) — no present need.
