---
feature: passage-search
spec-version: 1.1
status: approved
---

# Architecture Plan: Passage Search

## Technical Approach

### Overview

The index stays where it is: a JSON file committed in git, served by nginx and read by the Coach at every request; papers gain passages, each with its own vector, and lose the paper-level vector. Each search builds an in-memory sqlite-vec table from the index just read, so a rebuilt index works from the next request and nothing is written to disk. The search step becomes one function shared by the Coach screen, the live check, the evaluation and the new search-only run, so tasks 02 and 04 reach all four at once; one grading function turns "papers found per situation" into the **Search score**, from results files or from the search-only run. One label parser in `papers.py` serves the card, the results files and grading. No new package besides `sqlite-vec`; the full texts are parsed with the standard library.

### Shared Concerns

#### Browser reference kept for what does not change

- **Appears in**: Task 02, Task 04, Task 05
- **Reference example**: `docker/coach/tests/fixture_data.py:43-50` (the rules section swapped, the rest compared character by character)
- **Rule**: `tests/fixtures/coach_expected.json` is never hand-edited or regenerated (`.ai/memory/coach.md`, Gotchas); change only the assertions for what this feature changes (papers found, papers block, output instructions, search text) and keep the browser comparison for the rest.

#### Test paper index

- **Appears in**: Task 02, Task 03, Task 05
- **Reference example**: `docker/coach/tests/fakes.py:18,50-63` (fixture index, `FakeSearch` returning 10-number vectors)
- **Rule**: `tests/fixtures/papers_index.json` becomes a passage index, cut by the real cutter, with 10-number vectors; pytest never sees the project's index.
- **Watch out for**: rerunning `tests/reference/make_reference.mjs` rewrites this file from the project index (`.ai/memory/coach.md`, Gotchas): don't.

## Per-Task Technical Guidance

### Task 01: search-score

**Files to modify:**
- `docker/coach/app/workout.py` — move the search (index read, search text, papers found; lines 192-198) into one function; `from_context` calls it inside its trace step.
- `docker/coach/app/grading.py` — one function: situations plus papers found per situation give "Expected paper found" (expected = `source_pmid` of allowed protocols, as at lines 91-92); `Scores`, `report`, `TABLE_HEADER`, `table_row` gain it after "Support found".
- `docker/coach/app/evaluation.py` — `--search-only`, handled before `provider.settings()` (line 73): index via `live_check.index_from`, the shared search per situation with `search.encode`, prints the score; no results file, no spending, no tracing.
- `eval-runs/README.md` — score row and search-only command.
- `README.md` — evaluation table header and its 4 rows gain the column, from grading the saved files.
- Tests: `test_grading.py`, `test_evaluation.py`.

**Patterns to reuse:**
- `grading.ratio` for "—"; exit codes as in `evaluation.main` (2: did not start).

**Key decisions:**
- A situation counts once: its first answer without an error gives the papers found; a situation whose answers all failed counts as not found.

**Watch out for:**
- A failed answer has no `papersFound` (`live_check.py:217-219`) → read papers found only from answers without `error`; test: a situation whose only answer failed counts as not found.
- A wrong `.env` stops the run at `evaluation.py:73` → branch before it; test: search-only with a broken cloud `.env` still prints the score.
- "9 of 20 on today's index" can't be a pytest (tests see only the fixture index) → check by running the command once; record the number in the task report.

---

### Task 02: abstract-passages

**Files to modify:**
- `docker/coach/requirements.txt` — `sqlite-vec==0.1.9` (wheels for linux x86_64 and aarch64, March 2026).
- `docker/coach/app/papers.py` — the passage cutter and label; `check_index` requires passages (old index: message with `git restore` and the rebuild command); the search: in-memory `vec0` table with the index's `embeddingDim`, KNN over every passage, papers ranked by closest passage, 4 papers × 2 passages. Drop `cosine` once unused.
- `docker/coach/app/build_index.py` — `finished` cuts and encodes passages (passage text alone), each paper records `abstract` as its text; `reencode` re-encodes passages, refusing an index without them; `search.cut` reports passages over the limit.
- `docker/coach/app/prompts.py` — papers block: each paper once, then its passages with labels; `ABSTRACT_CHARS` goes; still inserted last (lines 56-60).
- `docker/coach/app/workout.py` — `retrievedPapers` score = closest passage.
- `docker/coach/app/tracing.py` — `note_papers`: one document per passage: label, paper title, score; no text, no vector.
- `papers_index.json` — rebuilt (PubMed, free).
- `README.md` — paper index paragraph (225-234), diagram step 3 (122-123).
- Tests: `test_papers.py`, `test_build_index.py`, `test_prompts.py`, `test_workout.py`, `test_tracing.py`, fixture index (see Shared Concerns).

**Key decisions:**
- Passages encoded without the title: measured 14/20 against 13/20 with the final search text.

**Watch out for:**
- `vec0` returns equal distances out of insertion order (measured: rowid 3 before 1) → KNN with k = passage count (cap 4096), then sort by score and index position; test: equal scores keep index order (`test_papers.py:24-28`).
- Tests use 10-number vectors (`fakes.py:54-63`) → declare the `vec0` dimension from `embeddingDim`, never 384; test: the fixture index searches.
- Two requests at once (`test_workout.py:231`) → one in-memory connection per search, never shared; load the extension, then disable loading again.
- `prompt_version` hashes the prompt without papers (`prompts.py:63-67`), so a passage block keeps the abstract runs' version → hash it with one fixed sample paper too; test: the version differs from `d146523f`.
- The image needs `sqlite-vec`: here `docker compose build coach` (starts no Ollama), on the Mac `docker compose up -d --build`; a stale image fails at import.

