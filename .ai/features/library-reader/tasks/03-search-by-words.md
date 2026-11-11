# Task 03: search-by-words

## Objective

The athlete finds a paper to add by typing words from its title or authors, picking it from up to 10 PubMed matches instead of knowing its PMID.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-13, REQ-14

Absorbs backlog item B-32. The search runs through the Coach service, which already talks to PubMed; picking a match continues into Task 02's preview and confirmation.

## Depends on

02-add-flow-in-reader

## Expected Behavior

- In the add box, digits only mean a PMID (Task 02); anything else searches PubMed by words.
- Up to 10 matches show in PubMed's best-match order, each with first author, year, title and journal.
- A match already in the **Paper library** is marked "In libreria"; tapping it opens that paper.
- A match that is a removed **Base paper** offers "Ripristina" instead of adding.
- Picking any other match shows its preview; confirming adds it and opens it.

## Acceptance Criteria

- [ ] Words list up to 10 PubMed matches with first author, year, title, journal, in best-match order (REQ-11, REQ-12)
- [ ] Matches already in the library show "In libreria" and open that paper when tapped (REQ-13)
- [ ] Matches that are removed base papers show "Ripristina", which restores without downloading (REQ-13)
- [ ] Picking a match shows its preview; confirming adds and opens it (REQ-14)
- [ ] With no match, the page says "Nessun paper su PubMed per «{testo}»" (REQ-12)

## Edge Cases

- Fewer than 10 matches → shows those found (REQ-12)
- PubMed unreachable or slow (> 10 s) → plain message, "Riprova"; the library is unchanged (REQ-12)
- Search pressed twice fast → only the last search's results show (REQ-12)
- Text with «», quotes or < & → shown as typed, never as markup (REQ-12)
- Preview cancelled → back to the results of the same search (REQ-14)
- Adding fails → message as today; nothing added; results kept (REQ-14)
