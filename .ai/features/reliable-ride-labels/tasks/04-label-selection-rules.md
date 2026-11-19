# Task 04: label-selection-rules

## Objective

With Ride labels on, the Coach stops proposing hard work after a race or two hard days, and prefers quality after a week of only easy riding.

## Context

**Satisfies**: REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-18

Today's Selection rules read form, the hard share of 4 weeks and minutes, never what kind of rides the last days were. The new rules read Ride labels, so with labels off nothing changes.

## Depends on

Task 01

## Expected Behavior

- Post-race: a gara yesterday allows only recovery or rest today.
- Two hard days: two ripetute or gara rides in the last 3 days allow only easy Z2 days' protocols.
- Quality after endurance: form from +5, at least 3 rides and no ripetute or gara in the last 7 days favour quality protocols.
- Each new rule names its source, a paper or declared practice, and reaches the prompt as existing rules do.
- With Ride labels off, the rule chosen, the prompt and the result are today's for the same request.
- The Evaluation set gains at least two situations per new rule, each with its rule and allowed protocols with labels on and with labels off; grading reads the pair matching the run's Ride labels setting.
- The README lists the new rules.

## Acceptance Criteria

- [ ] Gara yesterday with labels on selects the post-race rule (REQ-9)
- [ ] Two ripetute or gara in 3 days with labels on selects the two-hard-days rule (REQ-10)
- [ ] Form +5, 3 rides, no ripetute or gara in 7 days selects quality after endurance (REQ-11)
- [ ] With labels off every Evaluation set situation selects today's rule, protocols and prompt (REQ-12)
- [ ] Each new rule's prompt sentence ends with its source (REQ-13)
- [ ] New situations, two per rule, pass the rule tests and are graded by the run's setting (REQ-14)
- [ ] The README describes the three new rules (REQ-18)

## Edge Cases

- Gara yesterday and 120+ minutes asked → post-race rule wins over the long-ride rule (REQ-9)
- Gara two days ago → post-race rule does not apply (REQ-9)
- Two ripetute in 3 days and form already in rest range → rest rule wins, as today's order (REQ-10)
- One ripetute and one gara in 3 days → counts as two (REQ-10)
- Fewer than 3 rides in 7 days → quality after endurance does not apply (REQ-11)
- Labels on, all rides labelled by the Label rule because the Label model failed → new rules read those labels (REQ-9, REQ-10, REQ-11)
- Labels switched off mid-day → next request uses today's rules only (REQ-12)
- Evaluation run with labels off → new situations graded on today's rules' answers (REQ-14)

## Notes from implementation

- **REQ-14 — divergence**: the Evaluation set grows from 27 to 33 situations, past the 25–30 the set's tests allowed; the bound is now 25–35. Each new situation carries `today` (its date) and `withLabels` (rule and allowed protocols with labels on); `rule` and `allowed` stay the labels-off answer.
- **REQ-10 — divergence**: "the last 3 days" counts rides from today to 3 days ago (`giorniFa` 0 to 3), so a ripetute yesterday and a gara three days ago make two hard days, as the edge case asks.
