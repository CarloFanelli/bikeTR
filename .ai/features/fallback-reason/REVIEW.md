---
feature: fallback-reason
status: APPROVED
reviewed: 2026-11-08
head: aa05144b0f4134a9216388ec3defd84ba71217e3
---

# Review — fallback-reason

**Scope**: 1 file (re-verification — delta since review head `635c9202`; 1 workflow artifact under `.ai/` excluded; `.gitignore` left out: an uncommitted edit outside this feature)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · nit · convention · warning field typed as always present   [ADDRESSED]
**File**: `web/src/core/coach-types.ts:43`
**Issue**: `fallbackWarning` is declared `string | null`, while the comment above it says a Coach service started before this field omits it, so the type promises a value the browser may not get.
**Change**: Declare it optional, `fallbackWarning?: string | null`, as `journal?: string | null` at `web/src/core/coach-types.ts:25` does for a field the service may leave out.
