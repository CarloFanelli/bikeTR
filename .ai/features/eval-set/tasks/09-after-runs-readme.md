# Task 09: after-runs-readme

## Objective

The README has a Coach section that starts from the cyclist's problem, shows a diagram of a Coach request, explains the decisions and how to run the evaluation set, and a table with "before" and "after" rows for qwen2.5:3b and qwen2.5:7b; BikeTR is no longer called experimental.

## Context

**Satisfies**: REQ-24, REQ-25, REQ-26, REQ-27

The rewritten prompt is graded on the Mac like the "before" runs, and the README turns the numbers into the project's story: the problem, the solution and the measurements. The decisions include which selection rules are practice and why.

## Depends on

- Task 08

## Expected Behavior

- The user runs both models on the Mac with the rewritten prompt and commits the files; they are graded here.
- The README's Coach section opens with the cyclist's problem, then a diagram of a Coach request (rides, numbers, paper search, chat model, decision and fallback, workout), the decisions, and how to run and grade the evaluation set.
- The results table shows before and after rows per model, each naming its file; a cloud row appears only when the user runs one.
- The README's first lines no longer call BikeTR experimental, and its test section no longer says the system prompt matches the old browser Coach.
- PROCESS.md records this feature's decisions with their reasons.

## Acceptance Criteria

- [ ] Complete "after" results files exist in git for qwen2.5:3b and qwen2.5:7b, graded here (REQ-24)
- [ ] The Coach section opens with the cyclist's problem, then the diagram, decisions and run instructions (REQ-25)
- [ ] The decisions list every practice rule with why no paper is used (REQ-25)
- [ ] The table has before and after rows for both models, each naming its results file (REQ-26)
- [ ] The README no longer calls BikeTR experimental (REQ-27)

## Edge Cases

- A Mac run stops halfway → its file is kept but not used for a table row; the run is repeated (REQ-24)
- Rules whose source is practice → the decisions list them, each with why no paper is used (REQ-25)
- A row without a results file in git → not allowed: every row names its file (REQ-26)
- A cloud model run later → added as a new row with its file; not required to finish (REQ-26)
- A row's file is later re-graded with a corrected set → the row is updated from the re-grade (REQ-26)

## Notes from implementation

- **REQ-18 — divergence**: the spec counts as invented any cited PMID that was not among the papers given → the grading also accepts the selection rules' source papers (Seiler 2010, Stöggl 2014), because the prompt shows them beside the rules since the rewrite; after it, the models cited them in 8 and 10 of 27 answers, all the "invented" citations. "Supporting paper found" still counts only the papers the search returned. Agreed in /dev, 2026-11-08.
- **Known limitation**: the after runs follow the rules less often for qwen2.5:7b (12 of 27, 15 before) and barely more for qwen2.5:3b (9, 8 before); the README shows them as measured and names the next step, showing the model only the protocols its athlete's rule allows. Agreed in /dev, 2026-11-08.
