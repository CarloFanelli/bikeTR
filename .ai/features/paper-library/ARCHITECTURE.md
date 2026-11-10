---
feature: paper-library
spec-version: 1.0
status: approved
---

# Architecture Plan: Paper Library

## Technical Approach

### Overview

The committed index stays untouched; a new module `docker/coach/app/library.py` owns the saved library, `/data/library.json` in the `coach-data` volume that the service and `coach-tools` already share. It holds the added papers (passages with vectors, plus the search model's name) and the removed base PMIDs, and merges them over the base index: base papers minus removed, plus added, a base paper winning on a shared PMID. Every reader of the index (the Coach request, the library routes, the evaluation's library option) goes through that merge, so a request reads the library once at its start. Adding reuses the build command's PubMed and Europe PMC functions and the passage cutter in a worker thread, so the open-license rule and the passage shape stay one code. New `/coach/library…` routes inherit the same-origin check; a new Libreria screen calls them. No new package.

### Shared Concerns

#### The saved library file

- **Appears in**: Task 02, Task 03, Task 04, Task 05
- **Reference example**: `docker/coach/app/spending.py:85-110` (re-read, change and replace under an `fcntl` lock, temp file + `os.replace`)
- **Rule**: every write re-reads the file under the cross-process lock and replaces it whole; an unreadable file is never read as empty and never overwritten: writers refuse with a message, readers fall back to the base papers.
- **Watch out for**: `asyncio.Lock` (`store.py:26`) holds only inside one process, and `coach-tools` is another container → use the `fcntl` lock.

#### The merged index

- **Appears in**: Task 02, Task 03, Task 05
- **Reference example**: `docker/coach/app/papers.py:132-150` (`check_index`)
- **Rule**: one function in `library.py` gives base index + saved library → merged index, then `papers.check_index` on the result; the service, the routes and the evaluation all call it.

#### Library logic out of the screen

- **Appears in**: Task 01, Task 02, Task 03
- **Reference example**: `web/src/core/coach-view.ts` with `web/tests/core/coach-view.test.ts`
- **Rule**: labels, texts and states live in `web/src/core/library-view.ts`, tested with Vitest; `LibraryScreen.vue` only draws (tests cannot load Vuetify screens, `.ai/memory/web-app.md`).

## Per-Task Technical Guidance

### Task 01: library-section

**Files to modify:**
- `docker/coach/app/main.py` — `GET /coach/library` (papers without passages and vectors, plus base/added and dependencies) and `GET /coach/library/{pmid}` (passages with labels, no vectors).
- `web/src/app/router.ts`, `web/src/components/AppSidebar.vue` — `/libreria` route and sidebar item after Coach AI; the comment "cinque sezioni" becomes six.
- `web/src/data/coach.ts` — two calls through `askCoach`.
- `README.md` — Features: the Libreria section.

**Files to create:**
- `docker/coach/app/library.py` — list and passages from the index; dependencies from `protocols.PROTOCOLS` (name) and `selection_rules.RULES` (`sentence()`).
- `web/src/core/library-types.ts` (pattern `coach-types.ts`), `web/src/core/library-view.ts`, `web/src/screens/LibraryScreen.vue` (pattern `CoachScreen.vue`).
- Tests: `docker/coach/tests/test_library.py`, `web/tests/core/library-view.test.ts`.

**Key decisions:**
- The list carries no passages: 50 full texts would make it megabytes; a paper's passages load when it opens.
- Text shown with `{{ }}`, never `v-html`.

**Watch out for:**
- A new route without a mocked screen breaks the routing test, which mocks each `.vue` — `web/tests/app/router.test.ts` → add the Libreria mock; test: `/#/libreria` resolves to it.

---

### Task 02: add-by-pmid

