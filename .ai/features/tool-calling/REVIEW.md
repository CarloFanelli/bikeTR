---
feature: tool-calling
status: APPROVED
reviewed: 2026-11-14
head: c893e336c2cdfae5a2ba0a6c710e874d9cb79a3c
---

# Review — tool-calling

**Scope**: 3 files changed since the review of `b79dd865` (re-verification; 1 workflow artifact under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

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

### F-3 · should-fix · convention · The README still puts the model's data on the draft step   [ADDRESSED]
**File**: `README.md:317`
**Issue**: the Phoenix step list says the **draft** step holds the chat model, the messages sent, the raw answer, tokens, cost and the dollars charged, but since the fix of F-1 those live on a **turn** step inside each draft (`docker/coach/app/graph.py:156`), so a reader opening a draft step in Phoenix finds none of them.
**Change**: Reword the **draft** bullet as the step that groups one draft's model turns and searches, and add a **turn** bullet, once per model turn, carrying the list of values the draft bullet lists today.
