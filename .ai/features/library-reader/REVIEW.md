---
feature: library-reader
status: APPROVED
reviewed: 2026-11-11
head: da4e260bc9dbe0fee3832153a81eb4a30ebbc2ce
---

# Review — library-reader

**Scope**: 16 files re-verified (delta since review head `0566cd58`, which is the feature's base, so the whole feature; 9 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · should-fix · bug · abandoned word search leaves the add box stuck busy   [ADDRESSED]
**File**: `web/src/screens/LibraryScreen.vue:87-90`
**Issue**: When a word search is still running and the athlete presses Enter on a PMID the browser refuses at once (for example 12 digits, or a removed base paper's PMID), the search is discarded on arrival without clearing `busy`, so "Cerca" stays disabled with its spinner and results can't be picked until another word search runs.
**Change**: In the PMID branch of `lookUp`, set `busy.value = false` right after `searches++`, since the abandoned search no longer owns the flag.
**Why**: Task 03 edge case "Search pressed twice fast → only the last search's results show": the superseded search must not leave the panel in its state either.

### F-2 · nit · bug · one unreadable PubMed summary fails the whole search   [ADDRESSED]
**File**: `docker/coach/app/library.py:216`
**Issue**: esummary answers an unknown or withdrawn PMID with an entry holding only `uid` and `error`; `summary_match` then raises `KeyError` on `title`, and the whole search fails as "Risposta di PubMed illeggibile (esummary)" instead of showing the other matches.
**Change**: Keep only the PMIDs whose entry has a `title` (`if pmid in found and "title" in found[pmid]`), as the list already skips PMIDs missing from `found`, and add a test with one such entry beside `test_words_list_pubmed_matches_in_best_match_order`.

### F-3 · nit · bug · removing the open paper flashes "not in the library"   [ADDRESSED]
**File**: `web/src/screens/LibraryScreen.vue:133-134`
**Issue**: The list is reloaded before the address leaves the removed paper, so for a moment the page shows "Questo paper non è nella libreria." (and on a phone jumps to the list) before going back to the hint.
**Change**: Call `router.replace('/libreria')` when the removal succeeds, before reloading the list with `libraryPapers()`.
