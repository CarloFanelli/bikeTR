---
feature: tool-calling
spec-version: 1.0
status: approved
---

# Architecture Plan: Tool Calling

## Technical Approach

### Overview

The Coach graph keeps its nodes; the Search mode travels in the graph's per-request context, read once per request next to the Chat model settings. In model mode the papers node only loads the index and starts an empty list of passages found, and the Draft node becomes a short loop: stream a model turn, run any Model searches it asks for, append the tool answers, stream again, until the model answers without asking or the Draft's limits end it. Both providers learn one new stream piece, a tool call, so the graph never sees Ollama or OpenAI fields. The Check, the deliver node and the results file keep reading one list of passages found, which in model mode is the merge of every Model search of the request.

### Shared Concerns

#### Search mode in the request context

- **Appears in**: Task 01, Task 03, Task 04
- **Reference example**: `docker/coach/app/provider.py:71` (`settings()` read per request, Italian message naming the `.env` line)
- **Rule**: the mode is read with the Chat model settings at each request's start and passed down through the graph's request context; no module reads the environment on its own.
- **Watch out for**: `compose.yaml:8` passes each setting by name to the Coach container; a setting missing there is never seen.

#### Fake models that call tools

- **Appears in**: Task 01, Task 02, Task 03, Task 04
- **Reference example**: `docker/coach/tests/fakes.py:79` (`Answers` queue), `:102` FakeOllama, `:145` FakeCloud
- **Rule**: a queued fake answer can be a tool call instead of text; FakeOllama and FakeCloud send it in their own provider's wire format, so tests exercise the real parsing.

## Per-Task Technical Guidance

### Task 01: model-search-mode

**Files to modify:**
- `docker/coach/app/provider.py` — read the Search mode (trimmed, lower-case, empty is fixed); unknown value raises `invalid(...)` naming the setting and both values.
- `compose.yaml`, `.env.example` — pass and document the new setting next to `COACH_PROVIDER`.
- `docker/coach/app/chat.py` — a tool-call piece (id, name, raw arguments).
- `docker/coach/app/ollama.py` — send the tool definition when given, yield tool calls from `message.tool_calls`; a 400 saying the model does not support tools becomes the REQ-13 message.
- `docker/coach/app/prompts.py` — model-mode system prompt: papers section replaced by the instruction to search, citation rules kept; prompt version takes the mode.
- `docker/coach/app/graph.py` — mode in `Request`; papers node loads the index only in model mode; Draft loop with the 3-search limit, the "limit reached" answers and the 3-refusals end; each Draft stores its turn messages so `messages_for` replays them; merged passages kept in `retrieved`.
- `docker/coach/app/main.py`, `live_check.py`, `evaluation.py` — read the mode with `provider.settings()` and pass it.

**Patterns to reuse:**
- Search: `find_papers` / `papers.top_papers` (`workout.py:179`), with the model's text instead of `retrieval_query`.

**Key decisions:**
- Tool answers list each passage as the fixed prompt does (`prompts.paper_entry`), so labels and citations read the same in both modes.

**Watch out for:**
- Fixed mode must stay byte-identical — `test_prompts.py` compares the prompt with the browser's; any change to `system_prompt`'s fixed path breaks it → branch only on the mode, never edit the fixed template.
- `messages_for` (`graph.py:84`) rebuilds a retry from the last Draft's text only → replay the stored turns, tool calls and tool answers included; test: a retry Draft cites a passage found in Draft 1.
- `fakes.drafts_per_answer` (`fakes.py:90`) counts Drafts by two-message requests → tool turns add requests; count turns separately or the existing tests miscount.

---

### Task 02: cloud-model-search

**Files to modify:**
- `docker/coach/app/cloud.py` — send `tools`; assemble streamed `delta.tool_calls` fragments by index into whole tool calls; finish reason "tool_calls"; a 400 naming tools becomes the REQ-13 message with the provider's text.
- `docker/coach/app/graph.py` — charge each accepted turn inside the Draft loop (today one charge in `draft_node`'s `finally`); sum tokens and cost over turns; check the cap before each new turn and end the Draft for the Fallback rules.
- `docker/coach/app/evaluation.py` — the maximum cost printed before a run counts the most turns a model-mode Draft can make.

**Patterns to reuse:**
- Charging on Stop: `graph.py:113-120` (`accepted` then `charge`); keep it per turn.
- Cap between Drafts: `after_check` (`graph.py:141`).

**Watch out for:**
- Stop during a tool turn — `test_cancel.py` expects the accepted turn charged → the charge stays in a per-turn `finally`; test: cancel after one search.
- Unknown tokens on one turn must make the Draft's total unknown, as `total()` (`graph.py:154`) does across Drafts → sum with `None` propagation.
- `affordable` (`evaluation.py:48`) assumes one call per Draft → in model mode multiply by the turn limit, or a run passes the check and then exceeds the cap.

---

### Task 03: searches-on-screen-traces

**Files to modify:**
- `docker/coach/app/graph.py` — emit one `step("search", …)` per Model search with the text and "ricerca N di 3"; wrap each search in its own trace step.
- `docker/coach/app/tracing.py` — a note for a Model search: Draft number, search text, passages with scores (reuse `note_papers`, add the Draft number).

**Patterns to reuse:**
- Step events: `workout.step` (`workout.py:175`); the browser shows any step's message (`web/src/app/coach-run.ts:48`), so no browser change is needed and Vue's text binding keeps HTML as text.
- Trace steps: `tracing.step` (`tracing.py:150`).

**Key decisions:**
- No browser change: the step message carries the whole sentence, as every other step does.

**Watch out for:**
- Disconnecting deletes traces by time window (`trace_deletion.py`) → nested search steps live inside the request span, so they go with it; test in `test_trace_deletion.py`.

---

### Task 04: evaluation-by-search-mode

**Files to modify:**
- `docker/coach/app/evaluation.py` — results file gets `searchMode`; `--search-only` in model mode prints that it measures the fixed search text.
- `docker/coach/app/live_check.py` — `record` adds each answer's Model searches (Draft, text, PMIDs); output names the mode; `papersFound` already reads the merged `retrievedPapers`, so the search score needs no new code.
- `docker/coach/app/graph.py` — the result carries the Model searches.
- `docker/coach/app/grading.py` — report line and `table_row` show the mode; a file without `searchMode` is fixed.
- `README.md` — Coach section: both modes, the setting, the comparison run.

**Key decisions:**
- The README table gets no new column: model-mode rows write the mode in the Model cell ("qwen2.5:7b · model search"), so the existing rows stay untouched and read as fixed.

**Watch out for:**
- Files in `eval-runs/` have no `searchMode`; `report` and `table_row` (`grading.py:182`, `:207`) index `run[...]` directly → read it with a fixed default; test: grading an existing file from `eval-runs/`.
