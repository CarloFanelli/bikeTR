---
feature: eval-set
status: DRAFT
reviewed: 2026-11-08
head: 34fc087a2abac93bf34164fdc4f01abde49e422e
---

# Review — eval-set

**Scope**: 36 files (primary — diff since base `9c524474`; 16 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 3 nit

## Findings

### F-1 · nit · convention · stopped run's totalCost misses the answer in progress   [ADDRESSED]
**File**: `eval-runs/README.md:56`
**Issue**: The `totalCost` row says it is the dollars the run added to the spending total, but when a cloud run is stopped with Ctrl+C during an answer, that answer is charged to the spending total (`docker/coach/app/workout.py:199`) and is never written to the file, because `coach_answer` (`docker/coach/app/live_check.py:102-124`) does not return; the file's `totalCost` is then lower than what the run spent.
**Change**: Add to the `totalCost` row that a run stopped with Ctrl+C leaves out the answer in progress, which the spending total still counts.

### F-2 · nit · convention · README says two rules come from papers, three do   [ADDRESSED]
**File**: `README.md:134`
**Issue**: "Two rules come from papers" is untrue: three selection rules name a paper, the 30%-or-more rule (Seiler 2010) and both below-15% rules, with fresh form and without (Stöggl 2014), as `docker/coach/app/selection_rules.py:74-76` shows.
**Change**: Write "Three rules come from two papers" and say that the below-15% sentence covers both rules.

### F-3 · nit · convention · space after the arrow dropped in an untouched helper   [ADDRESSED]
**File**: `web/src/core/coach-view.ts:32`
**Issue**: The diff rewrote `pubmedUrl` without the space after `=>`, unlike the line before the change and every other arrow function in the file.
**Change**: Restore `=> \`https://pubmed.ncbi.nlm.nih.gov/${pmid}/\``, as in `paperCitation` at `web/src/core/coach-view.ts:34`.
