# Task 05: evaluation-on-library

## Objective

The athlete runs the **Evaluation set** on their **Paper library** instead of the **Base papers**, to measure whether a paper they added helps or hurts, and every results file says which papers were searched.

## Context

**Satisfies**: REQ-20, REQ-21

The README's scores stay comparable because the default stays the base papers; the library option is the measuring tool the roadmap asked for. The search-only run is free, so it is the usual way to try a paper.

## Depends on

- Task 03

## Expected Behavior

- By default the evaluation searches the **Base papers**, as today.
- A command option makes it search the **Paper library**: base papers minus the removed ones plus the added ones.
- The option works with the full run and with the search-only run.
- A results file records whether the base papers or the library were searched, and the PMIDs searched; the search-only run prints the same.
- Results files saved before this feature are still read and graded, as base-paper runs.

## Acceptance Criteria

- [ ] Without the option, the evaluation searches the 17 base papers even when the library differs. (REQ-20)
- [ ] With the option, the search-only run's score reflects added and removed papers. (REQ-20)
- [ ] A results file records "base" or "library" and the list of PMIDs searched. (REQ-21)
- [ ] An old results file without these fields is graded as before. (REQ-21)

## Edge Cases

- Library option with nothing added or removed → the same papers as the default; the file says "library" (REQ-20, REQ-21)
- Library option with an unreadable saved library → the command stops with the message; no results file (REQ-20)
- Results files saved before this feature → still gradable, read as base papers (REQ-21)
