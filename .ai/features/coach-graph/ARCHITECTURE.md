---
feature: coach-graph
spec-version: 1.0
status: approved
---

# Architecture Plan: Coach Graph

## Technical Approach

### Overview

A new module `docker/coach/app/graph.py` holds one LangGraph `StateGraph`, compiled once at import: nodes rides, metrics, papers, draft, check, deliver, a conditional entry from `START` (rides, or papers when the input already carries the athlete context) and a conditional edge from check back to draft or on to deliver. The graph state holds only data (context, minutes, index, retrieved papers, drafts); per-request objects (`emit`, chat settings and client, `embed`, `load_index`, rides, spending, `now_ms`) travel in the run-scoped `context` (`langgraph/graph/state.py:219`, `ainvoke(..., context=)`), read in this run from the installed 1.2.18. `workout.run` and `workout.from_context` keep their signatures and become thin calls to the graph, so `main.py`, `live_check.py` and `evaluation.py` keep calling them unchanged. The check logic lives in a new pure module `app/check.py`, shared with grading. Dependency: `langgraph==1.2.18` (released 2026-10-26); LangSmith tracing stays off because compose passes the Coach only the variables it lists (`compose.yaml:5-16`) and LangSmith enables only on a `*_TRACING_V2`/`*_TRACING` = "true" variable (`langsmith/utils.py:139`).

### Shared Concerns

#### Drafts and their record

- **Appears in**: Task 01, Task 02, Task 04, Task 05
- **Reference example**: `docker/coach/app/workout.py:247-268` (one model call: tokens, cost, charge, trace, result fields)
- **Rule**: each draft is one entry in the state's `drafts` list: raw answer, parsed choice, input/output tokens, cost, charged, truncated, check result (`ok`, causes, reasons). The result keeps today's fields with request totals (tokens and cost summed, `modelRaw` = last draft) and adds `drafts`, `fallbackCause`, `citationsDropped`.
- **Watch out for**: `record()` in `live_check.py:89` and `grading.model_choice` read `modelRaw`/`truncated` as one answer → `truncated` must be the last draft's, so old graders keep judging the last draft.

#### Code-written reasons

- **Appears in**: Task 01, Task 02, Task 04
- **Reference example**: `docker/coach/app/workout.py:143-154` (`fallback_warning`: catalog names and numbers only)
- **Rule**: every reason sent to the model, shown in a step line or on the card is built in `check.py` from cause codes (`truncated`, `unreadable`, `not_in_catalog`, `too_long`, `not_allowed`, `invented`), catalog names, numbers and labels; never from the model's text.

## Task Breakdown

### Task 01: graph-with-returns

**Files to create**
- `docker/coach/app/graph.py` — state, context dataclass, six nodes, conditional entry and loop; pattern: `workout.py:187-265`.
- `docker/coach/app/check.py` — `MAX_DRAFTS = 3`; usable-answer check returning cause codes and Italian reasons; `parse_model_json` moves or is imported from `workout.py:89`.
- `docker/coach/tests/test_graph.py` — returns, cap, Stop, trace steps.

**Files to modify**
- `docker/coach/app/workout.py` — `run`/`from_context` invoke the graph; `decide` splits into deliver (accepted draft) and fallback with the last draft's cause.
- `docker/coach/app/tracing.py` — step names rides, metrics, papers, draft (LLM kind, `KINDS` at :39), check, deliver; `note_check(attempt, causes)`.
- `docker/coach/tests/fakes.py:70,113` — `FakeOllama`/`FakeCloud` answer a list of answers, one per call.
- `docker/coach/tests/test_tracing.py:23` — new `STEPS`.
- `docker/coach/requirements.txt` — `langgraph==1.2.18`.

**Key decisions**
- Retry messages: the system and user prompt, then the previous answer as `assistant`, then a `user` message with the reasons.
- Before drafts 2 and 3, a cloud request reads `spending.total()` against the limit; reached → route to deliver, no `CoachError`.

