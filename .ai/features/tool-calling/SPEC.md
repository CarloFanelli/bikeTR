---
feature: tool-calling
version: 1.0
status: approved
completed: true
base: cd7bc5abf4ede50eead2bef34d24bcde473b1959
---

# Tool Calling — the chat model searches the papers itself

## Overview

Today the Coach finds the papers before the Draft, with a search text the code builds from the athlete's form, and puts them in the prompt. This feature adds a second Search mode: the prompt carries no papers and the Chat model gets a paper-search tool, writing its own search text up to 3 times per Draft. A `.env` setting picks the mode for the Coach screen, the Live check and the Evaluation set, so the two modes can be compared row against row in the README table: answer quality, search score, latency and cost.

## Project Context

- The Coach graph (rides, metrics, papers, Draft, Check, deliver, up to 3 Drafts) stays; only how papers reach the Draft changes.
- Both Chat model providers must work: Ollama and the OpenAI-compatible cloud endpoint.
- Fixed mode stays the default and must behave exactly as today.
- Only the paper search becomes a tool: Evaluation set situations hold athlete numbers and recent rides, nothing more, so no other tool could be measured.
- Development and automated tests use fake models only; real runs are started by the user.
- Spending cap and Fallback rules keep their current meaning.

## Functional Requirements

### Search mode setting

- REQ-1: A `.env` setting chooses the Search mode, fixed or model; missing or empty means fixed.
- REQ-2: An unknown Search mode value makes every Coach request fail with a message naming the setting and its two values.
- REQ-3: The Search mode applies to the Coach screen, the Live check and the Evaluation set alike.
- REQ-4: In fixed mode the prompt, search text, papers and result match today's Coach for the same request.

### Model search

- REQ-5: In model mode the Draft's prompt contains no papers and offers the Chat model one paper-search tool taking a search text.
- REQ-6: A Model search returns the papers and passages, with labels and scores, the fixed search returns for that same text.
- REQ-7: A Draft makes at most 3 Model searches; a further request gets "limit reached, answer now" and searches nothing.
- REQ-8: In model mode, athlete numbers, recent rides, Selection rules and allowed protocols stay in the prompt as in fixed mode.
- REQ-9: A Draft sent back by the Check keeps the earlier Drafts' searches and passages in the conversation.
- REQ-10: The Check accepts a citation of any passage a Model search returned earlier in the same request.
- REQ-11: With a cloud Chat model, every model turn of a Draft is charged to the spending total.
- REQ-12: Once the spending total reaches the Spending cap, no further model turn starts and the Fallback rules decide.
- REQ-13: A Chat model refusing tools stops the request with an error naming the model and the setting for fixed mode.

### Visibility and measurement

- REQ-14: The Coach screen shows each Model search as a step with its search text and number, like "ricerca 2 di 3".
- REQ-15: Each Trace records every Model search: its Draft, search text, papers found with scores, and duration.
- REQ-16: An Evaluation set results file records the Search mode and, per answer, each Model search's text and papers found.
- REQ-17: In model mode the search score counts an expected paper found when any Model search of that answer returned it.
- REQ-18: The grading report and the README table row name the Search mode; the prompt version differs between the two modes.
- REQ-19: The README Coach section describes both Search modes, the setting, and how to compare them with the Evaluation set.

## Data & Dependencies

### Information the feature must retain

- Model searches of a request — search text, Draft number and papers found; kept in the Trace and, for the Evaluation set, in its results file; never in the database.

### External capabilities relied on

- Tool calling in the Chat model — the model must be able to ask for the paper search and read its answer, through both Ollama and the OpenAI-compatible endpoint.

## Non-Functional Requirements

