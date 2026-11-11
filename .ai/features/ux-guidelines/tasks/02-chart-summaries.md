# Task 02: chart-summaries

## Objective

The load, form trend, FTP trend, power curve and heart-rate zone charts each show one sentence saying what the chart shows, readable by a screen reader and by anyone who prefers text.

## Context

**Satisfies**: REQ-3

A chart is an image to a screen reader. One sentence with the latest value and the trend gives the same information in words.

## Depends on

None

## Expected Behavior

- Under each of the five charts, one sentence of at most 25 words: the latest or key value and how it changed.
- The sentence follows the data shown: when segments or streams arrive and the chart changes, the sentence changes too.
- With no data, the sentence says so.

## Acceptance Criteria

- [ ] Load, form trend, FTP trend, power curve and heart-rate zone charts each show one summary sentence (REQ-3)
- [ ] Every sentence has at most 25 words and states at least one number from the chart (REQ-3)
- [ ] A chart without data shows a sentence saying there is no data yet (REQ-3)

## Edge Cases

- Chart with no data → the sentence says there is no data yet, e.g. "Nessun carico negli ultimi 60 giorni" (REQ-3)
- Chart data still arriving (segments, streams) → the sentence follows the data when it arrives (REQ-3)
