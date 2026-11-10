# Task 05: drafts-in-evaluation

## Objective

The **Evaluation set** and the **Live check** record every **Draft**, and grading separates the narrowed prompt's effect from the returns', counts the **Fallback rules** causes, and the docs describe the **Coach graph**.

## Context

**Satisfies**: REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21

The measuring end of the feature, backlog B-29 included. Real-model runs and the README rows they give are the user's, on the Mac.

## Depends on

- Task 03

## Expected Behavior

- Each answer in a results file lists its drafts: protocol, raw answer, check result with reasons, tokens and cost; the fallback cause is recorded when the fallback rules chose.
- Grading reports "Rules followed" on the last draft and "Rules at first draft", plus answers per fallback cause, average drafts per answer and answers with citations dropped, in the summary and the README table.
- Results files from before the graph are graded as one draft each.
- A cloud evaluation run counts 3 drafts per answer in its maximum cost.
- The README's Coach section shows the graph with its return loop; PROCESS.md records the decision.

## Acceptance Criteria

- [ ] A three-draft answer is written to the results file with its three drafts. (REQ-16)
- [ ] An answer rejected for the rule then delivered counts in "Rules followed", not in "Rules at first draft". (REQ-17)
- [ ] An old results file grades with first and last draft equal. (REQ-17)
- [ ] Grading counts answers per fallback cause, including "not allowed today". (REQ-18)
- [ ] Grading shows average drafts and answers with citations dropped. (REQ-19)
- [ ] A cloud run's maximum cost is three times the old one. (REQ-20)
- [ ] README and PROCESS.md describe the graph and its loop. (REQ-21)

## Edge Cases

- Cloud run whose 3-draft maximum cost exceeds what is left → the evaluation does not start, as today (REQ-20)
- Results files from before the graph (one answer, no drafts) → graded as one draft: first and last are the same (REQ-17)
- Fallback after a cut-off third draft → cause "cut off" recorded and counted (REQ-18)
