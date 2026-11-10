---
feature: paper-library
version: 1.0
status: approved
completed: false
base: 12d4228818d2f6a1353a6f2a32f329581e25caf4
---

# Paper Library

## Overview

The Coach searches 17 papers fixed in the code, and the athlete can neither see what it reads nor change it. This feature adds a Libreria section to the app: it lists every paper the Coach searches, shows its passages, adds a paper from its PMID after a preview, and removes or restores papers, warning when a workout or a selection rule loses its source. A paper uses its full text only under an open license, otherwise its abstract, so no text is ever copied without permission. Additions and removals are personal: the Coach service keeps them on the athlete's computer, outside git. The evaluation set keeps searching the 17 base papers, and on request searches the library to measure whether a paper helps.

## Project Context

- The 17 base papers live in a committed index file the Coach reads at every request; `git restore` repairs it.
- The repository is public, and passages leave the computer through a cloud chat model and, later, an online deployment.
- The search model runs inside the Coach service, offline: indexing a paper costs no money.
- Only the build command contacts PubMed and Europe PMC today; it already applies the open-license rule.
- Every passage label, citation and grading check identifies a paper by its PMID.
- Five workouts and two selection rules name a supporting paper among the 17.
- No Ollama or paid model in development or tests.
- The app's screens and messages are in Italian.

## Functional Requirements

### Library screen

- REQ-1: A Libreria section in the sidebar lists every paper the Coach searches, with title, authors, year and journal.
- REQ-2: Each listed paper shows whether it is a base paper or added, its passage count, and full text (with license) or abstract.
- REQ-3: Each listed paper names the workouts and selection rules whose supporting paper it is.
- REQ-4: Opening a paper shows its passages in reading order, each with its label "PMID:n §k".
- REQ-5: Each paper links to its PubMed page, and to its Europe PMC full text when the paper uses it.
- REQ-6: Removed base papers appear in a separate list, each with a restore action.

### Adding a paper

- REQ-7: The athlete adds a paper by typing its PMID; the library accepts no file upload.
- REQ-8: Before adding, a preview shows title, authors, year, journal, license, full text or abstract, passage count, and that indexing is free.
- REQ-9: The previewed paper enters the library only when the athlete confirms it.
- REQ-10: An added paper uses its full text only when Europe PMC holds it under CC BY, CC BY-SA or CC0; otherwise its abstract.
- REQ-11: An added paper is cut into passages and encoded exactly like the base papers.
- REQ-12: After adding, the app shows the passages saved and the seconds indexing took.
- REQ-13: At most 50 added papers; the add action is refused beyond that with a message.

### Removing and restoring

- REQ-14: Removing an added paper deletes it from the library; removing a base paper hides it until restored.
- REQ-15: Before removing a supporting paper, the app names the workouts and rules that lose it and asks confirmation.
- REQ-16: A Coach request searches the library as it is when the request starts.

### Storage

- REQ-17: The Coach service saves added papers and removals on the computer, outside git, and keeps them across restarts.
- REQ-18: The committed index of base papers never changes when the library changes.
- REQ-19: The re-encode command also re-encodes the added papers with the current search model.

### Evaluation

- REQ-20: The evaluation set searches the base papers by default; a command option makes it search the library, search-only runs included.
- REQ-21: A results file records whether the base papers or the library were searched, and the PMIDs searched.

## Data & Dependencies

### Information the feature must retain

- Added paper — PMID, metadata, text used (with license and link), passages with vectors and the search model's name; created on confirm, deleted on remove.
- Removed base paper — the PMID of a hidden base paper; created on remove, deleted on restore. A PMID no longer among the base papers is ignored.

### External capabilities relied on

- PubMed — title, authors, year, journal and abstract of a PMID.
- Europe PMC — a paper's license and, under an open license, its full text.

## Non-Functional Requirements

