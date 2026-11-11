# Task 04: library-redesign

## Objective

Libreria shows the PMID field above a clean paper list; opening a paper shows its links, licence, text used and passages; adding, removing and restoring work as today.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-20, REQ-21

The paper rows today stack origin, journal, passage count, text used, licence and dependencies in the row title. The row keeps citation, origin and passage count; the rest moves inside the opened paper.

## Depends on

None

## Expected Behavior

- Heading "Libreria" with one line on what the library is.
- PMID field and "Cerca su PubMed"; the preview card and "Aggiungi alla libreria" as today.
- Each paper row: citation, origin chip, passage count.
- Opening a paper: links (PubMed, Europe PMC), licence, text used, which Coach parts depend on it, its passages, and "Togli" or "Cancella".
- "Paper di base tolti" with "Ripristina", as today. No emoji; at 360 px one column.

## Acceptance Criteria

- [ ] PMID field and "Cerca su PubMed" sit above the list; each row shows citation, origin and passage count (REQ-20)
- [ ] An opened paper shows links, licence, text used and passages (REQ-21)
- [ ] Adding, removing and restoring papers work as before (REQ-21)
- [ ] No emoji, no visible text block over 30 words, nothing shown today lost (REQ-1, REQ-3, REQ-4)
- [ ] At 360 px wide no page-wide horizontal scroll (REQ-2)

## Edge Cases

- Library title or texts with emoji → line icon or dropped (REQ-1)
- Long citation at 360 px → wraps (REQ-2)
- Error message longer than 30 words → allowed: error notices are exempt (REQ-3)
- Value shown today only under a condition (removed base papers, licence) → same condition still shows it (REQ-4)
- Library service unreachable → error notice in place of the list; the PMID field stays (REQ-20)
- PMID empty or not a number → search does not start; message as today (REQ-20)
- PMID already in the library → message says so, as today (REQ-20)
- Paper with no journal or no licence → those parts hidden (REQ-21)
- Passages fail to load → error inside the opened paper only (REQ-21)
- Removing a base paper → moves to "Paper di base tolti" with "Ripristina", as today (REQ-21)