**Watch out for**
- `Spending.check` raises 402 (`spending.py:71-78`) → before a later draft compare `total()` with the limit instead; test: cap reached after draft 1 still delivers a workout.
- Stop must still stop the model: cancellation propagates through `ainvoke` (verified) → keep the model stream inside the draft node; test: `tests/test_cancel.py` stays green.
- Draft 2's tokens and charge are lost if totals keep only the last call (`workout.py:247-253`) → sum every draft; test: three cloud drafts charge three times.

### Task 02: rule-and-citation-checks

**Files to modify**
- `docker/coach/app/check.py` — rule check via `select(ctx, minutes)` (`selection_rules.py:90`); citation check via `papers.citations` and `papers.label` (`papers.py:91-101`): given = retrieved passage labels and PMIDs plus today's rule `source_pmid`.
- `docker/coach/app/workout.py` — third-draft outcome: citation-only failure keeps protocol and rationale with `citationsDropped`; `not_allowed` joins `fallback_warning` (:143).
- `docker/coach/app/grading.py:83-93` — `invented` reuses the label check from `check.py` for files with passages.

**Files to create**
- `docker/coach/tests/test_draft_check.py` — rule and citation cases (`test_check.py` already covers the Settings connection check).

**Key decisions**
- Several causes on one draft → all reasons go back; on the last draft any cause other than `invented` sends to the fallback rules.

**Watch out for**
- `tests/test_workout.py:148` asserts a fitting but disallowed protocol is used → this test must flip to "sent back"; test: TSB −12 with 4×8 Seiler then a Z2 draft.
- Grading counts every rule source as given (`grading.py:34`), the check only today's rule → keep grading's set for old files; a citation of another rule's source is the only difference.

### Task 03: allowed-protocols-prompt

**Files to modify**
- `docker/coach/app/prompts.py:12-60` — `system_prompt(papers, ctx, duration)`: protocol list and rule section from `select(ctx, duration)`; Z2 differences only when a Z2 protocol is allowed; `prompt_version` hashes the template with a fixed sample context and duration.
- `docker/coach/app/graph.py` — draft node passes context and minutes.
- `docker/coach/tests/test_prompts.py:30,69-80,117` — reference comparison and rule-section tests follow the narrowed prompt.

**Key decisions**
- The retrieval query (`prompts.py:110-138`) is unchanged: it already uses the allowed protocols.

**Watch out for**
- `prompt_version()` (`prompts.py:57`) calls `system_prompt([VERSION_SAMPLE])` → a missing context crashes every trace and run file; test: version is stable across calls and differs from the old one.

### Task 04: drafts-on-screen

**Files to modify**
- `docker/coach/app/graph.py` — before drafts 2 and 3 emit a `step` event `draft` with `attempt`, `of` and the code-written message.
- `web/src/core/coach-types.ts:95-100` — step event gains optional `attempt`/`of`; `CoachWorkout` gains optional `drafts` (the list; the browser reads its length) and `citationsDropped`.
- `web/src/app/coach-run.ts:47-49` — a `draft` step with `attempt > 1` clears `live`.
- `web/src/core/coach-view.ts` — `draftsNote(workout)`; missing fields mean one draft.
- `web/src/components/CoachWorkoutCard.vue:17` — the note beside the fallback warning.
- `web/tests/coach/coach-run.test.ts`, `web/tests/core/coach-view.test.ts` — cases.

**Key decisions**
- A result without `drafts` (service started before the graph) counts as one draft.

### Task 05: drafts-in-evaluation

**Files to modify**
- `docker/coach/app/live_check.py:89-105` — `record()` writes `drafts` (protocol, raw answer, check result, tokens, cost), `fallbackCause`, `citationsDropped`.
- `docker/coach/app/grading.py:35-151,165-191` — "Rules at first draft" from `drafts[0]`, no `drafts` = one draft; counts per cause, average drafts, citations dropped; summary lines and table columns.
- `docker/coach/app/evaluation.py:47` — worst cost × `MAX_DRAFTS`.
- `eval-runs/README.md` — new fields and columns; `README.md` Coach section diagram; `PROCESS.md` decision.
- `docker/coach/tests/test_grading.py`, `test_evaluation.py`, `test_live_check.py` — cases.

**Watch out for**
- New table columns leave the README's existing rows short → regenerate them by grading the old files (graded as one draft); test: an old fixture file grades with first = last.