---

### Task 03: open-license-full-texts

**Files to modify:**
- `docker/coach/app/build_index.py` — per paper, Europe PMC `search?query=EXT_ID:{pmid} AND SRC:MED&resultType=core&format=json` (fields `license`, `pmcid`, verified); with CC BY, CC BY-SA or CC0, `/{pmcid}/fullTextXML`; parse with `xml.etree` (standard library, expat 2.9.0 in the image). Kept: abstract, then titled `body` sections not in the left-out list, without `table-wrap` and `fig`. License link: the creativecommons.org address inside `<license>` (`xlink:href`, `ali:license_ref` or `ext-link`, all three seen). Same client and `PAUSE` as PubMed.
- `docker/coach/app/papers.py` — the cutter runs section by section, so a passage never mixes two sections; `check_index` requires license name and link for a full text.
- `papers_index.json` — rebuilt; `README.md` — which text a paper uses and why.
- Tests: `test_build_index.py` with a fake Europe PMC beside the fake PubMed (one `MockTransport`), a trimmed JATS sample in `tests/fixtures/`.

**Patterns to reuse:**
- `build_index.pubmed` (lines 76-85) for errors naming the service; `BuildError` keeps the old file.

**Key decisions:**
- License name from the search API (`cc by`, `cc by-nc` seen), link from the XML; no Creative Commons link in the XML means the abstract (edge case added at the gate).

**Watch out for:**
- A full text brings about 55-90 passages against 3 for an abstract, so it wins more searches → the per-paper cap (task 02) limits it to 2 passages; run the search-only run before and after and report both scores.
- An unreadable Europe PMC answer → stop the build naming Europe PMC, like an unreadable PubMed answer (`build_index.py:93-95`); test: broken JSON and broken XML leave the index unchanged.

---

### Task 04: search-text-protocols

**Files to modify:**
- `docker/coach/app/prompts.py` — `retrieval_query` appends the names (`PROTOCOLS[id].name`) of the protocols `selection_rules.select` allows (`selection_rules.py:90-94`, unknown hard share already handled).
- Tests: `test_prompts.py` (line 31: the browser query becomes the start of the search text), `test_evaluation.py:84` (unchanged: it compares to `retrieval_query`).

**Key decisions:**
- Names, not ids: the trial that gave 14/20 used names. The search-only run (task 01) measures it: report the score.

---

### Task 05: passage-citations

**Files to modify:**
- `docker/coach/app/papers.py` — one label parser: "PMID:n §k" variants, and bare PMIDs, from text and from the JSON list.
- `docker/coach/app/prompts.py` — output and constraints: "[PMID:n §k]" in `razionale`, labels listed in `passaggiUsati`.
- `docker/coach/app/workout.py` — `decide` receives the papers found; cited labels and PMIDs from list and rationale; each paper once, in first-cited order; given labels quoted in label order; a full text adds its license; the supporting paper quotes its closest passage when found, fallback included. `retrievedPapers` entries gain their passages (label, score).
- `docker/coach/app/live_check.py` — `record` adds `passagesFound` (label, score).
- `docker/coach/app/grading.py` — a cited label not in `passagesFound` is invented; answers without `passagesFound` graded as today.
- `web/src/core/coach-types.ts`, `web/src/core/coach-view.ts`, `web/src/components/CoachWorkoutCard.vue` — quotes and license link (new tab, `rel="noopener"`).
- `eval-runs/README.md`, `live-checks/README.md` — the new field, the invented-citation rule.
- Tests: `test_workout.py`, `test_grading.py`, `test_live_check.py`, `test_prompts.py`, `web/tests/core/coach-view.test.ts`.

**Key decisions:**
- `paperUsati` becomes `passaggiUsati`; grading still reads `paperUsati` in older files.
- The card reads citations from the list and the rationale, each paper once; today only the list, duplicates kept (`workout.py:145-150`).

**Watch out for:**
- `cited_pmids` takes every digit run of a list entry (`grading.py:73`): "PMID:21812820 §2" yields PMID "2", counted invented → parse labels first; test: a given label is not invented.
- `RULE_SOURCES` exempts PMIDs only (`grading.py:33`) → a rule source's label not given is invented (REQ-18); test it.
- Vite reloads before the service is recreated (`.ai/memory/coach.md`) → passages and license optional in `coach-types.ts`; a paper without them shows no quote; test.

---

### Task 06: coach-readme

**Files to modify:**
- `README.md` — Decisions list (lines 131-140): streaming (each step and the model's words reach the screen as they come, `workout.py` `step` and `token` events; a local model on a CPU takes minutes) and Stop (it closes the browser's connection and the service stops the model, `tests/test_cancel.py`; cost as in the money paragraph). Diagram (116-128): the paper step with passages, the vector database and 4 papers × 2 passages; the answer with passage labels. Evaluation section: the final search score from a search-only run.

**Patterns to reuse:**
- The Decisions bullets' shape: bold claim, then the reason.

**Key decisions:**
- Numbers come from runs, as measured (`.ai/memory/coach.md`, Decisions).
