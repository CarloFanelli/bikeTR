---
feature: ride-tools
spec-version: 1.0
status: approved
---

# Architecture Plan: Ride Tools

## Technical Approach

### Overview

The two Ride tools join the existing tool loop of the Draft (`app/graph.py` draft node), next to `search_papers`, with their own counter of 4 calls and their own refusal count. A new module `app/ride_tools.py` holds everything the tools say: definitions, ride codes, the Load history and Ride shape text, refusals. It builds answers from a single "ride source": the saved activities, details and series for a Coach screen request, or the situation's made-up data for the Evaluation set. The setting `COACH_RIDE_TOOLS` (off | on) is read like `COACH_RIDE_LABELS` and joins `ChatSettings`, the prompt version and the run record. No new package, no new table: the shape is computed on demand by `app/ride_shape.py`, the daily load by `app/metrics.py`.

### Shared Concerns

#### Ride source

- **Appears in**: Task 01, Task 02, Task 03
- **Reference example**: `app/graph.py:86-93` (labels node: saved activities, details and series only when `"rides" in state`)
- **Rule**: tool answers are built from one object holding the bike rides of the last 14 days (with ride codes), their series and the daily loads of the last 8 weeks; the graph fills it from saved data, the Evaluation set from the situation.

#### Tool call accounting

- **Appears in**: Task 01, Task 02, Task 03
- **Reference example**: `app/graph.py:296-313`
- **Rule**: each tool call is answered by name; paper searches and Ride tool calls have separate counters and refusal counts, and the Draft ends only when one of them reaches its refusal limit, as today.

## Per-Task Technical Guidance

### Task 01: load-history-tool

**Files to modify:**
- `app/provider.py` — `ride_tools()` reader beside `ride_labels()` (:89), allowed `off`/`on`; new `ChatSettings.ride_tools` field (:36).
- `app/graph.py` — draft node: offer the Ride tools when on; dispatch calls by name; separate counter; emit a step per call.
- `app/prompts.py` — tool definitions in the provider format of `SEARCH_TOOL` (:63); one system-prompt sentence about the tools when on; `prompt_version` includes them only when on.
- `app/tracing.py` — `note_ride_tool` beside `note_search` (:211).

**Files to create:**
- `app/ride_tools.py` — ride source, ride codes (`r1`… newest first), Load history text, refusals; pattern `app/labels.py`.

**Patterns to reuse:**
- Weekly sums from `metrics.form_trend` daily loads (`app/metrics.py:177`), hours from activity durations, CTL by replaying the same exponential.
- Tool call accounting (see Shared Concerns).

**Key decisions:**
- Ride codes live only in the request: the model never sees an activity id.
- Model without tools (`app/ollama.py:79`): same error message as model Search mode, naming the ride tools setting (agreed at the gate: a clear error, no silent retry).

**Watch out for:**
- `prompt_version` (`app/prompts.py:111`) changes for every run if the tools enter it while off; guard with a test that the version with the setting off equals today's.
- Fixed Search mode today passes `tools=None` (`app/graph.py:285`); with tools on, the loop must run in fixed mode too, or the model's call is never answered.

### Task 02: ride-shape-tool

**Files to modify:**
- `app/ride_tools.py` — Ride shape answer: code check against the 14-day rides, `ride_shape()` from `app/ride_shape.py` with today's FTP and LTHR, compact text under 2,000 characters.
- `app/prompts.py` — the second tool definition, with a `code` argument.
- `app/graph.py` — dispatch the second tool name.

**Patterns to reuse:**
- `labels.shape_text` (`app/labels.py`) for the wording of blocks, minutes per zone and load per hour.
- Argument parsing of `model_search` (`app/graph.py:202-213`): string or object, missing field, empty value.

**Key decisions:**
- No series → averages from the ride numbers (`metrics.ride_numbers`, `app/metrics.py:226`) with a sentence saying the shape is not available yet.

### Task 03: situation-histories

**Files to modify:**
- `evaluation/situations.json` — every situation gets a `history` block: 8 weeks and 14 days of made-up rides, each with its compact series or shape.
- `app/graph.py` — `from_context` (:425) takes the situation's ride source.
- `app/evaluation.py` — pass it; refuse a situation without history when tools are on; `rideTools` in the run (:161) and Ride tool calls per answer; `affordable` (:42) counts the extra turns.
- `tests/test_evaluation_set.py` — history present and consistent with `recentDays`.

**Key decisions:**
- Store compact made-up series (like `evaluation/labeled_rides.json`) so the real `ride_shape()` computes the answer, not a written-down shape.

**Watch out for:**
- `affordable` multiplies by `prompts.MAX_TURNS` only in model Search mode (`app/evaluation.py:50`); with tools on in fixed mode the cost guard underestimates a cloud run. Add the Ride tool turns.

### Task 04: tool-situations

**Files to modify:**
- `evaluation/situations.json` — at least 4 new situations, each with a `withTools` block: the best protocols inside the rule's allowed list, and the tool answer that decides them.
- `app/grading.py` — a "best choice" score on situations with `withTools`, beside `allowed_for` (:126).
- `tests/test_evaluation_set.py`, `tests/test_grading.py` — `withTools.allowed` is a subset of `allowed`; scoring.
- `eval-runs/README.md` — the off/on rows for one Chat model.

**Key decisions:**
- The Check rejects any protocol outside the rule's list (`app/check.py:111`), so the tools can only help choose inside it: the gain is measured on the best-choice subset (agreed at the gate).
