# Training

Allenamento's daily recommendation and plans, and the workout engines behind them.

## Terms

### Training v2
The evidence-based workout engine (a catalog of cited protocols and the capacity tier) used by the Training plan and by the Coach. It has no tab or screen of its own.
_Avoid_: "Training v2 tab" (the navigation never had one; an old README described it by mistake).

## Decisions

- **The load chart shows in both Allenamento and Analisi**: the old JavaScript app had it only in the Analysis tab; the same card (bars by ride kind plus a dashed daily-average line) is in both sections. Why: it belongs with the training plan it explains, and Analisi had to keep all the content it had.

## Gotchas

- **The mesocycle week is never saved**: the current week of the block is computed at every start of the app, but the mesocycle is saved only at first opening and when a block ends, so the plan and its banner always use the stored week (week 1 of the block). Keep this in mind before trusting the week shown, and fix it as its own change, not inside a port.
- **The daily recommendation can throw**: with the FTP history on a plateau and no deficit in the power profile, the recommendation reads a missing deficit label and throws. Allenamento shows the error in place of that card and draws the rest; any other caller must catch it too.
