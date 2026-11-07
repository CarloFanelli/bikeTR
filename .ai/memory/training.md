# Training

The Training tab's daily recommendation and plans, and the workout engines behind them.

## Terms

### Training v2
The evidence-based workout engine (a catalog of cited protocols and the capacity tier) used by the Training plan and by the Coach. It has no tab or screen of its own.
_Avoid_: "Training v2 tab" (the navigation never had one; an old README described it by mistake).

## Decisions

- **The load chart shows in both Allenamento and Analisi in the new app**: today it sits only in the Analysis tab; the new app shows the same card (bars by ride kind plus a dashed daily-average line) in both sections. Why: the task plan puts it with the training plan it explains, and the spec asks every section to keep today's content, so Analisi keeps it too.

## Gotchas

- **The mesocycle week is never saved**: the current week of the block is computed when the Training tab opens, but the mesocycle is saved only at first opening and when a block ends, so the plan and its banner always use the stored week (week 1 of the block). Keep this in mind before trusting the week shown, and fix it as its own change, not inside a port.
- **The daily recommendation can throw**: with the FTP history on a plateau and no deficit in the power profile, the recommendation reads a missing deficit label and throws, and today's Training tab stops drawing. A new screen must catch it.
