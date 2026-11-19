# Task 03: check-set

## Objective

The user can draft a Check set of new rides, label it, measure the Label rule and the Label model on it, and read whether Ride labels pass the reliability bar.

## Context

**Satisfies**: REQ-2, REQ-3, REQ-4, REQ-18

Tuning on the same rides that judge reliability would hide how labels do on unseen rides. The Check set is drafted once the rule and model are tuned, labelled by the user without proposals, and never used to tune.

## Depends on

Task 01

## Expected Behavior

- The draft command makes a Check set draft of about 40 rides, none of them in the Tuning set, with empty labels and the same anonymization as the Tuning set.
- A local record, out of git, names which saved rides each set came from.
- The measurement command takes the set by name, Tuning set or Check set; the results file and the README row name the set.
- On the Check set it prints whether labels are reliable: at least 80% right and at least half right of each label present, for the rule and for the model.
- The README explains the two sets and the reliability bar.

## Acceptance Criteria

- [ ] The Check set draft shares no saved ride with the Tuning set (REQ-2)
- [ ] The Check set draft carries no label and no proposal (REQ-2)
- [ ] The measurement command measures the set named, and its file and README row name it (REQ-3)
- [ ] On the Check set the verdict reads reliable exactly at 80% and half of each label (REQ-4)
- [ ] A label absent from the Check set is left out of the bar (REQ-4)
- [ ] The README describes the Check set and the reliability bar (REQ-18)

## Edge Cases

- Fewer than 80 saved rides with data → Check set takes all rides not in the Tuning set and says how many (REQ-2)
- New rides synced since the Tuning set was drafted → still excluded: the local record names the Tuning set's rides (REQ-2)
- Local record of the Tuning set lost → command stops saying it cannot avoid overlap (REQ-2)
- Check set file missing or a ride without a label → measurement stops naming the file and the ride (REQ-3)
- Exactly 80% and exactly half of a label → reliable, the bar is inclusive (REQ-4)
- N/A — permission: single local user, no roles (REQ-2)

## Notes from implementation

- **Known limitation**: the Check set is drafted (`labeled-rides-check-draft.json`, 40 rides, none from the Tuning set, 4 with a power meter) but not labelled: by REQ-2 only the user labels it. FTP and LTHR are not saved in the app, so the draft carries the Tuning set's already shifted values, 188 W and 166 bpm. The reliability verdict waits for the user's labels and a `--set check` run with Ollama on.