- **Performance** — With the 17 base papers plus 50 added full-text papers, the Coach's paper search takes under 3 seconds on the Mac.
- **Performance** — A preview appears within 20 seconds when PubMed and Europe PMC answer normally.
- **Security** — The library's routes refuse requests from other websites, like every Coach service route.
- **Security** — Titles, authors and passages from PubMed or Europe PMC are shown as text, never as HTML.
- **Validation** — A PMID is 1 to 9 digits; anything else is refused before contacting PubMed, with an Italian message.
- **Validation** — A paper whose abstract is under 100 characters and has no open full text is refused, like the build command.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Library with 1 paper left | Its remove action is refused: the Coach needs at least one paper to search | REQ-1, REQ-14 |
| Saved library file unreadable | The screen shows the base papers with a message; the Coach searches the base papers; the file is left untouched | REQ-1, REQ-17 |
| N/A — concurrent and permission for the read-only views: one local user, nothing changes on view | — | REQ-1–REQ-6 |
| Paper is the source of a workout and a rule | Both are named | REQ-3 |
| Added paper that no workout or rule names | Shows no dependency line | REQ-3 |
| Paper with 1 passage | Opens with that one passage | REQ-4 |
| Paper with full text but no license link | Uses its abstract, as the build command does | REQ-5, REQ-10 |
| No removed base papers | The removed list is hidden | REQ-6 |
| Restoring while another tab restores the same paper | The second restore finds it already restored and does nothing | REQ-6 |
| PMID empty or with letters | Refused before contacting PubMed: "Il PMID è un numero" | REQ-7 |
| PMID already in the library | Refused: "Già in libreria", the paper is named | REQ-7 |
| PMID of a removed base paper | No preview: the app offers to restore it | REQ-7, REQ-6 |
| PMID unknown to PubMed | Refused: "PubMed non conosce il PMID n" | REQ-8 |
| PubMed or Europe PMC unreachable, slow (over 30 s) or HTTP 5xx | Message naming the service; nothing saved; the athlete can retry | REQ-8, REQ-11 |
| Europe PMC answers 500 for a full text it lacks | Treated as unavailable only when the record says it holds the text, as the build command does | REQ-10 |
| Abstract under 100 characters and no open full text | Refused with the reason; nothing saved | REQ-8 |
| Preview left open, then confirmed after another tab added the same PMID | Refused: "Già in libreria" | REQ-9 |
| Same PMID confirmed twice quickly | Added once; the second is refused | REQ-9 |
| License CC BY-NC or no license | Abstract; the preview says the full text isn't used and why | REQ-10 |
| Full text over the search model's 512 tokens per passage | Not possible: passages are at most 600 characters, as for base papers | REQ-11 |
| Indexing interrupted (tab closed, service restarted) | The paper isn't saved; the library is as before | REQ-11, REQ-17 |
| Exactly 50 added papers | The 50th is accepted; the 51st is refused | REQ-13 |
| Removing a paper during a running Coach request | That request keeps the library it started with | REQ-14, REQ-16 |
| Removing a rule's source paper | The rule still prints its source; grading still counts that PMID as given | REQ-15 |
| Removal confirmation cancelled | Nothing changes | REQ-15 |
| Adding while a Coach request runs | That request doesn't see it; the next one does | REQ-16 |
| A git pull changes the base papers | The library shows the new base papers; removals of PMIDs no longer among them are ignored | REQ-18 |
| Added paper with the same PMID as a new base paper after a pull | The base paper wins; the added copy is ignored and shown as "now a base paper" | REQ-17, REQ-18 |
| Added paper encoded by another search model | The Coach refuses with the message naming the re-encode command, as for the base index | REQ-19 |
| Disconnecting from Strava | The library stays: it is not Strava data | REQ-17 |
| Library option with nothing added or removed | Searches the same papers as the default; the results file says "library" | REQ-20, REQ-21 |
| Library option with an unreadable library file | The command stops with the message; no results file | REQ-20 |
| Results files saved before this feature | Still gradable; read as base papers | REQ-21 |

## Out of Scope

- **PDF upload** — avoids copying a text without permission; open papers come from Europe PMC by PMID anyway.
- **Full text of papers without an open license** — no legal risk: such papers use their abstract.
- **Cost in dollars** — indexing uses the free search model; no paid model works on a paper.
- **Sharing the library through git** — the library is personal; the base papers stay the shared set.
- **Editing passages or metadata by hand** — the passages must be what PubMed and Europe PMC hold.
- **Live check on the library** — it compares chat models on a fixed input, which needs the base papers.
- **Finding a paper by title or author** — the PMID is enough for a first version.
- **The library in an online deployment** — belongs to the optional Cloud Run step.
