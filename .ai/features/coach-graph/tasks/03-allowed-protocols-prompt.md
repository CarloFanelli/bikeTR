# Task 03: allowed-protocols-prompt

## Objective

The **Chat model** sees in its prompt only the protocols today's **Selection rules** rule allows for the minutes available, with that rule's sentence and its source.

## Context

**Satisfies**: REQ-10

Backlog B-28: the narrowed prompt should raise "Rules at first draft", while the returns of task 02 raise "Rules followed". It comes after task 02 so the rule check already catches a protocol the prompt no longer shows.

## Depends on

- Task 02

## Expected Behavior

- The protocol list in the prompt holds only today's allowed protocols that fit the minutes, by id and name.
- The selection rules section shows only the rule that applies today, with its source (paper or practice).
- The Z2 differences section appears only when a Z2 protocol is allowed.
- The prompt version changes, so results before and after never share a version.

## Acceptance Criteria

- [ ] TSB −30 → the prompt lists only rest, and the riposo rule with its practice source. (REQ-10)
- [ ] Hard share 10% and TSB +6 → the prompt lists Seiler 4×8 and the quality protocols, with the source PMID 24550842. (REQ-10)
- [ ] A protocol not allowed today appears nowhere in the prompt. (REQ-10)
- [ ] The prompt version differs from the version before this task. (REQ-10)

## Edge Cases

- Today's rule allows a single protocol (e.g. rest, TSB under −25) → the prompt lists only it; the model still writes the rationale and citations (REQ-10)
- Minutes too short for some of the rule's protocols → those are not listed (REQ-10)
