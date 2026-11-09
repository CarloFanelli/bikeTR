---
feature: passage-search
version: 1.1
status: approved
completed: true
base: 6aadac02f052a4d596a94e4d6c4d5fbf93894ac0
---

# Passage Search

## Overview

The Coach searches its papers by whole abstract and gives the model 4 abstracts cut to 1,200 characters, so the answer cites papers, never the sentences it relied on. This feature cuts every paper into passages of a few whole sentences, from its abstract or, when an open license allows copying it, from its full text. The search starts from the athlete's state and the protocols the selection rules allow today, runs in a local vector database, and gives the model the 4 best papers with 2 passages each. The model cites the passages it used and the workout card quotes them. The evaluation gains a search score: is the expected paper among the 4 found?

## Project Context

- The search runs inside the Coach service with its own small search model: no Ollama, no cloud, offline once installed.
- The paper index is a file committed in git and read by the Coach at every request; `git restore` repairs it.
- An index encoded by another search model is refused with the re-encode command; the search model reads at most 512 tokens of a text.
- Only the build command contacts PubMed, and it replaces the index only once the new one is complete.
- The repository is public on GitHub: any text the index holds is published.
- No Ollama or paid model in development or tests; the user runs chat models on the Mac.
- Results files saved before this feature must stay gradable.
- The selection rules already give, in code, the protocols allowed for a form, hard share and minutes.

## Functional Requirements

### Passages

- REQ-1: The build command cuts each paper into passages of whole sentences, each at most 600 characters, in reading order.
- REQ-2: Each passage carries the label "PMID:n §k", k being its position in the paper, starting at 1.
- REQ-3: A paper uses its full text when Europe PMC holds it under a CC BY, CC BY-SA or CC0 license; otherwise its abstract.
- REQ-4: A full text's passages come from its abstract and body sections, leaving out references, tables, figures, acknowledgments, funding, conflicts and author contributions.
- REQ-5: Each paper in the index records which text it uses and, for a full text, its license and the license's link.
- REQ-6: The re-encode command re-encodes every passage with the current search model, contacting neither PubMed nor Europe PMC.

### Search

- REQ-7: The search text describes the athlete's form, hard share and minutes, plus the names of the protocols the selection rules allow today.
- REQ-8: Every search runs in a local vector database (sqlite-vec) that the Coach builds in memory from the index when it reads it.
- REQ-9: Papers rank by their closest passage; the model receives the 4 best papers, each with its 2 closest passages.
- REQ-10: The prompt lists each paper once, followed by its passages with their labels, instead of the abstract cut to 1,200 characters.
- REQ-11: The card's list of papers found shows the 4 papers, each with the score of its closest passage.

### Citations

- REQ-12: The prompt asks the model to cite passages by label in its rationale and to list the labels it used.
- REQ-13: The card shows each cited paper once, with the passages the model cited from it quoted under the title.
- REQ-14: A quoted full-text passage shows the paper's license, linked, beside the authors.
- REQ-15: A cited label that was not among the passages given never appears on the card.
- REQ-16: When the chosen protocol's supporting paper is not cited, the card adds it, quoting its closest passage when the search found it.

### Evaluation and records

- REQ-17: Live-check and evaluation results files record, for each answer, the passages given, with label and score.
- REQ-18: Grading counts a cited passage label that was not given in that answer as an invented citation.
- REQ-19: The evaluation table gains the column "Expected paper found": situations whose allowed protocols' supporting paper is among the 4 papers found.
- REQ-20: Grading fills the new column for results files saved before this feature, from the papers found they record.
- REQ-21: The evaluation can run the search alone on every situation, calling no chat model, and prints the search score.
- REQ-22: The README's evaluation section shows the search score of this feature's search, from the search-only run, beside the existing rows.
- REQ-23: The trace's paper search step records the search text and each passage given, with its label, paper and score.

### Documentation

- REQ-24: The README's Coach section explains streaming and Stop among its decisions, and its diagram shows the passage search.

## Data & Dependencies

### Information the feature must retain

