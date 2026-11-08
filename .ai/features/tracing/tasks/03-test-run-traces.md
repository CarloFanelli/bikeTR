# Task 03: test-run-traces

## Objective

Every answer of a Live check or an Evaluation set run leaves its own trace in Phoenix, named by its source and situation, so a surprising result in a results file can be opened step by step.

## Context

**Satisfies**: REQ-1, REQ-6, REQ-8, REQ-10

The Live check and the Evaluation set run in their own command, outside the Coach service, and keep their results files exactly as today. They reuse the steps of Tasks 01 and 02; what is new is their source, the situation and repeat, and a command that ends while traces may still be waiting to be sent.

## Depends on

- Task 02

## Expected Behavior

- Each Live check situation leaves one trace in Phoenix's Live check project, named with source Live check and the situation's name.
- Each Evaluation set answer leaves one trace in Phoenix's Evaluation project, with the situation's name and the repeat number.
- An Evaluation set trace has no rides step: it starts from the situation's numbers.
- When the command ends, its last traces are sent before it exits; with Phoenix down, the command ends at most about 1 second later than today.
- The results files keep their current fields and values.

## Acceptance Criteria

- [ ] Every Live check situation leaves one trace with source Live check and the situation name (REQ-1, REQ-6)
- [ ] Every Evaluation set answer leaves one trace with source evaluation, the situation name and the repeat number (REQ-1, REQ-6)
- [ ] The last answer's trace reaches Phoenix even though the command exits right after it (REQ-1)
- [ ] With Phoenix not started, the run completes as usual and one line says traces were lost (REQ-10)
- [ ] Live check and Evaluation set results files keep exactly their current fields (REQ-6)

## Edge Cases

- An evaluation with `--repeat 3` on 27 situations → 81 traces, one per answer (REQ-1, REQ-6)
- A Live check situation → source Live check and the situation name; repeat only for evaluations (REQ-6)
- A Live check situation → its rides step shows made-up rides, with no Strava download (REQ-2 · from code)
- Ctrl+C during an evaluation answer → finished answers keep their traces; the one in progress may be lost (REQ-8, REQ-10)
- An evaluation run while Phoenix is not started → the run completes as usual; one line says traces were lost (REQ-10)
