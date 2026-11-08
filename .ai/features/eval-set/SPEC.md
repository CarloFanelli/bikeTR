---
feature: eval-set
version: 1.1
status: approved
completed: false
base: 9c5244744da217cf0021031f662153d2150fe8bc
---

# Evaluation Set

## Overview

BikeTR gets an evaluation set: 25–30 made-up athlete situations, each listing the protocols that the scientific papers, or labeled coaching practice, allow. One command runs them with the chat model `.env` names and saves every answer. A grading command that calls no model scores rule-following, invented or missing citations, fallback use, time and cost. The selection rules are rewritten from the papers: complete, ordered, each naming its paper or "practice", and the missing supporting papers join the paper index. Today's prompt is graded before the rewrite and again after it, the Coach in the app then follows the new rules, and the README gains a Coach section with the before-and-after table. The Coach's shortest workout becomes 30 minutes.

## Project Context

- No model runs on the development laptop: the user runs Ollama and cloud models on the Mac, without Claude Code.
- The papers are the main rules: a selection rule no paper supports is allowed only when labeled practice.
- No paper in today's index gives the form cut-offs, and 6 of the catalog's 8 cited papers are missing from it.
- Today's eight rules leave gaps (form -12 with 10% hard matches none) and clash (time rules against state rules).
- The live check stays as the quick 3-situation check before a 25–30-situation run.
- Cloud answers add to the app's spending total and stop at the same spending cap.
- The search model runs inside the Coach service: free, the same for every chat model, the same papers for the same query.
- Minutes available go from 30 to 240; the hard share is unknown when no ride falls in the last 28 days.

## Functional Requirements

### Papers and selection rules

- REQ-1: Each catalog protocol names a supporting paper whose PubMed title or abstract describes it, or is labeled practice with no paper.
- REQ-2: Every supporting paper is in the Coach's paper index, found through a PubMed search rather than a typed-in ID.
- REQ-3: The selection rules give a non-empty list of allowed protocols for any form, any hard share (unknown included) and 30–240 minutes.
- REQ-4: Each selection rule names its source: the PMID of a paper in the index, or "practice".
- REQ-5: When rules overlap, rest and recovery win first, then the time rules (120 minutes or more, under 50), then the others.
- REQ-6: The fallback rules choose a protocol the selection rules allow, for every situation in the evaluation set.

### Evaluation set

- REQ-7: The evaluation set holds 25–30 situations, each with a one-line description, the athlete numbers the prompt shows, and the minutes available.
- REQ-8: Each situation lists its allowed protocols and names the selection rule it tests.
- REQ-9: The automated tests fail when a situation's allowed list differs from what the selection rules give for its numbers.
- REQ-10: Every selection rule is tested by at least 2 situations, and every numeric threshold by a situation exactly on it.

### Running the evaluation set

- REQ-11: One command runs every situation through paper search, chat model and decision, as a Coach request does, without Strava or the browser.
- REQ-12: Each run writes a new results file into a folder tracked in git, never overwriting an earlier one.
- REQ-13: The results file keeps each whole answer, the papers given, seconds, tokens, cost, charged dollars, chat model and prompt version, never the cloud key.
- REQ-14: The command accepts a repeat count, default 1, and runs every situation that many times.
- REQ-15: With a cloud model, the command prints the worst-case cost and refuses to start when it exceeds what is left under the cap.
- REQ-16: The command prints one line per answer as it finishes, then the run's scores and total charged dollars.

### Grading

- REQ-17: An answer follows the rules when the protocol the model wrote is in the allowed list; unreadable answers and fallback choices never do.
- REQ-18: An answer invents a citation when any PMID in its cited list or its rationale was not among the papers it was given.
- REQ-19: Among answers given their chosen protocol's supporting paper, the support score counts those citing it, in the list or the rationale.
- REQ-20: Each run's scores: rules followed, readable JSON, invented citations, support cited, supporting paper found by search, fallback used, median seconds, cost per answer.
- REQ-21: A grading command re-scores saved results files against the current evaluation set without calling any model or network.
- REQ-22: The grading command prints the README table rows for the results files it is given.

### Prompt rewrite

- REQ-23: The Coach's prompt states the selection rules in order, each with its PMID or "practice", replacing today's eight rules.
- REQ-24: qwen2.5:3b and qwen2.5:7b are graded with today's prompt before the rewrite, and with the rewritten prompt after it.

### Workout length

- REQ-28: The Coach service refuses a duration outside 30–240 minutes with "La durata deve essere tra 30 e 240 minuti".
- REQ-29: The Coach screen's duration field steps by 5 from 30 to 240 minutes, and shows the service's refusal for any other typed value.
- REQ-30: The Coach screen opens with the saved duration, raised to 30 when lower and lowered to 240 when higher; with none saved, 60.

