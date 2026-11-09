---
feature: passage-search
status: APPROVED
reviewed: 2026-11-09
head: 6aadac02f052a4d596a94e4d6c4d5fbf93894ac0
---

# Review — passage-search

**Scope**: 1 file (re-verification — changed since the previous review of `6aadac02`: `web/src/core/coach-view.ts`, the fix; nothing is committed, so git's delta still lists the whole feature, 32 files with 16 workflow artifacts under `.ai/` excluded, and file times show only the fix's file changed after the previous verdict)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · nit · dead · card type exported but never imported   [ADDRESSED]
**File**: `web/src/core/coach-view.ts:40`
**Issue**: `CitedPaper` is exported, but nothing outside `coach-view.ts` imports it: it is only the return type of `citedPapers` in the same file.
**Change**: Drop `export` and keep it a file-local interface, as `web/src/core/dates.ts:5` does for `DateHelpers`, the return type of the exported `buildDateHelpers` (line 15).
