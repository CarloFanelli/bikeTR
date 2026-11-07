---
feature: eval-set
spec-version: 1.0
status: approved
---

# Architecture Plan: Evaluation Set

## Technical Approach

### Overview

Everything lives in the Coach service (`docker/coach/app/`) and runs as `coach-tools` commands; the browser app is untouched. The selection rules become a small Python module, the one source the evaluation set's tests, the prompt and the fallback rules read; the evaluation set is a JSON file of ready-made athlete contexts (the same keys `coach_context` returns, `metrics.py:217-233`), so situations skip Strava and metrics and enter the Coach right after the context. `workout.run` is split at that point, so the app and the evaluation command share one search–model–decision path. The run command and the grading command reuse the live check's helpers (`live_check.py`) instead of copying them. No new package.

### Shared Concerns

#### Tool commands in coach-tools

- **Appears in**: Task 01, Task 04, Task 05
- **Reference example**: `docker/coach/app/live_check.py` (module docstring with the command, `main(argv, …)` with injectable paths and clock, exit codes 0/1/2)
- **Rule**: each command is `python -m app.{module}` in `coach-tools`, reads `/app` (code, read-only) and writes only under `/project`; it never imports `app.main`, which opens Strava and `/data` at import (`tests/test_live_check.py:66-70` guards this).
- **Watch out for**: the Coach test container mounts only `./docker/coach` (`compose.yaml`, coach volumes), so pytest cannot read `/project/papers_index.json`; checks on the real index live in the command itself.

#### Selection rules as the single source

- **Appears in**: Task 02, Task 03, Task 07
- **Reference example**: `docker/coach/app/protocols.py:206-241` (`PROTOCOLS` data plus `fallback_protocol_id`)
- **Rule**: allowed lists, rule order, sources and the prompt's rule sentences come only from `app/selection_rules.py`; the evaluation set's hand-written lists are checked against it, never generated from it.

#### Italian in code

- **Appears in**: every task
- **Reference example**: `docker/coach/app/live_check.py`
- **Rule**: comments, docstrings, printed lines, error messages and test names in Italian, like the existing files; README, PROCESS.md and `.ai/` prose in English.

## Per-Task Technical Guidance

### Task 01: supporting-papers

**Files to modify:**
- `docker/coach/app/protocols.py:15-19,206-219` — `source_pmid` means the supporting paper, `None` = practice; fix the citations that describe other training.
- `docker/coach/app/build_index.py:36-53` — each `SEARCHES` entry gains the PMID it must return; add searches for the missing supporting papers; drop or fix entries that today return a duplicate or the wrong paper (16 searches give 10 papers).
- `docker/coach/app/build_index.py:111-133` — a first result different from the expected PMID raises `BuildError` (index unchanged), instead of being kept.
- `papers_index.json` — rebuilt with `docker compose run --rm coach-tools python -m app.build_index` (PubMed and the local search model, no chat model).
- `docker/coach/tests/test_protocols.py:23` — compare names with the browser, sources with the new catalog.
- `docker/coach/tests/test_build_index.py` — mismatch stops the build; every non-null `source_pmid` has a search.

**Patterns to reuse:**
- `BuildError` flow, `build_index.py:60-70,183-200`.

