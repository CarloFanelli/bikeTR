# Task 01: search-score

## Objective

The evaluation measures the search on its own: a run that calls no chat model prints how many situations have their expected paper among the 4 papers found, and the evaluation table gains the "Expected paper found" column, results files saved before this feature included.

## Context

**Satisfies**: REQ-19, REQ-20, REQ-21

Measure before changing: this task gives today's search its **Search score** (9 of 20 expected), so every later task of this feature shows what it changes. It reads only what results files already record, so it also works on files saved before this feature.

## Depends on

None

## Expected Behavior

- A search-only run of the evaluation goes through every situation, runs the Coach's own paper search, and prints the search score, for example "Expected paper found: 9 of 20 (45%)".
- The search-only run contacts no chat model, needs no key, spends nothing, and works with the internet off and Ollama stopped.
- Grading a results file adds "Expected paper found" to the printed scores and to the table row.
- A situation counts when a protocol the selection rules allow has a **Supporting paper**; it scores when one of those papers is among the 4 papers found.
- The README's evaluation table gains the column for its existing rows, from grading their saved results files.

## Acceptance Criteria

- [ ] The search-only run prints the search score over every situation with an expected paper, calling no chat model (REQ-21)
- [ ] On today's index and search, the search-only run prints 9 of 20 (REQ-21)
- [ ] Grading adds "Expected paper found" to the printed scores and to the table row (REQ-19)
- [ ] Situations whose allowed protocols are all practice are left out of the count (REQ-19)
- [ ] Grading a results file saved before this feature fills the column from the papers found it records (REQ-20)
- [ ] In a run with repeats, each situation counts once (REQ-19)
- [ ] The README evaluation table's existing rows carry the column, from grading their saved results files (REQ-20)

## Edge Cases

- A situation whose allowed protocols are all practice → not counted (20 of the 27 count today) (REQ-19)
- A run with repeats → each situation counts once: the search is the same every time (REQ-19)
- No situation counts → the column shows "—" (REQ-19)
- An old answer with no papers found (a failed request) → that situation counts as not found (REQ-20)
- An old results file whose situations no longer exist → those situations are skipped, as grading does today (REQ-20)
- `.env` names a cloud model → the search-only run contacts no model, spends nothing and needs no key (REQ-21)
- The index is refused → the same message as the Coach, and the run exits with an error (REQ-21)
- Internet off, Ollama not running → the search-only run works (REQ-21)
