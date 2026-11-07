# Task 05: grading

## Objective

Every saved run can be graded here, without any model: rules followed, readable JSON, invented citations, supporting paper cited and found, fallback used, median seconds and cost per answer, plus the README table rows; the run command prints the same scores when it ends.

## Context

**Satisfies**: REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22

Runs happen on the Mac; grading happens on the laptop from the results file, so a corrected allowed list re-grades old runs instead of paying for new ones. The checks are fixed rules, not a second model, so the same file always gets the same scores.

## Depends on

- Task 04

## Expected Behavior

- An answer follows the rules when the protocol the model wrote is in its situation's allowed list; unreadable answers and fallback choices never do.
- An answer invents a citation when a PMID in its cited list or rationale was not among the papers it was given.
- Among answers given their chosen protocol's supporting paper, the support score counts those citing it, in the list or the rationale.
- The grading command takes one or more results files, grades them against the current evaluation set, prints each run's scores and one README table row per file.
- The run command prints the scores after the last answer.

## Acceptance Criteria

- [ ] Rules followed counts only answers whose model-written protocol is in the allowed list, never fallback choices (REQ-17)
- [ ] An answer citing a PMID it was not given, in list or rationale, counts as an invented citation (REQ-18)
- [ ] The support score counts only answers given their protocol's supporting paper; practice protocols are left out (REQ-19)
- [ ] Scores show all eight measures, with "—" where none applies (REQ-20)
- [ ] Re-grading a saved file calls no model or network and gives identical scores twice, within 5 seconds (REQ-21)
- [ ] The grading command prints one README table row per file given (REQ-22)

## Edge Cases

- Answer unreadable or cut off → does not follow the rules; counted against readable JSON (REQ-17)
- Model writes an id not in the catalog → does not follow the rules; counted as fallback used (REQ-17)
- Model picks a protocol outside the list that the Coach then replaces → graded on the model's own choice: does not follow (REQ-17)
- No citations at all → no invented citation (REQ-18)
- PMID written as a number, or repeated → counted the same as the text form, once (REQ-18)
- Chosen protocol is practice, or its supporting paper was not given → left out of the support score (REQ-19)
- Supporting paper cited only in the rationale → counts as cited (REQ-19)
- Ollama run (no cost) → cost column shows "—" (REQ-20)
- No answer succeeded → scores show 0 answers and "—" (REQ-20)
- Results file names a situation no longer in the set → that answer is skipped and listed; a new situation without an answer is listed as not run (REQ-21)
- File unreadable, or a live check file → refused with a message naming the file (REQ-21)
- Several files for the same model and prompt version → one row per file (REQ-22)
- No file given → refused with a message (REQ-22)
