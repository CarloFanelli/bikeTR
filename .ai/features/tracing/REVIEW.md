---
feature: tracing
status: DRAFT
reviewed: 2026-11-08
head: efc764922b86e2ecc5929073065b722fa005f9e8
---

# Review — tracing

**Scope**: 17 files (primary — diff since base `f01222be`; 12 workflow artifacts under `.ai/` excluded; `.gitignore` left out: the user's own uncommitted change, not part of the feature)
**Findings**: 0 must-fix · 0 should-fix · 1 nit

## Findings

### F-1 · nit · convention · data volume description omits the pending trace deletion   [ADDRESSED]
**File**: `compose.yaml:74-76`
**Issue**: The comment on the Coach's `/data` volume lists what it holds (rides, ride details, the cloud spending total) but not the new pending trace deletion (`trace-deletion.json`), and README §9 (`README.md:305`) lists the same contents with the same gap.
**Change**: Add to both lists that the volume also keeps a trace deletion still waiting for Phoenix after "Disconnetti da Strava", in the same style as the spending total entry.
