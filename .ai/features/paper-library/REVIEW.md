---
feature: paper-library
status: DRAFT
reviewed: 2026-11-10
head: 1b3f2f5e0a41fbd0b486b8c38fc12c6c35cf4ccb
---

# Review — paper-library

**Scope**: 24 files (primary — diff since base `12d42288`; 15 workflow artifacts under `.ai/` excluded)
**Findings**: 1 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · bug · shadowed added paper not labeled as now base   [ADDRESSED]
**File**: `docker/coach/app/library.py:126-131`
**Issue**: when a git pull brings a base paper with the PMID of an added paper, the listing shows only the base copy with origin "base", so Libreria never says the athlete's added paper is now among the base papers.
**Change**: in `listing`, mark the base papers whose PMID is also in the saved library's `added` (a field such as `wasAdded`), and have `originLabel` in `web/src/core/library-view.ts:7` print "ora tra i paper di base" for them; extend `test_an_added_paper_that_became_a_base_paper_is_listed_once_as_base` in `docker/coach/tests/test_library.py` and the origin test in `web/tests/core/library-view.test.ts`.
**Why**: task 02 edge case (REQ-17, REQ-18): "the added copy is ignored and listed as 'ora tra i paper di base'".
