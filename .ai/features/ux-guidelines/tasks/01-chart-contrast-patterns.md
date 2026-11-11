# Task 01: chart-contrast-patterns

## Objective

Every chart's bars, lines and legend swatches are readable against the card in both themes, and in the daily load chart hard and long days can be told apart without colour.

## Context

**Satisfies**: REQ-1, REQ-2

The charts' series colours were fixed bright hues chosen for a dark background; several fall below 3:1 on the light card. Patterns make the load chart readable for colour-blind athletes.

## Depends on

None

## Expected Behavior

- Load, form trend, FTP trend, power curve, power profile and heart-rate zone charts draw series in colours reaching 3:1 against the card, light and dark.
- Legend swatches use the same colours as their series.
- In the daily load chart, hard-day bars carry diagonal stripes and long-day bars dots; the legend shows the same marks.
- Hues stay recognisable: green stays green, orange stays orange.

## Acceptance Criteria

- [ ] Every chart series colour measures at least 3:1 against the card colour in the light and the dark theme (REQ-1)
- [ ] Legend swatches match their series colour in both themes (REQ-1)
- [ ] Hard days show diagonal stripes and long days dots, on bars and legend (REQ-2)
- [ ] Easy, cross-training and rest days stay plain (REQ-2)

## Edge Cases

- Dark theme → darker colours meet 3:1 on the dark card too (REQ-1)
- A day type absent from the chart's period → its legend entry still shows (REQ-1, REQ-2)
- Printing or high-contrast mode → patterns stay, colours may change (REQ-2)
- Bar too thin for a pattern (many days) → pattern scaled down, still visible (REQ-2)
