---
feature: library-reader
version: 1.0
status: approved
completed: true
base: 0566cd587dda6ebffbd2534da97df0f1ff0b14c1
---

# Library reader — list and reading area, search by title

## Overview

Libreria is one narrow column today: each paper unfolds in place, so reading one pushes the rest of the list away, and adding a paper needs its PMID. On wide screens the list moves to a left column (25%) and the chosen paper opens in a reading area (75%); on narrower screens the list and the paper take turns. The add box also accepts words: it lists the 10 best PubMed matches to pick from.

## Project Context

- The **Paper library**, **Base paper** and **Added paper** keep their meaning; adding, removing and restoring behave as today.
- Preview then confirmation stays the only way to add a paper; title search only finds the PMID.
- The app's layout switch for this page is 1280 px, as Allenamento's plan and calendar.
- The open paper lives in the address, like an activity's detail (`/attivita/123`).
- The Coach service already calls PubMed; the search goes through it, never from the browser.

## Functional Requirements

### Layout

- REQ-1: From 1280 px, Libreria shows the paper list in a left column of 25% and the reading area in the right 75%.
- REQ-2: From 1280 px, list and reading area scroll separately; the list stays in view while reading a long paper.
- REQ-3: From 1280 px, with no paper chosen, the reading area says "Scegli un paper dall'elenco per leggerlo".
- REQ-4: Below 1280 px, Libreria shows only the list; a chosen paper opens full width with a "Torna all'elenco" button.
- REQ-5: The open paper is in the address (/libreria/{PMID}); reload and the browser's back button keep page and address in step.
- REQ-6: The open paper is highlighted in the list.

### List and reading

- REQ-7: Each list row shows first author, year, title and origin; the row is one tap target of at least 44 px.
- REQ-8: Removed base papers sit in a "Tolti" group at the bottom of the list, each with "Ripristina".
- REQ-9: The reading area shows the paper's citation, origin, links, facts, what depends on it, the remove button and its passages.

### Adding a paper

- REQ-10: An "Aggiungi un paper" button tops the list and opens the add flow in the reading area, at /libreria/aggiungi.
- REQ-11: The add box takes a PMID (digits only) or words; a PMID shows the preview as today.
- REQ-12: Words list up to 10 PubMed matches in best-match order, each with first author, year, title and journal.
- REQ-13: A match already in the library is marked "In libreria"; a removed base paper offers "Ripristina" instead of adding.
- REQ-14: Picking a match shows its preview; confirming adds it as today and opens it in the reading area.

## Data & Dependencies

### Information the feature must retain

- None new: the open paper lives in the address; the library is saved by the Coach service as today.

### External capabilities relied on

- PubMed search by words (through the Coach service), returning PMID, first author, year, title, journal.

## Non-Functional Requirements

- **Performance** — Switching papers shows already-loaded passages at once; a new paper's passages appear within 1 s on the local service.
- **Accessibility** — List rows, results and buttons are at least 44 px tall; the open row is marked for screen readers as current.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Width exactly 1280 px | Two columns | REQ-1, REQ-4 |
| Very long title or author list | Wraps in the list row; no sideways scroll | REQ-1, REQ-7 |
| Library still loading | List shows "Carico la libreria…"; reading area shows the hint | REQ-1, REQ-3 |
| Library unreadable (Coach service down) | Error notice in place of the list; no paper in the reading area; add button still shown | REQ-1, REQ-10 |
| Very long paper | Only the reading area scrolls; the list keeps its place | REQ-2 |
| Short list, long paper (or reverse) | Each column scrolls on its own; no double scrollbar on the page | REQ-2 |
| Address with an unknown or removed PMID | Hint (wide) or list (narrow) and the line "Questo paper non è nella libreria" | REQ-5 |
| Address with an invalid PMID ("abc") | As unknown PMID | REQ-5 |
| Back from a paper on a phone | Returns to the list at the same scroll place | REQ-4, REQ-5 |
| Resizing across 1280 px with a paper open | Same paper stays open in the new layout | REQ-1, REQ-4 |
| Passages fail to load | Error notice inside the reading area; the list and other papers still work | REQ-9 |
| Open paper removed | Leaves the library; page goes to the hint (wide) or the list (narrow) | REQ-5, REQ-9 |
| Removal cancelled in the confirm | Nothing changes | REQ-9 |
| No removed base papers | No "Tolti" group | REQ-8 |
| Restore | Paper returns to the list, removed from "Tolti" | REQ-8 |
| Empty box or spaces only | "Cerca" does nothing; no request | REQ-11 |
| Invalid PMID-like input ("0", 12+ digits) | Today's PMID message | REQ-11 |
| Words with no match | "Nessun paper su PubMed per «{testo}»" | REQ-12 |
| Fewer than 10 matches | Shows those found | REQ-12 |
| PubMed unreachable or slow (> 10 s) | Plain message, "Riprova"; the library is unchanged | REQ-12 |
| Search pressed twice fast | Only the last search's results show | REQ-12 |
| Text with «», quotes or < & | Shown as typed, never as markup | REQ-12 |
| Match already an added or base paper | "In libreria"; tapping it opens that paper | REQ-13 |
| Match is a removed base paper | "Ripristina"; no new download | REQ-13 |
| Preview cancelled | Back to the results, same search | REQ-14 |
| Adding fails (PubMed or save) | Message as today; nothing added; results kept | REQ-14 |
| Two tabs open, paper added in one | The other shows it on its next library load | REQ-14 |
| N/A — permission: one local athlete, no sign-in on Libreria | — | REQ-1–REQ-14 |

## Out of Scope

- Searching inside the papers' text (list filter) — 17-odd papers fit on one screen; revisit if the library grows.
- Paging past 10 PubMed matches — refining the words is faster than paging.
- Opening a paper's full text from Europe PMC inside the app — the links already open it.
- Reordering or grouping papers by topic — no need surfaced.
