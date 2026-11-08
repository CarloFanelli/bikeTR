---
feature: fallback-reason
status: DRAFT
reviewed: 2026-11-08
head: 635c9202b66faeeddeac7db21e10e2ea19d1ac5c
---

# Review — fallback-reason

**Scope**: 7 files (primary — diff since base `6db4e5da`; 10 workflow artifacts under `.ai/` excluded; `.gitignore` left out: an uncommitted edit outside this feature)
**Findings**: 0 must-fix · 0 should-fix · 1 nit

## Findings

### F-1 · nit · convention · warning field typed as always present   [ADDRESSED]
**File**: `web/src/core/coach-types.ts:43`
**Issue**: `fallbackWarning` is declared `string | null`, while the comment above it says a Coach service started before this field omits it, so the type promises a value the browser may not get.
**Change**: Declare it optional, `fallbackWarning?: string | null`, as `journal?: string | null` at `web/src/core/coach-types.ts:25` does for a field the service may leave out.
