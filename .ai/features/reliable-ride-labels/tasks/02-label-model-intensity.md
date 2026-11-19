# Task 02: label-model-intensity

## Objective

The Label model receives each ride's intensity already computed and labels every ride, and the measurement says how many rides it left without a label.

## Context

**Satisfies**: REQ-5, REQ-8

The first measurement showed the Label model calling 17 rides recupero and leaving 7 unlabelled: it was given raw watts and heart rate and asked to judge them itself. The intensity it receives follows the same power-meter rule as Task 01.

## Depends on

Task 01

## Expected Behavior

- Each ride line sent to the Label model carries its intensity as a share of FTP (power-meter power only) and as a share of LTHR, computed by the Coach; a missing share shows as a dash.
- The Label model prompt asks for a label for every ride and says how intensity shares separate recupero, fondo and ripetute.
- The measurement command prints, for the Label model, how many rides got no label.
- The prompt change is measured on the Tuning set; the run is in the results folder.

## Acceptance Criteria

- [ ] Ride lines show share of FTP only for power-meter power, else a dash (REQ-8)
- [ ] Ride lines show share of LTHR when heart rate and LTHR exist, else a dash (REQ-8)
- [ ] The measurement prints the count of rides the Label model left unlabelled (REQ-5)
- [ ] Rides the Label model skips count as wrong in its score (REQ-5)

## Edge Cases

- Label model answers for some rides only → missing ones counted wrong and printed as unlabelled (REQ-5)
- No FTP saved → share of FTP is a dash; heart rate used (REQ-8)

## Notes from implementation

- **Known limitation**: the Tuning set run with the new Label model prompt is not saved yet, for the same reason as Task 01 (Ollama could not be started from this session). The user runs `python -m app.label_check` with Ollama on.
