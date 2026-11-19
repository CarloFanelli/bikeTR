# Task 05: label-accuracy-check

## Objective

One command measures the Label rule and the Label model on the Labeled rides, prints accuracy overall and per Ride label with seconds and cost, and writes a results file the README lists row by row.

## Context

**Satisfies**: REQ-15, REQ-16

This is the comparison the roadmap step asks for: does a small model label rides better than a simple rule, and at what cost. It mirrors the Evaluation set: a results file per run in the repository and one README row each.

## Depends on

- Task 02
- Task 04

## Expected Behavior

- The command reads the Labeled rides file and labels every ride with the Label rule and with the Label model of `.env`.
- It prints accuracy overall and per label for both, the Label model's seconds and its cost.
- It writes a results file into the repository with the model, the per-ride labels and the scores.
- The README gets a table with one row per run, like the Evaluation set's.
- With a cloud Label model it prints the worst-case cost first and refuses to start past the Spending cap.

## Acceptance Criteria

- [ ] Accuracy overall and per label is printed for both Label rule and Label model (REQ-15)
- [ ] Seconds and cost of the Label model are printed; cost unknown with Ollama (REQ-15)
- [ ] Each run writes a new results file into the repository (REQ-16)
- [ ] The README has a results table with a row format matching the command's output (REQ-16)
- [ ] A cloud run prints the worst-case cost and refuses past the Spending cap (REQ-15)

## Edge Cases

- Labeled rides file missing or with an unknown label → stops naming the file and the bad ride (REQ-15)
- Label model unreachable during the measurement → stops with the provider message; no results file written (REQ-15)
- Cloud Label model measurement → worst-case cost printed before the run; refused past the Spending cap (REQ-15)
- N/A — permission: single local user, no roles (REQ-15)
