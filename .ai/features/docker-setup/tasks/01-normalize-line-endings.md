# Task 01: normalize-line-endings

## Objective

The repository enforces Unix (LF) line endings for text files, so a checkout on Windows, WSL or macOS no longer shows files as modified when their content is identical.

## Context

**Satisfies**: REQ-15

Today all 17 tracked files show as modified only because their line endings were converted to Windows style; their content matches the last commit. This comes first so every later task produces readable diffs, and so files that run inside Linux containers never carry Windows line endings.

## Depends on

None

## Expected Behavior

- A repository-level rule declares text files as LF-normalized; Git auto-detects binary files and leaves them alone.
- After the change, `git status` lists none of the 17 currently "modified" files, and their content is unchanged.
- Fresh checkouts on any OS get LF line endings for text files.

## Acceptance Criteria

- [ ] A committed rule makes Git store and check out text files with LF line endings (REQ-15)
- [ ] After applying it, `git status` shows none of the 17 files that differed only by line endings (REQ-15)
- [ ] `git diff` against the previous commit shows no content change in those files (REQ-15)
- [ ] Binary files are excluded from conversion (REQ-15)

## Edge Cases

- Existing working copy whose 17 files have Windows line endings → after the change Git shows them as unmodified; contents identical (REQ-15)
- Binary files (e.g. images added later) → never converted (REQ-15)
