# Task 01: too-long-uses-rules

## Objective

When the chat model picks a catalog protocol that does not fit the available minutes, the athlete gets the protocol the fallback rules choose, with the fallback rationale, instead of a Z2 ride.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3

Today a too-long choice becomes Z2 endurance whatever the athlete's selection rule says, and keeps the model's rationale and papers on a workout the athlete does not get. This task makes it the fourth way an answer reaches the fallback rules. The card's warning still reads the same until Task 02.

## Depends on

None

## Expected Behavior

- A catalog protocol that does not fit the minutes is replaced by the first protocol the athlete's selection rule allows for those minutes.
- That workout carries the fallback rationale ("Decisione fallback: TSB …, polarizzazione hard …% → …") and, if it has one, the supporting paper of the protocol given; the model's rationale and cited papers are dropped.
- The workout is marked as a fallback, as for an unreadable answer.
- A catalog protocol that fits the minutes is used as chosen, even when the selection rules do not allow it.
- The README's request diagram and its list of differences from the old browser Coach describe the new too-long behavior.

## Acceptance Criteria

- [ ] A too-long catalog protocol gives the protocol the fallback rules choose for that athlete and those minutes (REQ-1)
- [ ] A tired athlete (recovery rule) with 45 minutes whose model picks Over-Under gets Recupero attivo Z1, not Z2 (REQ-1)
- [ ] The too-long workout has the fallback rationale and only the given protocol's supporting paper, if any (REQ-2)
- [ ] A catalog protocol that fits the minutes but that the selection rule does not allow is used as chosen, not marked as a fallback (REQ-3)
- [ ] The comparison with the old browser Coach still passes for every case except the too-long ones (REQ-1)

## Edge Cases

- Minutes exactly at the protocol's minimum (Over-Under with 64) → fits: used as chosen, not a fallback (REQ-1, REQ-3 from the spec edge-case table)
- One minute below the minimum (Over-Under with 63) → the fallback rules choose (REQ-1)
- Fallback rules for any athlete and any minutes from 30 to 240 → always a protocol that fits (REQ-1)
- Results files already in `eval-runs/` and `live-checks/` → graded as before: grading reads the model's own choice, not the protocol given (REQ-1)
- The fallback protocol has no supporting paper (Riposo, Recupero attivo Z1) → no cited paper, as for an unreadable answer (REQ-2)
- The model cited real papers or wrote a rationale for its too-long protocol → both dropped: they explain a workout the athlete does not get (REQ-2)
- The model picks a protocol that fits but its selection rule does not allow → used as chosen, not a fallback (REQ-3)