**Key decisions:**
- Typed PMIDs stay in the catalog, each confirmed by its search at every rebuild (REQ-2's "found through a search").

**Watch out for:**
- Source cases in the browser reference break when a source changes: `workout.py:141` appends the protocol's source → update `too-short-keeps-source` and `source-already-cited` expectations in `test_workout.py` deliberately; test: both cases.

---

### Task 02: selection-rules

**Files to create:**
- `docker/coach/app/selection_rules.py` — ordered rules: condition on form, hard share (`None` allowed) and minutes; allowed protocol ids; source (PMID or "practice"); the Italian sentence Task 07 puts in the prompt; the numeric thresholds; one function returning the matching rule and its allowed list. Frozen dataclass like `Protocol` (`protocols.py:15-19`).
- `docker/coach/tests/test_selection_rules.py` — grid over form (every integer from -60 to +40), hard share (0–100 and `None`) and minutes (20–240): non-empty list, every allowed protocol's `build` is not `None`, order cases, and sources checked against `build_index.SEARCHES` PMIDs.

**Patterns to reuse:**
- `fallback_protocol_id` (`protocols.py:223-241`) for reading `tsb` and `hardPct` from the same context shape.

**Key decisions:**
- Rules are code, not prose, so the tests can enforce coverage. Content (thresholds, lists, sources) is drafted from the index's abstracts and reviewed with the user before Task 03.

**Watch out for:**
- Today's rule 8 offers sweet spot at 2 reps under 50 minutes, but it needs 50 (`protocols.py` sweet_spot_3x15: 10 + 2×15 + 5 + 5) → the fit test rejects it; test: 49 minutes.

---

### Task 03: evaluation-set

**Files to create:**
- `docker/coach/evaluation/situations.json` — per situation: name, Italian description, rule, allowed list, duration, and a `context` with exactly the keys of `coach_context` (`metrics.py:217-233`). Under `docker/coach` so both the test container and `coach-tools` read it at `/app`.
- `docker/coach/tests/test_evaluation_set.py` — count, unique names, context keys, `user_prompt` renders every situation, allowed list equals `selection_rules` for its numbers, two situations per rule, one on each threshold, missing threshold heart rate and weight, unknown hard share.

**Patterns to reuse:**
- Data path from the module file, as `MADE_UP_RIDES` (`live_check.py:32`); JSON loading as `tests/fixture_data.py`.

**Key decisions:**
- Situations hold the context itself (spec choice); `recentDays` items keep the browser's keys (`data`, `tipo`, `durataMin`, `distanzaKm`, `avgWatts`, `avgHr`) read by `prompts.ride_line`.

**Watch out for:**
- A missing or misspelled context key crashes `user_prompt` mid-run on the Mac (`prompts.py:75-90`) → test builds both prompts for every situation.

---

### Task 04: evaluation-run

**Files to modify:**
- `docker/coach/app/workout.py:153-202` — move everything after the `context` event into a function taking context and duration and returning the result; `run` keeps its signature, events and result keys, adding `rides`.
- `docker/coach/app/prompts.py` — a prompt version: short fingerprint of the system prompt text before papers are inserted.

**Files to create:**
- `docker/coach/app/evaluation.py` — `python -m app.evaluation [--repeat N]`: loads the set, runs each situation, writes `/project/eval-runs/{date}_{time}_{model}.json` with an evaluation marker and `complete`.
- `eval-runs/README.md` — file fields and Mac instructions, like `live-checks/README.md`.
- `docker/coach/tests/test_evaluation.py` — fakes as `tests/test_live_check.py`.

**Patterns to reuse:**
- `live_check.py`: `index_from`, `SituationSpending`, `file_stem`, `write_results`, `money`, `tokens`, `situation()` error handling (99-124).

**Key decisions:**
- Cost guard: answers × `charge(prices, None, None)` (`spending.py:39-42`) against limit minus `Spending.total()` (`spending.py:58`), before any call.
- The file is rewritten after every answer; `complete` turns true only when every answer arrived without an error.

**Watch out for:**
- Splitting `run` must keep the `finally` charging an accepted cloud answer inside the new function (`workout.py:183-189`); test: `test_cancel` and `test_spending` unchanged and green.
- `write_results` creates with `"x"` and never rewrites (`live_check.py:163-178`) → claim the name once, then replace that file atomically, as `build_index.write_index` (149-157).

---

### Task 05: grading

**Files to create:**
- `docker/coach/app/grading.py` — scores for one results file against the current set and catalog; `python -m app.grading FILE…` prints scores and one README row per file.
- `docker/coach/tests/test_grading.py` — hand-written results files in `tmp_path`, one per edge case.

**Files to modify:**
- `docker/coach/app/evaluation.py` — print the scores after the last answer.

**Patterns to reuse:**
- `workout.parse_model_json` (`workout.py:87`) and `js_str` for PMIDs; `[PMID:n]` is the rationale format the prompt asks for (`prompts.py:38`).

**Key decisions:**
- Rules followed: not `fellBack` and the model's `protocolId` in the allowed list. Answers with an error are counted apart, outside the scores. A file without the evaluation marker (a live check file) is refused.

**Watch out for:**
- The Coach adds the protocol's source to the cited papers itself (`workout.py:137-143`) → grade citations from `modelRaw`, never from `paperRefs`; test: an answer citing nothing keeps the support score at 0.

---

### Task 06: before-runs

**Files to modify:**
- `README.md` §5 — new "Evaluation results" table, rows from `python -m app.grading`.
- `eval-runs/*.json` — committed by the user from the Mac.

**Key decisions:**
- No code: `/dev` gives the Mac commands, waits for both files, re-grades them here and writes the rows.

---

### Task 07: prompt-rewrite

**Files to modify:**
- `docker/coach/app/prompts.py:16-31` — the rules section becomes the sentences from `selection_rules`, each with its source; the text outside it stays identical.
- `docker/coach/app/protocols.py:223-241` — `fallback_protocol_id` picks from the matching rule's allowed list, same signature; the rationale text in `workout.py:121-125` stays.
- `docker/coach/tests/test_prompts.py:25-31` — the system prompt equals the browser's with only the rules section replaced.
- `docker/coach/tests/test_protocols.py:35-40` — fallback grid checked against the allowed lists, plus every evaluation situation.
- `docker/coach/tests/test_workout.py` — fallback cases expect the new choice.

**Watch out for:**
- `coach_expected.json` comes from the old browser code (`tests/reference/make_reference.mjs`) and cannot produce the new rules → never hand-edit it; change only the rules and fallback assertions; test: the other browser comparisons still pass.

---

### Task 08: after-runs-readme

**Files to modify:**
- `README.md:3` — remove "Experimental"; §5 becomes the Coach section: problem, ASCII diagram (style of §9, `README.md:239-252`), decisions with the practice rules, run and grade commands, before/after table; §10 (`README.md:292`) no longer says the system prompt matches the browser.
- `PROCESS.md` — new dated section for eval-set decisions, pattern: the model-switch section.
- `eval-runs/*.json` — the after files from the Mac.
