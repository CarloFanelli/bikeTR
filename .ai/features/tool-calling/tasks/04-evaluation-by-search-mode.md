# Task 04: evaluation-by-search-mode

## Objective

The Evaluation set, the Live check, the grading and the README tell the two Search modes apart, so fixed and model runs can be compared row against row.

## Context

**Satisfies**: REQ-3, REQ-16, REQ-17, REQ-18, REQ-19

The point of the feature is the comparison. This task makes each results file and README row say which mode produced it, scores the search over the papers the model found, and documents how to run both.

## Depends on

- Task 01

## Expected Behavior

- A results file records the Search mode and, per answer, each Model search's Draft, text and papers found.
- In model mode the search score counts the expected paper found when any Model search of that answer returned it.
- The prompt version differs between the two modes.
- The grading report and the README table row name the Search mode; older files without a mode read as fixed.
- The Live check output names the mode; `--search-only` in model mode measures the fixed search text and says so.
- The README Coach section describes both modes, the setting and how to compare them.

## Acceptance Criteria

- [ ] A model-mode results file has the mode and each answer's Model searches with text and papers (REQ-16)
- [ ] The search score counts an expected paper returned by any Model search of the answer (REQ-17)
- [ ] Fixed and model mode give different prompt versions (REQ-18)
- [ ] Grading report and README row name the mode; a file without a mode grades as fixed (REQ-18)
- [ ] The Live check output names the mode; `--search-only` in model mode says it measures the fixed search (REQ-3)
- [ ] The README Coach section explains both Search modes, the setting and the comparison run (REQ-19)

## Edge Cases

- Live check run in model mode → runs with Model searches and names the mode (REQ-3)
- `--search-only` in model mode → measures the fixed search text and says a full run is needed for the model's searches (REQ-3)
- Run interrupted by the Spending cap → the partial file keeps the mode and the searches made so far (REQ-16)
- Answer with no Model search → expected paper not found (REQ-17)
- Situation allowing only practice protocols → not counted (REQ-17)
- Older results file with no mode → graded as fixed (REQ-18)
