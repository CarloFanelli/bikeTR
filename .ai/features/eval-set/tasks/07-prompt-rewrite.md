# Task 07: prompt-rewrite

## Objective

The Coach's prompt states the selection rules in order, each with its supporting paper or "practice", and the fallback rules always choose an allowed protocol; from now on the app's Coach and the live check follow them.

## Context

**Satisfies**: REQ-23, REQ-6

This is the change the evaluation set measures. It lands only after the "before" rows of Task 06, so today's prompt has its score. Everything else in the prompt (catalog, papers, output format, athlete numbers) stays as it is, so the comparison isolates the rules.

## Depends on

- Task 06

## Expected Behavior

- The prompt's selection rules section states every selection rule, in order, each with its source (PMID or "practice"), replacing today's eight rules and the negative rule.
- The rest of the system prompt and the user prompt are unchanged, character for character.
- When the chat model's answer is unusable, the fallback rules choose a protocol the selection rules allow for that athlete and those minutes.
- The prompt version changes, so runs before and after this task stay apart.

## Acceptance Criteria

- [ ] The prompt lists every selection rule in order with its PMID or "practice"; today's eight rules are gone (REQ-23)
- [ ] Outside the rules section, the system prompt and the user prompt are unchanged (REQ-23)
- [ ] For every situation in the evaluation set, the fallback rules choose an allowed protocol (REQ-6)
- [ ] With hard share unknown, the fallback rules still choose an allowed protocol (REQ-6)
- [ ] The prompt version differs from today's (REQ-23)

## Edge Cases

- Fallback protocol does not fit the minutes → automated tests fail, naming the situation (REQ-6)
- Hard share unknown → the fallback rules still choose an allowed protocol (REQ-6)
- A placeholder word inside a paper's abstract → papers are still inserted last, as today (REQ-23)
- The app's Coach and the live check after the rewrite → both use the new prompt and fallback rules (REQ-23)
