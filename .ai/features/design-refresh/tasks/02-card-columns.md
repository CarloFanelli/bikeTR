# Task 02: card-columns

## Objective

Home, Allenamento, the Analisi tabs and Coach AI spread their cards over up to three columns, so wide screens are no longer mostly empty.

## Context

**Satisfies**: REQ-2, REQ-3, REQ-4, REQ-5

Today every screen is one column capped at 880 px. Card screens get a wider page and a column grid; reading and form screens keep the narrow page.

## Depends on

Task 01

## Expected Behavior

- Card screens use the page width up to 1440 px, with 24 px side margins, centred beyond that.
- Their cards sit in 3 columns from 1280 px, 2 from 768 px, 1 below.
- Cards with a chart, a table or a map span every column of their row.
- Impostazioni, Libreria and Dettaglio attività stay at 880 px.
- In one column, cards keep today's order.

## Acceptance Criteria

- [ ] Home, Allenamento, every Analisi tab and Coach AI show 3 columns at 1280 px, 2 at 768 px, 1 below (REQ-2)
- [ ] Cards with a chart, table or map span the full row at every width (REQ-3)
- [ ] Card screens reach 1440 px wide; Impostazioni, Libreria and Dettaglio attività stay at 880 px (REQ-4)
- [ ] At 360 px no screen scrolls sideways and the card order matches today's (REQ-5)

## Edge Cases

- Width exactly 1280 px / 768 px → 3 columns / 2 columns (REQ-2)
- Last row with fewer cards than columns → cards keep their column width, aligned left (REQ-2)
- Screen with only one card (Coach before a run) → one card, columns not stretched (REQ-2)
- Wide card at 1 column → full width, like every card (REQ-3)
- Wide table inside a wide card at 360 px → table scrolls sideways inside its card (REQ-3)
- Screen wider than 1440 px → content centred, empty space split evenly (REQ-4)
- Width below 360 px → not designed for; page may scroll sideways (REQ-5)

## Notes from implementation

- **REQ-2 — divergence**: every Analisi card holds a chart or a table (load, form, heart-rate zones, power curve, power profile bars, FTP trend, FTP/LTHR tables, segment predictions with sparklines, segment workout rows), so under REQ-3 every one spans the full row: the Analisi tabs sit on the column grid but show one card per row, now up to 1440 px wide. The segment prediction cards inside their card already fill several per row. Columns show on Home, Allenamento and Coach AI.
- **Coach AI layout**: the request card takes one column and the workout (or error) card spans two, beside it from 768 px; Dietro le quinte spans the full row. The plan said the workout spans every column; two columns keep the request and the result side by side on a wide screen.
