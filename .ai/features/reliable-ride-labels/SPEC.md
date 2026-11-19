---
feature: reliable-ride-labels
version: 1.0
status: approved
completed: true
base: 9750ee8ef73612df2f51a9416e80ec0a05846def
---

# Reliable Ride Labels

## Overview

The first measurement on the Labeled rides gave the Label rule 23% and the Label model 33%: most rides
have no power meter, and the rule read Strava's estimated power and heart rate with power thresholds.
This feature makes Ride labels reliable and measures them honestly: the rule and the model are tuned on
the Tuning set and judged on a separate Check set the user labels. Once labels are on, three new
Selection rules read them, and Attività shows each ride's Ride label as a badge.

## Project Context

- Of 188 saved bike rides, 13 have a power meter (all since 2026-10-06), 50 only Strava's estimated power, 112 heart rate; none is marked as a race.
- The Coach labels only the last 7 days' rides, nearly all with a power meter; the Labeled rides are mostly older rides without one.
- Ride labels stay off by default; the README tells the user to turn them on only after the Check set passes the reliability bar.
- With Ride labels off, today's Coach must not change for the same request.
- New Selection rules follow the existing pattern: first rule that applies wins, each names a paper or declared practice.
- Development and tests use fake models; real measurements are run by the user.

## Functional Requirements

### Labeled rides and honest measurement

- REQ-1: Every Labeled ride and Evaluation set ride records whether its power came from a power meter.
- REQ-2: The Check set holds about 40 Labeled rides sharing no ride with the Tuning set, labelled by the user without proposals.
- REQ-3: The measurement command measures the Tuning set or the Check set, by name; results file and README row name the set.
- REQ-4: Labels are reliable when, on the Check set, at least 80% are right and at least half of each label present.
- REQ-5: The measurement prints how many rides the Label model left without a label.

### Label rule and Label model

- REQ-6: The Label rule never reads power that is not from a power meter; those rides are judged by heart rate.
- REQ-7: The Label rule uses separate intensity thresholds for power and for heart rate, each naming its source.
- REQ-8: The Label model receives each ride's intensity as a share of FTP (power-meter power only) and of LTHR, computed by the Coach.

### Selection rules

- REQ-9: With Ride labels on, a gara yesterday allows only recovery or rest today.
- REQ-10: With Ride labels on, two ripetute or gara rides in the last 3 days allow only easy Z2 days' protocols.
- REQ-11: With Ride labels on, form from +5, at least 3 rides and no ripetute or gara in 7 days favour quality protocols.
- REQ-12: With Ride labels off, Selection rules, prompt and result match today's for the same request.
- REQ-13: Each new rule names its source, a paper or declared practice, and the prompt shows it like existing rules.
- REQ-14: The Evaluation set gains situations for each new rule, with their allowed protocols, graded like the others.

### Attività

- REQ-15: With Ride labels on, each Attività bike ride with power or heart rate shows its Ride label as a badge.
- REQ-16: The badge shows the ride's saved Label model label when present, otherwise the Label rule's.
- REQ-17: With Ride labels off, Attività shows no badge.

### Visibility

- REQ-18: The README describes the Check set, the reliability bar, the new Selection rules and the badge.

## Data & Dependencies

### Information the feature must retain

- Tuning set — today's 40 Labeled rides, gaining the power-meter flag; changed only by hand.
- Check set — about 40 more Labeled rides, in the repository, labelled by the user; never used to tune.
- Which rides each set came from — only on this computer, out of git, so the Check set can avoid the Tuning set's rides.

### External capabilities relied on

- None new: the Label model endpoint and the saved Strava rides already exist.

## Non-Functional Requirements

- **Performance** — badges in Attività add no model call; the Label rule runs on the saved rides.
- **Security** — the Check set has no Strava id, route, real date or real name, like the Tuning set.
- **Validation** — the Check set accepts only the four Ride labels; a ride without one stops the measurement naming it.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|---|---|---|
| Tuning set rides from before the flag | Flag inferred: normalized power present means power meter | REQ-1 |
| Ride with power meter but no heart rate | Judged by power | REQ-1, REQ-6 |
| Fewer than 80 saved rides with data | Check set takes all rides not in the Tuning set and says how many | REQ-2 |
| New rides synced since the Tuning set was drafted | Still excluded from overlap: the local record names the Tuning set's rides | REQ-2 |
| Local record of the Tuning set lost | Command stops saying it cannot avoid overlap | REQ-2 |
| Check set file missing or a ride without a label | Measurement stops naming the file and the ride | REQ-3 |
| A label absent from the Check set (no gara) | That label is not part of the bar | REQ-4 |
| Exactly 80% and exactly half of a label | Reliable (bar inclusive) | REQ-4 |
| Label model answers for some rides only | Missing ones counted wrong and printed as unlabelled | REQ-5 |
| Ride with only estimated power and no heart rate | Label rule: race flag gives gara, else fondo | REQ-6 |
| No LTHR saved | Heart-rate rides judged as with no data: gara or fondo | REQ-6, REQ-7 |
| No FTP saved | Power judged as missing; heart rate used | REQ-7, REQ-8 |
| Intensity exactly on a threshold | Belongs to the higher label, as today | REQ-7 |
| Gara yesterday and 120+ minutes asked | Post-race rule wins over the long-ride rule | REQ-9 |
| Gara two days ago | Post-race rule does not apply | REQ-9 |
| Two ripetute in 3 days and form already in rest range | Rest rule wins, as today's order | REQ-10 |
| One ripetute and one gara in 3 days | Counts as two | REQ-10 |
| Fewer than 3 rides in 7 days | Quality-after-endurance rule does not apply | REQ-11 |
| Labels on, all rides labelled by the rule because the model failed | New rules read those labels | REQ-9, REQ-10, REQ-11 |
| Labels switched off mid-day | Next request uses today's rules only | REQ-12 |
| Evaluation run with labels off | New situations graded on today's rules' answers | REQ-14 |
| Attività ride with no power and no heart rate | No badge | REQ-15 |
| FTP changed since an old ride | Badge uses today's FTP and LTHR | REQ-16 |
| Coach service unreachable when Attività opens | Rides shown without badges, as today | REQ-15, REQ-17 |
| N/A — permission: single local user, no roles | — | REQ-2, REQ-15 |

## Out of Scope

- Tuning on the Check set — it would no longer tell how labels do on unseen rides.
- Labelling the whole history with the Label model — many calls for rides the Coach never reads; the rule is free.
- FTP at the date of each old ride for badges — the FTP history is not a per-ride series yet.
- Labels shown outside Attività — one screen first, until the bar is met on real use.
