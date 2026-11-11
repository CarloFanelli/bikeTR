# Task 01: split-reader-layout

## Objective

On wide screens the athlete reads a paper in the right 75% of Libreria while the list stays on the left; on narrower screens the list and the open paper take turns, and the open paper is in the address.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9

The layout everything else lands in: the add flow (Task 02) and the title search (Task 03) open in the reading area this task creates. Adding a paper stays where it is today until Task 02 moves it.

## Depends on

None

## Expected Behavior

- From 1280 px: list in a left column of 25%, reading area in the right 75%; each scrolls on its own and the list stays in view.
- With no paper chosen (wide), the reading area says "Scegli un paper dall'elenco per leggerlo".
- Below 1280 px: only the list; a chosen paper opens full width with "Torna all'elenco".
- Choosing a paper sets the address to /libreria/{PMID}; reload and back keep it in step.
- The open paper's row is highlighted and marked as current for screen readers.
- Each row shows first author, year, title and origin, one tap target of at least 44 px.
- Removed base papers sit in a "Tolti" group at the bottom of the list, each with "Ripristina".
- The reading area shows citation, origin, links, facts, what depends on it, the remove button and the passages.

## Acceptance Criteria

- [ ] From 1280 px the list takes 25% and the reading area 75%, each scrolling separately (REQ-1, REQ-2)
- [ ] With no paper chosen on a wide screen, the reading area shows the hint (REQ-3)
- [ ] Below 1280 px a chosen paper opens full width with "Torna all'elenco" (REQ-4)
- [ ] /libreria/{PMID} opens that paper on load; back returns to the previous paper or the list (REQ-5)
- [ ] The open paper is highlighted in the list and marked as current (REQ-6)
- [ ] Rows show first author, year, title, origin; removed base papers sit under "Tolti" with "Ripristina" (REQ-7, REQ-8)
- [ ] The reading area shows everything a paper showed when unfolded, passages included (REQ-9)

## Edge Cases

- Width exactly 1280 px → two columns (REQ-1, REQ-4)
- Very long title or author list → wraps in the row; no sideways scroll (REQ-1, REQ-7)
- Library still loading → list shows "Carico la libreria…"; reading area shows the hint (REQ-1, REQ-3)
- Library unreadable → error notice in place of the list; no paper in the reading area (REQ-1)
- Very long paper → only the reading area scrolls; the list keeps its place (REQ-2)
- Short list, long paper (or reverse) → each column scrolls on its own; no double scrollbar on the page (REQ-2)
- Address with an unknown, removed or invalid PMID → hint (wide) or list (narrow) and "Questo paper non è nella libreria" (REQ-5)
- Back from a paper on a phone → the list at the same scroll place (REQ-4, REQ-5)
- Resizing across 1280 px with a paper open → same paper stays open (REQ-1, REQ-4)
- Passages fail to load → error notice inside the reading area; the list and other papers still work (REQ-9)
- Open paper removed → page goes to the hint (wide) or the list (narrow) (REQ-5, REQ-9)
- Removal cancelled → nothing changes (REQ-9)
- No removed base papers → no "Tolti" group (REQ-8)
- Restore → paper returns to the list and leaves "Tolti" (REQ-8)
