---
feature: library-reader
spec-version: 1.0
status: approved
---

# Architecture Plan: library-reader

## Technical Approach

### Overview

Libreria becomes one screen on one route record, `/libreria/:pmid?`, so moving between papers, the hint and the add flow (`aggiungi`) never remounts it: the loaded library and passages stay. `web/src/screens/LibraryScreen.vue` keeps the data and actions it has today and splits its template into three components beside it (list, reader, add flow), keeping every file under the 500-line structure check. Title search is one new Coach endpoint, `POST /coach/library/search`, built on the PubMed helpers in `docker/coach/app/build_index.py`; whether a match is already in the library is decided in the browser from the library it already holds. No new packages.

### Shared Concerns

- Pure logic goes in `web/src/core/library-view.ts` with tests in `web/tests/core/library-view.test.ts` (pattern: `pmidError`, `library-view.ts:35`); components only render.
- Two layouts by width with `useDisplay` (`AppTopBar.vue:31-32`), breakpoint 1280 px as in `TrainingScreen.vue`'s media query.

## Per-Task Technical Guidance

### Task 01: split-reader-layout

**Files to modify:**
- `web/src/app/router.ts:36-39` — `/libreria/:pmid?` replaces `/libreria`, same name and title.
- `web/src/screens/LibraryScreen.vue` — the open PMID read from `route.params.pmid`; choosing pushes `/libreria/{PMID}`; `.library` max-width 880 px becomes `page-wide` (`fonts.css:111`); two columns 1fr/3fr from 1280 px.
- `web/src/core/library-view.ts` — the list row line (first author, year, title) and the lookup of the open paper among `papers` (null when unknown, removed or not digits).

**Files to create:**
- `web/src/components/PaperList.vue` — rows (`VList` items, `active` and `aria-current="page"` on the open one), "Tolti" group with Ripristina.
- `web/src/components/PaperReader.vue` — today's `VExpansionPanelText` content (`LibraryScreen.vue:140-170`) as a page: citation heading, links, facts, dependencies, remove, passages.

**Patterns to reuse:** param watching and stale-answer guard `ActivityDetailScreen.vue:39,56`; sticky column below the 64 px top bar `TrainingScreen.vue` (`top: 80px`).

**Key decisions:**
- From 1280 px each column has `height: calc(100dvh - 80px)` and `overflow-y: auto`, so the page itself doesn't scroll.

**Watch out for:**
- Below 1280 px the list and the paper share the window's scroll (`App.vue:29-30`, no `scrollBehavior` in `router.ts:44`) → keep the list mounted with `v-show` and restore `window.scrollY` saved when a paper was opened.
- Removing the open paper (`LibraryScreen.vue:68-72`) leaves the address pointing at it → `router.replace('/libreria')` after a successful removal.

### Task 02: add-flow-in-reader

**Files to modify:**
- `web/src/screens/LibraryScreen.vue` — `pmid` `aggiungi` opens the add flow; the PMID box, preview card and outcome (`LibraryScreen.vue:96-127`) move out; after `confirm` succeeds, push `/libreria/{PMID}` once the list reloads.
- `web/src/components/PaperList.vue` — "Aggiungi un paper" button on top, shown even when the library is unreadable.

**Files to create:**
- `web/src/components/AddPaperPanel.vue` — box, Cerca, preview, Aggiungi/Annulla, removed-base Ripristina; actions emitted to the screen, which owns `previewPaper`/`addPaper` (`data/coach.ts:41,44`).

**Patterns to reuse:** today's flow `LibraryScreen.vue:38-80` unchanged in behaviour; `ErrorNotice` for failures.

**Key decisions:**
- `aggiungi` is not a PMID, so the open-paper lookup of Task 01 already ignores it.

### Task 03: search-by-words

**Files to modify:**
- `docker/coach/app/library.py` — `matches(query)`: `esearch` (`retmax` 10, best-match order) then `esummary` (JSON) for the IDs, each as PMID, first author, year, title, journal; a client with a 10 s timeout; `BuildError` and timeouts become `CoachError(502, "source", …)` as in `fetch` (`library.py:178-195`).
- `docker/coach/app/main.py` — `POST /coach/library/search` `{query}`, run with `asyncio.to_thread` like `library_preview`; header comment lists it.
- `web/src/data/coach.ts` — `searchPapers(query)` like `previewPaper` (`coach.ts:41`).
- `web/src/core/library-types.ts` — the match type.
- `web/src/core/library-view.ts` — input kind (digits only = PMID, else words), each match's state (in library, removed base, addable), no-match line.
- `web/src/components/AddPaperPanel.vue` — results list; picking one previews it by PMID.
- Tests: `docker/coach/tests/test_library.py` (fake `esearch`/`esummary`, pattern `test_build_index.py:131-151`), `web/tests/core/library-view.test.ts`.

**Key decisions:**
- First author formatted as `parse_article` does (`build_index.py:142-143`: "Seiler", "Seiler & Tønnessen", "Seiler et al."), so results read like the list.
- Match state from the library already in the browser: no extra request, same answer as the list.

**Watch out for:**
- PubMed allows 3 requests a second without a key (`build_index.py:38-39`) → pause `PAUSE` between `esearch` and `esummary`, as `fetch_papers` does.
- Two searches in flight → keep only the answer whose query is still the latest, as `ActivityDetailScreen.vue:39` checks the id after `await`.
- Words reach PubMed's `term` unescaped → pass them as an `httpx` param (encoded), never formatted into the URL.
