# Task 04: tool-situations

## Objective

The Evaluation set gains situations where only the Ride tools reveal the right choice, and the eval runs README records one Chat model's grade with the tools off and on.

## Context

**Satisfies**: REQ-10, REQ-12

Without situations that need the tools, a comparison cannot show any gain. The measurement only records the result: turning the tools on by default is a separate backlog item.

## Depends on

03-situation-histories

## Expected Behavior

- At least 4 new situations whose averages look ordinary while the Load history or a Ride shape changes the right protocol (e.g. a ride with easy averages and three Z4 blocks yesterday, or a load that rose fast over a month).
- Each new situation states which tool answer changes the right choice.
- The eval runs README has a row for the same Chat model with the tools off and on, and the setting stays off.

## Acceptance Criteria

- [ ] The set has at least 4 new situations, each naming the tool answer that changes the right choice. (REQ-10)
- [ ] Every selection rule still has at least two situations, and the existing set tests pass. (REQ-10)
- [ ] The eval runs README records one Chat model's grade with the tools off and on. (REQ-12)
- [ ] The ride tools setting is still off by default after the measurement. (REQ-12)

## Edge Cases

- New situation solvable from the averages alone → not accepted; each one states which tool answer changes the right choice (REQ-10)
- The Check already rejects any protocol outside the rule's allowed list, so the usual grade cannot move → each new situation lists, inside the allowed list, its best protocols written by hand, and the run reports a best-choice score with the tools off and on (REQ-10, REQ-12 · from code)
