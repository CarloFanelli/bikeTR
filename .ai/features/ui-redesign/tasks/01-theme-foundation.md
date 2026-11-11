# Task 01: theme-foundation

## Objective

The whole app switches to direction B's fonts and colours, in a light and a dark theme that follow the computer's setting, and every screen — charts included — stays readable in both.

## Context

**Satisfies**: REQ-1, REQ-7, REQ-9, REQ-10

Everything else draws on this: the shell and the pilot screens use its colours and fonts, and without it the light theme would leave dark boxes on every screen. The choice the athlete makes arrives in Task 02; this task only stores and applies it.

## Depends on

None

## Expected Behavior

- Headings use Space Grotesk, text uses Inter; both are served by the app itself.
- The app has a light and a dark theme in direction B: a warm off-white or near-black ground, thin dividers, one accent colour.
- With no saved choice the theme follows the computer's light/dark setting, and switches live when that setting changes.
- A saved choice ("Sistema", "Chiaro", "Scuro") is read at startup and applied before the first screen shows.
- No screen keeps a fixed dark or light background: cards, notices, calendar days, plan rows, maps' frames and Coach cards take their colours from the active theme.
- Charts' axes, grid lines, legends and tooltips use the active theme's colours and redraw when it changes.

## Acceptance Criteria

- [ ] Headings show Space Grotesk and body text Inter, with no request to an outside font server (REQ-1)
- [ ] With no saved choice, switching the computer to dark switches the app without reload (REQ-7)
- [ ] Every screen shows text at ≥ 4.5:1 contrast in both themes (REQ-9)
- [ ] No component keeps a fixed dark or light background colour in either theme (REQ-9)
- [ ] Changing theme redraws an open chart's axes, grid and tooltip in the new theme's colours (REQ-10)

## Edge Cases

- Font files fail to load → text falls back to the system sans-serif; layout unchanged (REQ-1)
- Browser does not report a light/dark setting → light theme (REQ-7)
- Computer switches to dark while the app is open, choice "Sistema" → app switches without reload (REQ-7)
- Saved theme value is unreadable or unknown → treated as "Sistema" (REQ-8)
- Non-pilot screen with hard-coded dark colours (load chart, plan rows, calendar) in light theme → uses the theme's colours; text stays readable (REQ-9)
- Connect screen and loading message, before Strava data → shown in the active theme (REQ-9)
- Load-type colours on charts in light theme → bars still distinguishable by lightness, not hue alone (REQ-10)
- Theme changes while a chart is shown → chart redraws in the new theme without reload (REQ-10)

## Notes from implementation

- **Known limitation**: series colours of Analisi's charts and cards (training zones, plan roles, FTP and power lines, gold "best" marks, map route) keep their fixed hues; they are lines and bars, not text or backgrounds, but gold is pale on the light theme. To refine when Analisi is redesigned. /dev, 2026-11-10.
- **Impacts Task 02**: the `biketr_ui` row of README §7 still describes the sidebar; update it to `{theme}` when the sidebar is removed. /dev, 2026-11-10.
