# Task 01: label-rule-by-source

## Objective

The Label rule judges each ride by the right measure: power only when a power meter measured it, heart rate otherwise, each with its own thresholds.

## Context

**Satisfies**: REQ-1, REQ-6, REQ-7

The first measurement showed the rule reading Strava's estimated power and heart rate with power thresholds. Every later task reads the power-meter flag, so it comes first; the thresholds are tuned on the Tuning set only.

## Depends on

None

## Expected Behavior

- Every Labeled ride (Tuning set), every Evaluation set ride and every recent ride in the Coach records whether its power came from a power meter.
- The Label rule reads power only from rides with a power meter; any other ride is judged by average heart rate against LTHR.
- Power and heart rate have separate thresholds for ripetute and recupero, each with a comment naming its source (a published zone model or declared practice).
- The thresholds are chosen by measuring the Tuning set with the measurement command; the chosen run is in the results folder.

## Acceptance Criteria

- [ ] Tuning set and Evaluation set rides each carry the power-meter flag (REQ-1)
- [ ] A ride with estimated power and heart rate is labelled from heart rate alone (REQ-6)
- [ ] A ride with power-meter power is labelled with the power thresholds (REQ-7)
- [ ] Heart-rate thresholds differ from power thresholds, and each names its source (REQ-7)
- [ ] The Label rule scores higher than 23% on the Tuning set, with the run saved (REQ-7)

## Edge Cases

- Tuning set rides drafted before the flag existed → flag inferred: normalized power present means power meter (REQ-1)
- Ride with power meter but no heart rate → judged by power (REQ-1, REQ-6)
- Ride with only estimated power and no heart rate → race flag gives gara, else fondo (REQ-6)
- No LTHR saved → heart-rate rides judged as with no data: gara or fondo (REQ-6, REQ-7)
- No FTP saved → power judged as missing; heart rate used (REQ-7)
- Intensity exactly on a threshold → belongs to the higher label, as today (REQ-7)

## Notes from implementation

- **Known limitation**: the Tuning set run file is not saved yet. Starting Ollama on the Mac was blocked by the session's permissions, and the measurement command also asks the Label model. The rule alone, scored with the same code, gives 95% (38/40) · recupero 1/3 · fondo 30/30 · ripetute 7/7 (was 23%); r19 and r37, both recupero, come out fondo. The user runs `python -m app.label_check` with Ollama on to save the run.
- **REQ-7 / AC 4 — divergence**: the heart-rate ripetute threshold applies only up to 90 minutes, a third condition beyond separate thresholds. Resolution: on long rides heart rate climbs at steady effort (cardiac drift), and three long endurance rides of the Tuning set average above 0.95 of LTHR.
