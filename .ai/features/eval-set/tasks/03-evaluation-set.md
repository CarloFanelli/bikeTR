# Task 03: evaluation-set

## Objective

The evaluation set exists: 25–30 made-up situations, each with a one-line description, the athlete numbers the prompt shows, the minutes available, the rule it tests and its allowed protocols, kept in agreement with the selection rules by the automated tests.

## Context

**Satisfies**: REQ-7, REQ-8, REQ-9, REQ-10

This is the fixed list every chat model and both prompt versions are graded on. The allowed lists are written by hand and checked against the selection rules of Task 02, so a mistake in either shows up as a failing test. The user reviews the situations before the first run.

## Depends on

- Task 02

## Expected Behavior

- The evaluation set lists 25–30 situations, each with a unique name, a one-line description in plain words, the athlete numbers the prompt shows (form, fitness, fatigue, hard share, FTP, threshold heart rate, weight, volume, last 7 days of rides, weekday) and the minutes available.
- Each situation names the selection rule it tests and lists its allowed protocols.
- Every selection rule is tested by at least two situations, and every numeric threshold by a situation exactly on it.
- The automated tests fail, naming the situation, when its allowed list differs from what the selection rules give for its numbers.

## Acceptance Criteria

- [ ] The set holds 25–30 situations with unique names and a one-line description each (REQ-7)
- [ ] Each situation has the athlete numbers the prompt shows and 20–240 minutes available (REQ-7)
- [ ] Each situation names the rule it tests and a non-empty allowed list of catalog protocols (REQ-8)
- [ ] A test fails, naming the situation and both lists, when an allowed list differs from the selection rules (REQ-9)
- [ ] A test fails when a rule has fewer than two situations or a threshold has none exactly on it (REQ-10)

## Edge Cases

- Fewer than 25 or more than 30 situations → automated tests fail (REQ-7)
- Situation without threshold heart rate or weight → allowed, shown as "—" as today; at least one situation has them missing (REQ-7)
- Two situations with the same name → automated tests fail (REQ-7)
- Empty allowed list → automated tests fail (REQ-8)
- Allowed list names a protocol not in the catalog → automated tests fail (REQ-8)
- Selection rules changed, situation not updated → automated tests fail, naming the situation and both lists (REQ-9)
- A threshold with no situation exactly on it → automated tests fail, naming the threshold (REQ-10)
- A rule tested by only one situation → automated tests fail, naming the rule (REQ-10)
- Hard share unknown → at least one situation tests it (REQ-3, REQ-10)

## Notes from implementation

- **Impacts Task 03**: the selection rules cover 30–240 minutes, not 20–240 (user decision of 2026-11-07, recorded in the task 02 notes): no situation has fewer than 30 minutes, and the shortest-time edge case uses 30. /dev, 2026-11-07.