- **Paper index** — each paper (PMID, title, authors, year, journal, abstract, the text it uses, license and license link for a full text) with its passages (label, text, vector), plus the search model's name. Written whole by the build command; the re-encode command replaces only the vectors and the model name.
- **Vector database** — the passages and their vectors, built in memory from the index each time the Coach reads it; never written to disk.
- **Results files** — each answer also records the passages given (label, score); files saved before this feature keep their format.

### External capabilities relied on

- **PubMed** — the list of papers and their abstracts, as today; build command only.
- **Europe PMC** — each paper's license and its open-access full text, with no account or key; build command only.

## Non-Functional Requirements

- **Performance** — the paper search step of a Coach request (index read, vector database, search) takes under 1 second on the development laptop once the search model is loaded.
- **Performance** — the search-only run on the 27 situations finishes in under 2 minutes on the development laptop.
- **Performance** — `papers_index.json` stays under 3 MB.
- **Performance** — the prompt holds at most 4,800 characters of passage text, the same as today's 4 abstracts cut to 1,200.
- **Security** — the Coach, the live check, the evaluation and the search-only run work with the internet off; only the build command contacts PubMed and Europe PMC.
- **Validation** — every passage fits whole in what the search model reads: none is cut when encoded.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| A single sentence longer than 600 characters | It is cut at the last space before 600 and continues in the next passage; no word is split | REQ-1 |
| A full stop inside a number or an abbreviation ("2.5 W/kg", "e.g.", "Fig. 2", "vs.") | It does not end a sentence | REQ-1 |
| A structured abstract's heading ("METHODS:") | It stays attached to the sentence after it | REQ-1 |
| An abstract under 100 characters | The build stops naming the paper, as today; the previous index is unchanged | REQ-1 |
| A rebuild changes a paper's text (it gains a full text) | Its passages are renumbered from §1; results files keep the labels they recorded | REQ-2 |
| The same k twice within one paper | Never: k is unique within a paper, and the PMID in the label is the paper's own | REQ-2 |
| Europe PMC does not answer or answers with an error | The build stops with a message naming Europe PMC; the previous index is unchanged | REQ-3 |
| License allows copying but Europe PMC has no full text | The paper uses its abstract | REQ-3 |
| License CC BY-NC, CC BY-ND, any other, or none (a free-to-read copy included) | The paper uses its abstract | REQ-3 |
| License written another way ("cc by", "CC BY 4.0", "cc-by-sa") | Recognized as the same license | REQ-3 |
| N/A — concurrent: the build command is run by hand, one at a time | — | REQ-3 |
| A full text with no body sections | The paper uses its abstract, and the command's output says so for that paper | REQ-4 |
| Subsections inside a kept section | Kept, in reading order | REQ-4 |
| Left-out section titles in another form ("Acknowledgements", "Conflict of Interests") | Recognized regardless of case, spelling variant and plural | REQ-4 |
| A body section without a title | Left out: in today's full texts these hold the citation and funding notes | REQ-4 |
| An index from before this feature (no passages) | The Coach refuses it with a message saying how to restore it from git or rebuild it | REQ-5 |
| An abstract paper | Records "abstract" and no license | REQ-5 |
| Internet off | The re-encode command works | REQ-6 |
| Re-encode on an index from before this feature | It stops and asks for a full rebuild; the previous index is unchanged | REQ-6 |
| The rules allow only rest | The search text names rest; the search runs as usual | REQ-7 |
| Hard share unknown | The hard-share words are left out, as today; the allowed protocols are still named | REQ-7 |
| Live check and evaluation | The search text is built the same way from the made-up situation | REQ-7 |
| An index encoded by another search model | Refused with the re-encode command, as today | REQ-8 |
| Two Coach requests at the same time | Each searches its own database; neither waits for the other | REQ-8 |
| The index is rebuilt while BikeTR runs | Used from the next request, without a restart, as today | REQ-8 |
| The index cannot be reached | The same message as today | REQ-8 |
| A paper with a single passage | It brings that one passage | REQ-9 |
| Two papers' closest passages score the same | The paper earlier in the index ranks first, as today | REQ-9 |
| Fewer than 4 papers in the index | All of them, each with up to 2 passages | REQ-9 |
| A passage containing a prompt marker such as "<PROTOCOL_LIST>" | Passages are inserted last, like abstracts today, so the marker is never replaced | REQ-10 |
| The prompt's wording changes | It gets a new prompt version, so its results never mix with the old prompt's | REQ-10 |
| Fewer than 4 papers found | The list shows those found | REQ-11 |
| The score shown | The closest passage's score, with 3 decimals as today | REQ-11 |
| The model cites a paper without a passage ("[PMID:24550842]") | It counts as citing the paper; the card shows the paper without a quote | REQ-12 |
| A label written another way ("PMID 24550842 § 2", "PMID:24550842, §2") | Recognized as the same label | REQ-12 |
| No citation at all | The card shows only the supporting paper, as today | REQ-12 |
| The same passage cited twice | Quoted once | REQ-13 |
| Two passages of one paper cited | Both quoted under one title, in label order | REQ-13 |
| A quoted abstract passage | No license line; the PubMed link as today | REQ-14 |
| The license link | Opens the license page in a new tab | REQ-14 |
| A label of a paper given, with a § not given (§7 when §2 and §5 were given) | Not shown on the card; graded as invented | REQ-15 |
| A label of a paper not in the index | Not shown on the card; graded as invented, as PMIDs today | REQ-15 |
| The fallback rules choose (answer cut off, unreadable, not in the catalog, too long) | The fallback protocol's supporting paper is added, quoting its closest passage when found | REQ-16 |
| A practice protocol | No paper added, as today | REQ-16 |
| The supporting paper is not among the 4 found | Added without a quote | REQ-16 |
| A request that fails before the search | Its answer records no passages given | REQ-17 |
| A results file holds passage labels and scores, not passage text | The file stays small; the label finds the text in the index | REQ-17 |
| A results file from before this feature (PMIDs only) | Graded as today | REQ-18 |
| A label cited both in the rationale and in the list | Counted once | REQ-18 |
| A situation whose allowed protocols are all practice | Not counted (20 of the 27 count today) | REQ-19 |
| A run with repeats | Each situation counts once: the search is the same every time | REQ-19 |
| No situation counts | The column shows "—" | REQ-19 |
| An old answer with no papers found (a failed request) | That situation counts as not found | REQ-20 |
| An old results file whose situations no longer exist | Those situations are skipped, as grading does today | REQ-20 |
| `.env` names a cloud model | The search-only run contacts no model, spends nothing and needs no key | REQ-21 |
| The index is refused | The same message as the Coach, and the run exits with an error | REQ-21 |
| Internet off, Ollama not running | The search-only run works | REQ-21 |
| N/A — concurrent, network, permission: a paragraph of documentation | — | REQ-22 |
| A rebuilt index changes the score | The README is updated by hand from a new search-only run | REQ-22 |
| Phoenix not answering | The Coach answers as usual, as today | REQ-23 |
| "Disconnect from Strava" | Coach-screen traces are deleted as today, passages included | REQ-23 |
| The diagram's paper step | It names passages, the vector database, and the 4 papers with 2 passages each | REQ-24 |
| The Stop decision | It says what Stop ends and how a stopped request's cost is counted, matching the README's money paragraph | REQ-24 |
| N/A — concurrent, network, permission: documentation | — | REQ-24 |

## Out of Scope

- **Full texts without an open license** (3 free-to-read author copies, the non-commercial short-intervals study) — the repository is public, and the non-commercial text is only on the publisher's site, whose terms forbid automatic downloads.
- **Reading PDFs** — open-access full texts come as structured text from Europe PMC; uploading PDFs belongs to the paper library screen.
- **Adding or removing papers** — the library stays the current 17; the paper library screen is the next roadmap step.
- **Passages in the card's list of papers found** — the trace shows every passage given; the card keeps listing papers with a score.
- **A number of papers other than 4** — 4 keeps the prompt size and the search score comparable with today's.
- **Selection-rule source papers as expected papers** — the score follows the existing "Support found" idea: supporting papers of allowed protocols.
- **The "after" row with a chat model** — it needs a chat model, which only runs on the Mac (see Open Questions).

## Open Questions

- The evaluation table's "after" row with a chat model, run on the Mac once the feature is built. (Owner: user)
