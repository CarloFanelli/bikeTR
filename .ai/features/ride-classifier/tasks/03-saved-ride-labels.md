# Task 03: saved-ride-labels

## Objective

A Ride label given by the Label model is saved with its ride and reused by later requests, so a ride is labelled once per Label model.

## Context

**Satisfies**: REQ-7, REQ-8

Without saving, every Coach request pays one Label model call for rides already labelled. Saved labels belong to Strava rides, so they live with them and leave with them on Disconnect. The Evaluation set and Live check rides are made up and are never saved.

## Depends on

- Task 02

## Expected Behavior

- Each ride labelled by the Label model is saved with its label and the Label model's name.
- A later request uses the saved label (source saved) and asks the Label model only for rides without one.
- A label saved by another Label model than the current one is ignored and replaced.
- Labels from the Label rule are never saved.
- "Disconnetti da Strava" deletes saved labels with the rides.

## Acceptance Criteria

- [ ] A second request on the same rides makes no Label model call and shows source saved (REQ-7)
- [ ] Only rides without a saved label from the current Label model are sent to it (REQ-7, REQ-8)
- [ ] Changing the Label model in `.env` relabels rides and replaces their saved labels (REQ-8)
- [ ] Labels from the Label rule are never saved (REQ-7)
- [ ] Disconnecting from Strava leaves no saved label behind (REQ-7)

## Edge Cases

- All 10 rides already labelled by the current Label model → no call; saved labels used (REQ-6, REQ-7)
- Two requests at once label the same new ride → both may call; the last save wins; both prompts get a valid label (REQ-7)
- Label model changed in `.env` → saved labels from the old model ignored; rides relabelled and saved again (REQ-8)
- FTP changes after a ride was labelled → saved label kept (REQ-7)
- "Disconnetti da Strava" → Ride labels deleted with the rides (REQ-7)
- Stop during the labelling call → no label saved (REQ-11)
