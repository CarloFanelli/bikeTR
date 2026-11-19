# Task 01: rule-ride-labels

## Objective

With Ride labels set to rule, every ride in the Coach's prompt carries a Ride label given by the Label rule, on the Coach screen, the Live check and the Evaluation set alike.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-4, REQ-5, REQ-9, REQ-17, REQ-18, REQ-20

The Label rule is both the baseline and the fallback of the Label model, so it comes first: it fixes how a label reaches the prompt, the Trace and the results files. The Evaluation set rides gain the fields the classifier reads, so later tasks can be measured on the same situations. REQ-4 here covers only the Ride labels value; REQ-20 only labels and sources.

## Depends on

None

## Expected Behavior

- A `.env` setting reads off, rule or model, trimmed and case-insensitive; missing or empty is off.
- An unknown value fails every Coach request with a message naming the setting and its three values.
- Off: prompt and result identical to today's for the same request; no labelling step.
- Rule: each ride line in the prompt ends with its Ride label (recupero, fondo, ripetute, gara).
- The Label rule: race flag gives gara; intensity ≥ 0.85 of FTP (by normalized or average power) or of LTHR (by average heart rate, when no power) gives ripetute; intensity < 0.65 and ≤ 75 minutes gives recupero; anything else fondo.
- Evaluation set situations' rides carry name, race flag, normalized power, maximum power and maximum heart rate.
- Results files of the Live check and the Evaluation set record the Ride labels setting and, per ride, its label and source.
- Each Trace has a labelling step listing each ride's label and its source (rule).

## Acceptance Criteria

- [ ] Missing, empty or "Off " setting gives today's prompt, byte for byte (REQ-1, REQ-2)
- [ ] An unknown setting value fails every Coach request naming the setting and off, rule, model (REQ-4)
- [ ] With rule, every ride line in the prompt carries exactly one of the four Ride labels (REQ-5)
- [ ] The Label rule gives the documented label at each threshold, including 0.85, 0.65 and 75 minutes exactly (REQ-9)
- [ ] All 27 Evaluation set situations' rides carry name, race flag, normalized power, maximum power and heart rate (REQ-17)
- [ ] Live check and Evaluation set results files record the setting and each ride's label and source (REQ-18)
- [ ] The Trace's labelling step lists each ride's label and source (REQ-20)

## Edge Cases

- Setting value with different case or spaces ("Model ") → read as the trimmed lower-case value (REQ-1)
- Ride labels off but a Label model named → no labelling step, no call (REQ-2)
- No rides in the last 7 days → no labelling; the prompt keeps "Nessuna attività bici negli ultimi 7 giorni." (REQ-2)
- Ride with neither power nor heart rate → race flag gives gara, else fondo (REQ-5, REQ-9)
- Intensity exactly 0.85 → ripetute; exactly 0.65 → fondo; 75 minutes below 0.65 → recupero (REQ-9)
- No FTP and no LTHR → race flag gives gara, else fondo (REQ-9)
- Results file from before this feature graded → read as Ride labels off (REQ-18)
- Phoenix down → the Coach answers as usual; traces lost as today (REQ-20)
