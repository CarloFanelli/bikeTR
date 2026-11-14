---
feature: tool-calling
status: DRAFT
reviewed: 2026-11-14
head: 548d6284f84415c9fae6e9281d5caffdaed22047
---

# Review — tool-calling

**Scope**: 30 files (diff since the spec's base `cd7bc5ab`; 11 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 1 should-fix · 1 nit

## Findings

### F-1 · should-fix · bug · A multi-turn Draft's trace keeps only its last turn   [ADDRESSED]
**File**: `docker/coach/app/graph.py:178`
**Issue**: `model_turn` calls `tracing.note_model` on the enclosing `draft` step at every turn, so in model mode each turn overwrites the previous one's messages, answer, tokens, cost and `coach.charged`, and Phoenix shows a Draft with two searches as costing only its final turn.
**Change**: Open a trace step of its own for each model turn inside the `draft` step (kind LLM, like `draft` in `KINDS` at `docker/coach/app/tracing.py:40`) and note the turn there, adding a case to `docker/coach/tests/test_tracing.py` where a Draft with one search leaves two turn steps whose tokens add up to the Draft's.
**Why**: a Trace records each step's tokens and cost (glossary: Trace), and REQ-11 makes every turn of a Draft a cost of its own.

### F-2 · nit · dead · A cause phrase no retry can show   [ADDRESSED]
**File**: `docker/coach/app/check.py:138`
**Issue**: `CAUSE_PHRASES["spending_cap"]` is read only by `retry_step`, which runs only when `after_check` sends a Draft back, and `after_check` (`docker/coach/app/graph.py`) never sends one back once the spending cap is reached, which is the only way a Draft gets that cause.
**Change**: Remove the `spending_cap` entry from `CAUSE_PHRASES`.