**Files to modify:**
- `docker/coach/app/library.py` — saved library read/write (Shared Concerns), merge, preview, add.
- `docker/coach/app/main.py` — `load_index` (line 61) returns the merged index; `POST /coach/library/preview` and `POST /coach/library` with `{pmid}`.
- `web/src/data/coach.ts`, `web/src/core/library-view.ts`, `web/src/screens/LibraryScreen.vue` — PMID field, preview card, confirm, result line.
- `PROCESS.md` — decisions: PMID only, open license only, personal library.

**Patterns to reuse:**
- `build_index.pubmed`/`parse_article`/`with_text` (lines 105-256) and `httpx.Client(timeout=30)` as at line 337; `papers.cut_passages`; `search.encode_now`.

**Key decisions:**
- Confirm downloads the paper again instead of keeping the preview: no state between the two calls, and a restart in between loses nothing.
- Duplicate and 50-paper checks run again under the lock at confirm.

**Watch out for:**
- `with_text` and `pubmed` block with `time.sleep` and sync httpx (`build_index.py:157,176`) → run them in `asyncio.to_thread`; test: a slow fake PubMed doesn't delay `/coach/status`.
- PubMed answers 200 with no article for an unknown PMID (`parse_article` gives an empty title, `build_index.py:139`) → empty title means unknown PMID; test: fake empty efetch.
- `BuildError` messages name `build_index.py` for its own searches → map only the reachability errors to `CoachError` 502.

---

### Task 03: remove-and-restore

**Files to modify:**
- `docker/coach/app/library.py` — remove (added: delete; base: record PMID), restore, last-paper refusal; removals of PMIDs no longer in the base ignored at merge.
- `docker/coach/app/main.py` — `DELETE /coach/library/{pmid}`, `POST /coach/library/{pmid}/restore`.
- `web/src/core/library-view.ts`, `web/src/screens/LibraryScreen.vue` — confirmation naming dependencies, removed list with restore; a typed PMID of a removed base paper offers restore.

**Patterns to reuse:**
- The saved library file (Shared Concerns); dependency lines from Task 01.

**Key decisions:**
- The library refuses a removal leaving zero papers, so `check_index`'s "no papers" error (`papers.py:137`) never reaches the Coach.

**Watch out for:**
- A removed supporting paper must not reach the card: `card_papers` adds the protocol's paper from the index (`workout.py:124`) → it reads the merged index; test: Whitty removed, cadence workout card without it.

---

### Task 04: reencode-added

**Files to modify:**
- `docker/coach/app/build_index.py` — `--reencode` (line 299) also re-encodes `/data/library.json` passages, under the library lock, after the base index succeeds.
- `docker/coach/app/library.py` — the library's model name checked at merge, refusing with `papers.REENCODE`.
- `README.md` — the re-encode command now covers the library.

**Patterns to reuse:**
- `build_index.reencode` / `finished` for vectors; the saved library file (Shared Concerns).

**Key decisions:**
- Only `--reencode` touches the library; the full rebuild from PubMed leaves it, since added papers don't depend on the base searches.

**Watch out for:**
- A library re-encoded while the base index failed would mix models → re-encode the library only after the base index is written; test: base failure leaves the library file unchanged.

---

### Task 05: evaluation-on-library

**Files to modify:**
- `docker/coach/app/evaluation.py` — `--library` (parser at line 104): loader = merged index from the project file plus `/data/library.json`; `search_only` and the full run both take it; the run records `papers: {source, pmids}`; search-only prints them.
- `docker/coach/app/live_check.py` — `index_from` (line 72) stays the base loader; the library loader sits beside it in `library.py`.
- `eval-runs/README.md` — the option and the new field.

**Patterns to reuse:**
- `live_check.index_from` for the base file; the merged index (Shared Concerns).

**Key decisions:**
- `grading.py` reads no new field: old files stay gradable without a branch.

**Watch out for:**
- An unreadable library must stop the run before the results file is created (`evaluation.py:129`) → load the library first; test: unreadable library, no file written.
