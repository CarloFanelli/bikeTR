# Task 06: before-runs

## Objective

The README holds the "before" rows: qwen2.5:3b and qwen2.5:7b graded on the evaluation set with today's prompt, each from a complete results file the user ran on the Mac and committed.

## Context

**Satisfies**: REQ-24, REQ-26

Measuring before changing: today's prompt must be graded before Task 07 rewrites it, so the work pauses here. Models never run on the laptop; the user runs both on the Mac with the command of Task 04, commits the files, and they are graded here with Task 05.

## Depends on

- Task 05

## Expected Behavior

- The user is given the exact commands to run on the Mac, one per model, with today's prompt.
- Both results files are in git, complete, and carry today's prompt version.
- They are graded here, and the README gains a results table with one "before" row per model, each naming its file.

## Acceptance Criteria

- [ ] A complete results file with today's prompt version exists in git for qwen2.5:3b (REQ-24)
- [ ] A complete results file with today's prompt version exists in git for qwen2.5:7b (REQ-24)
- [ ] Both files are graded here with no model call (REQ-24)
- [ ] The README table shows one "before" row per model, each naming its results file (REQ-26)

## Edge Cases

- A Mac run stops halfway → its file is kept but not used for a table row; the run is repeated (REQ-24)
- The user starts each run by hand, one at a time → no concurrent runs to handle (REQ-24)
- A row without a results file in git → not allowed: every row names its file (REQ-26)