### README

- REQ-25: The README's Coach section opens with the cyclist's problem, then a diagram of a Coach request, the decisions, and how to run the evaluation set.
- REQ-26: The README table shows before and after rows for qwen2.5:3b and qwen2.5:7b, each naming its results file in git.
- REQ-27: The README no longer calls BikeTR experimental.

## Data & Dependencies

### Information the feature must retain

- Evaluation set — the situations and their allowed lists; changed only by a commit, after which saved runs are re-graded instead of re-run.
- Selection rules — written once, read by the prompt, the fallback rules and the automated tests; each rule carries its source.
- Results file — one per run, written once and never changed, tracked in git so a Mac run is graded on the laptop.
- Paper index — gains the supporting papers; rebuilt with the search model, replacing the old file only when complete.
- Spending total — existing; each cloud answer adds to it, as in the app.

### External capabilities relied on

- PubMed search and abstract download — to find and add the supporting papers, free and without a key.
- The chat model `.env` names — Ollama on the Mac or a cloud provider, as chosen by the model switch.

## Non-Functional Requirements

- **Performance** — grading one results file of 30 answers takes under 5 seconds on the development laptop.
- **Performance** — grading the same results file twice gives identical scores.
- **Security** — results files, printed lines and error messages never contain the cloud key.
- **Validation** — a wrong `.env` or a repeat count that is not a whole number of at least 1 is refused in Italian, before any call, with no file.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| A protocol cites a paper about something else (Z2 with cadence drills cites a heavy strength study) | Replaced by a paper found by search that describes it; if none, labeled practice | REQ-1 |
| A protocol with no study behind it (sweet spot, threshold, over-under, tempo, rest) | Labeled practice; its answers are left out of the support score | REQ-1 |
| PubMed unreachable while rebuilding the index | Index file stays as before; the command says why | REQ-2 |
| A PubMed search returns another paper first | The search text is refined until its first result is the intended paper; never a typed PMID | REQ-2 |
| Two protocols share one supporting paper | The paper is in the index once | REQ-2 |
| Form exactly on a cut-off (-25, -15, -10, +5, +10) | Belongs to exactly one rule, stated with "below" or "or more" | REQ-3 |
| Hard share unknown (no ride in 28 days) | A rule covers it; at least one situation tests it | REQ-3 |
| 30 or 240 minutes available | The allowed list is non-empty | REQ-3 |
| An allowed protocol does not fit the minutes (the Coach would switch to Z2) | Never in an allowed list; the automated tests check it | REQ-3 |
| A rule names a PMID not in the index | Automated tests fail, naming the rule | REQ-4 |
| N/A — empty: "practice" is the explicit source when no paper exists | — | REQ-4 |
| Form -20 with 150 minutes | Recovery wins over the long ride | REQ-5 |
| Form -30 with 120 minutes | Rest | REQ-5 |
| Almost no hard riding, form 0, 40 minutes | The under-50-minutes list wins over the quality-session rule | REQ-5 |
| Fallback protocol does not fit the minutes | Automated tests fail, naming the situation | REQ-6 |
| Hard share unknown | The fallback rules still choose an allowed protocol | REQ-6 |
| Fewer than 25 or more than 30 situations | Automated tests fail | REQ-7 |
| Situation without threshold heart rate or weight | Allowed, shown as "—" as today; at least one situation has them missing | REQ-7 |
| Two situations with the same name | Automated tests fail | REQ-7 |
| Empty allowed list | Automated tests fail | REQ-8 |
| Allowed list names a protocol not in the catalog | Automated tests fail | REQ-8 |
| Selection rules changed, situation not updated | Automated tests fail, naming the situation and both lists | REQ-9 |
| N/A — concurrent: the evaluation set is a file changed only by commits | — | REQ-9 |
| A threshold with no situation exactly on it | Automated tests fail, naming the threshold | REQ-10 |
| A rule tested by only one situation | Automated tests fail, naming the rule | REQ-10 |
| Chat model unreachable, or refuses mid-run | That answer records its error, and the run continues with the next | REQ-11 |
| The app is used during a run on the same computer | Both add to the same spending total under its lock; the rides the Coach service saved stay untouched | REQ-11 |
| Two runs start in the same second | The second file gets `-2`; neither is overwritten | REQ-12 |
| Results folder does not exist | Created, owned by the project folder's owner, as for the live check | REQ-12 |
| Provider gives no token counts | Tokens and cost are null; charged holds the high estimate | REQ-13 |
| An error message contains the cloud key | The key is written as `***` | REQ-13 |
| Two prompt texts | Never share a prompt version; the same text always gives the same version | REQ-13 |
| Repeat count 0, negative or not whole | Refused before any call, with no file | REQ-14 |
| Repeat count 3 | Each situation answered 3 times; every answer graded on its own | REQ-14 |
| Worst-case cost exactly equal to what is left | The run starts | REQ-15 |
| Ollama (no prices) | No cost line and no guard | REQ-15 |
| Spending file unreadable | Refuses to start with the existing message | REQ-15 |
| The app spends during the run and the cap is reached | Later answers record the cap error; the file is written and marked incomplete | REQ-15 |
| Every answer fails | The file is still written; the command ends with code 1 | REQ-16 |
| N/A — network: printing is local | — | REQ-16 |
| Answer unreadable or cut off | Does not follow the rules; counted against readable JSON | REQ-17 |
| Model writes an id not in the catalog | Does not follow the rules; counted as fallback used | REQ-17 |
| Model picks a protocol outside the list that the Coach then replaces | Graded on the model's own choice: does not follow | REQ-17 |
| No citations at all | No invented citation | REQ-18 |
| PMID written as a number, or repeated | Counted the same as the text form, once | REQ-18 |
| Chosen protocol is practice, or its supporting paper was not given | Left out of the support score | REQ-19 |
| Supporting paper cited only in the rationale | Counts as cited | REQ-19 |
| Ollama run (no cost) | Cost column shows "—" | REQ-20 |
| No answer succeeded | Scores show 0 answers and "—" | REQ-20 |
| Results file names a situation no longer in the set | That answer is skipped and listed; a new situation without an answer is listed as not run | REQ-21 |
| File unreadable, or a live check file | Refused with a message naming the file | REQ-21 |
| N/A — network: grading reads files only | — | REQ-21 |
| Several files for the same model and prompt version | One row per file | REQ-22 |
| No file given | Refused with a message | REQ-22 |
| A placeholder word inside a paper's abstract | Papers are still inserted last, as today | REQ-23 |
| The app's Coach and the live check after the rewrite | Both use the new prompt and fallback rules | REQ-23 |
| A Mac run stops halfway | Its file is kept but not used for a table row; the run is repeated | REQ-24 |
| N/A — concurrent: the user starts each run by hand, one at a time | — | REQ-24 |
| 29 or 241 minutes | Refused with "La durata deve essere tra 30 e 240 minuti" before any paper search or model call, so nothing is spent | REQ-28 |
| 30 or 240 minutes | Accepted | REQ-28 |
| A tab opened before the update sends 20 | Refused with the same message; reloading the page brings the new field | REQ-28 |
| Duration missing, or not a whole number (45.5) | Refused with "La durata deve essere un numero intero di minuti", as today | REQ-28 |
| The live check and the evaluation set | Already use 45–90 and 30–240 minutes; unchanged | REQ-28 |
| Arrows on the field at 30 or 240 | Stop there; each click moves 5 minutes | REQ-29 |
| Rider types 25 | The refusal appears in the error card; the field keeps 25 until changed | REQ-29 |
| Field left empty | Sends 60, as today | REQ-29 |
| Saved 20 or 29 | Opens at 30 | REQ-30 |
| Saved 30 or 45 | Opens as saved | REQ-30 |
| Saved 300 (typed before this change) | Opens at 240 | REQ-30 |
| Nothing saved, 0, or a saved value that is not a number | Opens at 60 | REQ-30 |
| Rules whose source is practice | The decisions list them, each with why no paper is used | REQ-25 |
| N/A — concurrent/network: the README is static text | — | REQ-25 |
| A row without a results file in git | Not allowed: every row names its file | REQ-26 |
| A cloud model run later | Added as a new row with its file; not required to finish | REQ-26 |
| A row's file is later re-graded with a corrected set | The row is updated from the re-grade | REQ-26 |
| N/A — boundary/empty: removing one label | — | REQ-27 |

## Out of Scope

- **Athlete feedback shaping the next workout** — user decision of 2026-11-07: a later step, measured with this set.
- **Automatic prompt tuning** — same decision: a later step, and every try costs model calls.
- **Keeping every ride and downloading only new ones** — the user's decision recorded under B-11; it does not change what the model reads.
- **Ranking metric for the search** (is the supporting paper first?) — this feature only checks found or not; ranking comes with the real RAG step (B-1).
- **Graph diagram and chunk-size decision from B-7** — the graph and chunks don't exist yet; the diagram shows today's request.
- **A second model grading the rationale** — fixed checks repeat identically and cost nothing.
- **Replacing the live check** — it stays the cheap check before a full run.
- **Adding or removing protocols** — the rewrite changes rules and sources, not which workouts exist.
- **Required cloud rows** — the user decides when to spend.

## Open Questions

- Do Strava's API terms allow sending ride data to a third-party AI provider, which matters for any cloud row? (Owner: Carlo)
