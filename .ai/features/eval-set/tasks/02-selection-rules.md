# Task 02: selection-rules

## Objective

The Coach has one written set of selection rules that gives, for any form, hard share and minutes available, the list of allowed protocols, each rule naming its supporting paper or "practice".

## Context

**Satisfies**: REQ-3, REQ-4, REQ-5

Today's eight prompt rules leave gaps (form -12 with 10% hard matches none) and clash (time rules against state rules). The evaluation set (Task 03) takes its allowed lists from these rules, and the prompt rewrite (Task 07) states them. The user reviews the rules before the evaluation set is built; the app keeps today's prompt and fallback rules until Task 07.

## Depends on

- Task 01

## Expected Behavior

- Given form, hard share (or unknown) and 20–240 minutes, the selection rules name the rule that applies and its non-empty list of allowed protocols.
- Rules apply in a fixed order: rest and recovery first, then the time rules (120 minutes or more; under 50), then the others.
- Each rule carries its source: the PMID of a supporting paper in the index, or "practice" when no paper gives the number (such as the form cut-offs).
- Every edge of a numeric threshold belongs to exactly one rule, written as "below" or "or more".
- The app's Coach, the live check and the fallback rules are unchanged by this task.

## Acceptance Criteria

- [ ] Every combination of form, hard share (unknown included) and 20–240 minutes gets a non-empty allowed list (REQ-3)
- [ ] Every allowed protocol builds a workout within the minutes available: the Coach never swaps it for Z2 (REQ-3)
- [ ] Every rule names a source: a supporting paper's PMID or "practice" (REQ-4)
- [ ] Overlaps resolve in order: rest and recovery, then the time rules, then the others (REQ-5)
- [ ] An automated test fails when a rule names a PMID that the paper index rebuild does not fetch (REQ-4)

## Edge Cases

- Form exactly on a cut-off (-25, -15, -10, +5, +10) → belongs to exactly one rule, stated with "below" or "or more" (REQ-3)
- Hard share unknown (no ride in 28 days) → a rule covers it (REQ-3)
- 20 or 240 minutes available → the allowed list is non-empty (REQ-3)
- An allowed protocol does not fit the minutes (the Coach would switch to Z2) → never in an allowed list; the automated tests check it (REQ-3)
- A rule names a PMID not in the index → automated tests fail, naming the rule (REQ-4)
- Form -20 with 150 minutes → recovery wins over the long ride (REQ-5)
- Form -30 with 120 minutes → rest (REQ-5)
- Almost no hard riding, form 0, 40 minutes → the under-50-minutes list wins over the quality-session rule (REQ-5)
