---
feature: paper-library
status: APPROVED
reviewed: 2026-11-10
head: ffc9398c5d32927a2878c6f938582b30d6d91702
---

# Review — paper-library

**Scope**: 6 files (re-verification — delta since review head `1b3f2f5e`; 1 workflow artifact under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · bug · shadowed added paper not labeled as now base   [ADDRESSED]
**File**: `docker/coach/app/library.py:126-131`
**Issue**: when a git pull brings a base paper with the PMID of an added paper, the listing shows only the base copy with origin "base", so Libreria never says the athlete's added paper is now among the base papers.
**Change**: in `listing`, mark the base papers whose PMID is also in the saved library's `added` (a field such as `wasAdded`), and have `originLabel` in `web/src/core/library-view.ts:7` print "ora tra i paper di base" for them; extend `test_an_added_paper_that_became_a_base_paper_is_listed_once_as_base` in `docker/coach/tests/test_library.py` and the origin test in `web/tests/core/library-view.test.ts`.
**Why**: task 02 edge case (REQ-17, REQ-18): "the added copy is ignored and listed as 'ora tra i paper di base'".
