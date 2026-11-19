# Task 06: cost-split-readme

## Objective

Grading an Evaluation set run reports average cost and seconds per answer split between Label model and Chat model, and the README explains Ride labels and both measurements.

## Context

**Satisfies**: REQ-19, REQ-21

Model routing is worth it only if the small model's share of cost and time is small; the grading report is where that is read, run against run. The README section closes the feature for someone who has not seen the code.

## Depends on

- Task 02
- Task 05

## Expected Behavior

- The grading report shows average cost and seconds per answer for the Label model and for the Chat model.
- The README table row of a run names the Ride labels setting.
- The README Coach section describes the Ride labels setting, the Label model settings, the Label rule's thresholds, and how to run both measurements.

## Acceptance Criteria

- [ ] Grading a run with a Label model shows its average cost and seconds apart from the Chat model's (REQ-19)
- [ ] Grading a run made before this feature shows Ride labels off and no split (REQ-19)
- [ ] The README describes the setting, the Label model, the Label rule and both measurements (REQ-21)

## Edge Cases

- Results file from before this feature graded → read as Ride labels off, no split cost (REQ-19)
- Ollama Chat model, Ollama Label model → costs shown as unknown, seconds still split (REQ-19)