- **Performance** — a Model search costs no more search time than a fixed search: one Search model encoding plus the index lookup.
- **Security** — the model's search text is shown on the Coach screen as plain text, never as markup.
- **Validation** — a search text is trimmed and cut to 300 characters before searching; an empty one returns "empty search" and still counts toward the 3.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Setting written in another case or with spaces ("Model ") | Accepted as model: trimmed, case ignored | REQ-1 |
| Setting empty | Fixed mode | REQ-1 |
| Setting "tools" or any other word | Every Coach request fails with the message naming the setting and "fixed" / "model"; the service still starts | REQ-2 |
| N/A — permission: `.env` is read only by the service, nobody else sets the mode | — | REQ-2 |
| Live check run in model mode | Its 3 situations run with Model searches, and its output names the mode | REQ-3 |
| Evaluation `--search-only` in model mode | Measures the fixed search text and says that the model's searches need a full run | REQ-3 |
| Mode changed in `.env` mid-run | A request keeps the mode it started with; the change applies after the service restarts, like the Chat model | REQ-3 |
| Fixed mode with an index that cannot be read | Same error as today | REQ-4 |
| N/A — concurrent: fixed mode adds no state | — | REQ-4 |
| The model answers without searching | Accepted when it cites nothing; a citation fails the Check as outside the passages given | REQ-5 |
| The model asks for an unknown tool or sends broken arguments | Answered "unknown tool" or "bad search", counted toward the 3, the Draft continues | REQ-5 |
| Search finds no paper | The tool answers "no papers found"; the search still counts | REQ-6 |
| Paper index cannot be read during a Model search | The request stops with today's index error message | REQ-6 |
| The model asks two searches in one turn | Both run in order and each counts; a 4th in the same turn gets "limit reached" | REQ-7 |
| Exactly the 3rd search | Runs normally; only the 4th request is refused | REQ-7 |
| The model keeps asking after "limit reached" | Each later ask gets "limit reached" again; after 3 refusals in a row the Draft ends as unusable and the Check sends it back | REQ-7 |
| No recent rides in the situation | The prompt says no bike activity in the last 7 days, as today | REQ-8 |
| N/A — integrity: athlete numbers are computed as in fixed mode | — | REQ-8 |
| Third Draft rejected | Fallback rules, as today; their card names the last Draft's cause | REQ-9 |
| A retry Draft searches again | It gets its own 3 searches; earlier passages stay citable | REQ-9 |
| Citation of a passage from a paper found but whose passage was not returned | Rejected as outside the passages given | REQ-10 |
| Same paper returned by two searches | Treated as one paper; its citations are accepted once | REQ-10 |
| Provider gives no token counts for a tool turn | That turn's cost is unknown, and the request's total cost is unknown, as today | REQ-11 |
| Stop pressed during a tool turn | Turns already accepted by the provider are charged; no further search runs | REQ-11 |
| Spending cap reached after a search, before the model's answer | No further turn; the Draft ends and the Fallback rules decide, saying the cap was reached | REQ-12 |
| Ollama Chat model does not support tools | Error: the model cannot search papers itself; choose another model or set fixed mode | REQ-13 |
| Cloud endpoint rejects the tool fields | Same error, with the provider's message | REQ-13 |
| Search text with HTML or very long text | Shown as plain text, cut to 300 characters | REQ-14 |
| Browser closed during a Model search | The request continues as today; the steps are lost with the page | REQ-14 |
| Phoenix down | The Coach answers anyway, as today | REQ-15 |
| Disconnecting from Strava | Deletes the Coach screen's Traces, Model searches included | REQ-15 |
| Run interrupted by the Spending cap | The partial results file keeps the mode and the searches made so far | REQ-16 |
| Answer with no Model search | Counts as expected paper not found | REQ-17 |
| Situation allowing only practice protocols | Not counted, as today | REQ-17 |
| Grading an older results file with no mode | Read as fixed | REQ-18 |

## Out of Scope

- **Strava, ride-detail and load-history tools** — Evaluation set situations have no ride details or load history, so these tools cannot be measured yet.
- **Making model mode the default** — decided by the user after comparing the two README rows, not by this feature.
- **Model routing (a small model for searching, a bigger one for the Draft)** — that is the next roadmap step, together with the ride classifier.
- **Running the real Evaluation set with Ollama or a cloud model** — runs that use a real model are started by the user.
