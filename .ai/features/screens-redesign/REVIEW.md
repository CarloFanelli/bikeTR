---
feature: screens-redesign
status: APPROVED
reviewed: 2026-11-11
head: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Review — screens-redesign

**Scope**: 65 files (delta since review head `92c9a49e`, uncommitted work that also holds the already approved ui-redesign; 18 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · convention · segment completion message shows emoji   [ADDRESSED]
**File**: `web/src/components/SegmentPredictions.vue:35`
**Issue**: The message next to "Completa da dettagli attività" shows `segmentsJob.completeProgress` as written, and it starts with ✅ when the completion succeeds or ❌ when it fails (`web/src/app/jobs.ts:139,144`), so Analisi's Segmenti tab shows an emoji.
**Change**: Show it through `splitEmoji` with a `LineIcon` for the icon, as `web/src/screens/HomeScreen.vue:72` does for `streamsJob.progress`.
**Why**: REQ-1 (no emoji) and the spec's edge case "Calculation text with emoji → line icon or dropped".

### F-2 · nit · bug · Dietro le quinte says "not available" while the context is on its way   [ADDRESSED]
**File**: `web/src/screens/CoachScreen.vue:97`
**Issue**: Once a request starts, the context only arrives with the service's first event, so for the first seconds of every run Dietro le quinte says "Contesto non disponibile." even though it is about to appear.
**Change**: While `run.running` and no context has arrived yet, show a waiting line (e.g. "Il contesto arriva appena il servizio lo prepara…") and keep "Contesto non disponibile." for a run that ended without one.
