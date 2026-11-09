# Task 06: coach-readme

## Objective

The README's Coach section explains streaming and Stop among its decisions, its diagram shows the passage search, and its evaluation part shows the search score of the final search.

## Context

**Satisfies**: REQ-22, REQ-24

The Coach section already has a request diagram and a list of decisions, but streaming appears only as one line of the diagram and Stop only in the paragraph about money. This last task describes the finished search, once full texts, the new search text and passage citations are all in.

## Depends on

- Task 01
- Task 03
- Task 04
- Task 05

## Expected Behavior

- The Decisions list explains streaming: the screen shows each step and the model's text as it is written, and why.
- The Decisions list explains Stop: what it ends, and how a stopped request's cost is counted, matching the README's money paragraph.
- The diagram's paper step names passages, the vector database, and the 4 papers with 2 passages each; the model's answer shows passage labels.
- The evaluation section shows the search score of a search-only run of the final search.

## Acceptance Criteria

- [ ] The Decisions list explains streaming: each step and the model's text appear as they happen, with the reason (REQ-24)
- [ ] The Decisions list explains Stop: what it ends and how its cost is counted, matching the money paragraph (REQ-24)
- [ ] The diagram's paper step names passages, the vector database, and 4 papers with 2 passages each (REQ-24)
- [ ] The evaluation section shows the search score from a search-only run of the final search (REQ-22)

## Edge Cases

- N/A — concurrent, network, permission: documentation (REQ-22, REQ-24)
- A rebuilt index changes the score → the README is updated by hand from a new search-only run (REQ-22)
- The diagram's paper step → it names passages, the vector database, and the 4 papers with 2 passages each (REQ-24)
- The Stop decision → it says what Stop ends and how a stopped request's cost is counted, matching the README's money paragraph (REQ-24)
