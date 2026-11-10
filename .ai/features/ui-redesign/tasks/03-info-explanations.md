# Task 03: info-explanations

## Objective

A dotted-underlined label opens an **Info popover**, and "Approfondisci" opens the **Info panel**; the first real use is the load chart's explanation of daily load, seen on Allenamento and Analisi.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-32

Both pilot screens move their texts into these two pieces, so they must exist and behave first. The load chart is shared by Allenamento and Analisi, which makes it the natural first consumer: the pattern is visible before either screen is rebuilt.

## Depends on

- Task 01

## Expected Behavior

- A label marked as explained has a dotted underline; click, tap or Enter opens a popover beside it with at most two sentences.
- When the topic has a longer text, the popover ends with "Approfondisci"; it closes the popover and opens the Info panel on that topic.
- On widths ≥ 768 px the Info panel slides in from the right and leaves the screen visible; below 768 px it fills the screen.
- The panel shows a title, up to three plain sentences, then, if present, a collapsed "Dettagli tecnici" section.
- Esc, the close button or a click outside closes a popover or the panel and returns focus to the label.
- One popover and one panel at a time; navigating to another section closes the panel.
- The load chart keeps its legend; its title label opens a popover explaining daily load, with a panel on how load is computed.

## Acceptance Criteria

- [ ] Click, tap and Enter on a dotted label each open its popover, never hover alone (REQ-11)
- [ ] "Approfondisci" appears only for topics with a longer text and opens the panel on that topic (REQ-12)
- [ ] At ≥ 768 px the panel opens on the right with the page visible; below 768 px it fills the screen (REQ-13)
- [ ] Esc, close button and outside click close it and focus returns to the opening label (REQ-14)
- [ ] Panel texts open with ≤ 3 sentences, technical detail collapsed, no code names (REQ-15, REQ-16)
- [ ] The load chart on Allenamento and Analisi shows its legend and a daily-load popover (REQ-32)

## Edge Cases

- Popover near the screen edge → repositions to stay fully inside the screen (REQ-11)
- Touch device (no hover) → popover opens on tap, never only on hover (REQ-11)
- Second popover opened while one is open → first one closes (REQ-11)
- Topic has no longer explanation → popover shows no "Approfondisci" (REQ-12)
- "Approfondisci" clicked → popover closes, panel opens (REQ-12)
- Panel already open, another topic's panel requested → panel content replaced; one panel at a time (REQ-13)
- Phone rotated to landscape at 800 px with panel open → panel switches to side layout; content kept (REQ-13)
- Label scrolled out of view when panel closes → focus returns to it and it scrolls into view (REQ-14)
- Athlete navigates to another section with panel open → panel closes (REQ-14)
- Topic has no technical detail → no "Dettagli tecnici" section (REQ-15)
- Panel text taller than the screen → the panel scrolls on its own; the page behind does not move (REQ-15)
- Explanation needs a formula (e.g. form = fitness − fatigue) → written in words and symbols, not code (REQ-16)
- No rides in the last 30 days → chart shows empty days and a zero average (REQ-32)
- Chart shared with Analisi → Analisi shows the same restyled chart (REQ-32)
