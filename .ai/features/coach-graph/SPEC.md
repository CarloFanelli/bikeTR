---
feature: coach-graph
version: 1.0
status: approved
completed: false
base: 5f8edc0536792b9bdd7f03ee7e147d4f416edd7c
---

# Coach Graph

## Overview

The Coach becomes a LangGraph graph: rides, metrics, papers, draft, check, deliver. The check node
verifies each draft of the chat model — usable answer, protocol allowed by today's selection rule,
citations only among the passages given — and on failure sends the draft back to the model with the
reasons, up to 3 drafts per request. The prompt shows only the protocols today's rule allows. The
evaluation set measures both changes apart: rules followed at the first draft (the narrower prompt)
and after the returns (the graph), plus why the fallback rules chose (B-29).

## Project Context

- The Coach service, the live check and the evaluation set share one path from athlete context to workout; the graph must keep it shared.
- Selection rules, fallback rules and the protocol catalog already exist and stay the single source of what is allowed.
- Text shown on the card or the screen about a failure is written by code, never by the model.
- Cloud spending goes through the existing spending total and cap; Ollama costs nothing.
- Development and tests use fake models only; real-model runs are started by the user on the Mac.
- LangGraph runs inside the Coach service: no hosted LangGraph service, no LangSmith, no telemetry leaving the computer.
- Stop on the Coach screen closes the connection; the service already stops the model when the client leaves.

## Functional Requirements

### The graph

- REQ-1: Each Coach request runs as a graph with nodes rides, metrics, papers, draft, check and deliver; evaluation and live check enter at papers.
- REQ-2: The check node rejects a draft that is unusable: cut off, unreadable, without a catalog protocol, or too long for the minutes.
- REQ-3: The check node rejects a draft whose protocol is not among those today's selection rule allows for the minutes available.
- REQ-4: The check node rejects a draft citing a passage label or PMID that was not among the passages given.
- REQ-5: A rejected draft returns to the draft node; the model receives its previous answer and the code-written reasons, in Italian.
- REQ-6: A request makes at most 3 drafts; the first draft the check accepts is delivered.

### When the drafts run out

- REQ-7: If the third draft fails only on invented citations, the card keeps its protocol and rationale, drops those citations and says so.
- REQ-8: If the third draft fails for any other reason, the fallback rules choose, and the card names the last draft's cause.
- REQ-9: The fallback causes are: cut off, unreadable, not in the catalog, too long for the minutes, not allowed today.

### The prompt

- REQ-10: The prompt lists only the protocols today's selection rule allows for the minutes available, with that rule's sentence and its source.

### The Coach screen and card

- REQ-11: When the check sends a draft back, a step line shows the reason and the attempt ("tentativo 2 di 3"); the new answer replaces the previous.
- REQ-12: The workout card says how many drafts it took when more than one.

### Cost and traces

- REQ-13: Every draft's tokens and cost count in the request's total and in the cloud spending total.
- REQ-14: No new draft starts once the spending cap is reached; the request ends as if the drafts had run out.
- REQ-15: The trace shows each graph node as a step, with each draft and each check result as its own step.

### Evaluation

- REQ-16: Live-check and evaluation results files record every draft: protocol, raw answer, check result with reasons, tokens and cost.
- REQ-17: Grading reports "Rules followed" on the last draft and a new "Rules at first draft", in the summary and the README table.
- REQ-18: Results files record the fallback cause, and grading counts answers per cause.
- REQ-19: Grading reports the average drafts per answer and how many answers had citations dropped.
- REQ-20: The evaluation's maximum-cost check before a cloud run counts 3 drafts per answer.

### Documentation

- REQ-21: The README's Coach section shows the graph with its return loop; PROCESS.md records the decision and its reason.

## Data & Dependencies

### Information the feature must retain

- Drafts of a request — kept in the results files of live checks and evaluation runs, and in the request's trace; the Coach screen keeps nothing after the answer.

### External capabilities relied on

- A graph library that runs locally inside the Coach service — nodes, conditional edges and a loop back.

## Non-Functional Requirements

- **Performance** — The graph adds under 100 ms per request beyond the model calls; worst case is 3 model calls per request.
- **Security** — Step lines and card notes about a failed check contain only code-written text (catalog names, numbers, labels), never model text.
- **Validation** — The prompt version changes with the narrowed prompt, so results before and after never share a version.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| First draft passes | Delivered at once: one model call, card shows no drafts note | REQ-6 |
| Third draft passes | Delivered; card says it took 3 drafts | REQ-6, REQ-12 |
| Draft fails on two things at once (not allowed today and invented citation) | Both reasons go back to the model; if it is the third draft, the rule failure wins: fallback rules | REQ-5, REQ-7 |
| Today's rule allows a single protocol (e.g. rest, TSB under −25) | Prompt lists only it; the model still writes the rationale and citations | REQ-10 |
| Model chooses a catalog protocol not shown in the narrowed prompt | Rejected as not allowed today | REQ-3 |
| Draft has an empty citation list | Passes the citation check | REQ-4 |
| Citation of a selection rule's source PMID that was not retrieved | Counts as given: the prompt shows it beside the rule | REQ-4 |
| Model stream fails (Ollama down, cloud error) during any draft | Request ends with the existing model error; no further drafts | REQ-6 |
| Stop pressed during the second draft | Request cancelled; drafts already accepted by a cloud provider are charged | REQ-13 |
| Spending cap reached after the first draft | No second draft; fallback or citation rule applies to the first draft as the last one | REQ-14 |
| Cloud run whose 3-drafts maximum cost exceeds what is left | Evaluation does not start, as today | REQ-20 |
| Results files from before the graph (one answer, no drafts) | Graded as one draft: first draft and last draft are the same | REQ-17 |
| Fallback after a cut-off third draft | Cause "cut off" recorded and counted | REQ-18 |
| Phoenix off | Coach answers anyway; trace lost, as today | REQ-15 |
| N/A — concurrent: one request runs one graph; two requests share nothing but the spending total, already locked | — | REQ-1 |
| N/A — permission: the graph adds no new caller or endpoint | — | REQ-1 |

## Out of Scope

- **Load ramp check** — a new rule (CTL rising too fast) with no paper in the index; it would need its own source first.
- **Tool calling** — the model asking for papers or metrics is roadmap step 8 (B-3), compared against this fixed graph.
- **Ride classifier and model routing** — roadmap step 9 (B-4, B-24).
- **Attempt count in .env** — 3 drafts fixed; a setting adds variants to test with no measured need yet.
- **Saving graph state between requests** — Stop ends a request; nothing resumes later.
- **Running the evaluation with real models** — the user runs it on the Mac; the README rows follow that run.
