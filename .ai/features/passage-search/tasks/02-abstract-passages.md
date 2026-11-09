# Task 02: abstract-passages

## Objective

The Coach searches passages cut from the abstracts instead of whole abstracts: the model receives the 4 papers whose passages are closest, each with its 2 closest passages, found in a local vector database.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-5, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-23

The core of the feature: the unit of search becomes the **Passage**. Full texts arrive in task 03 and the new search text in task 04, so this task measures the effect of passages alone (11 of 20 in the trial). REQ-5 is shared with task 03: here every paper records that it uses its abstract.

## Depends on

None

## Expected Behavior

- The build command cuts each paper's abstract into passages of whole sentences, at most 600 characters each, labeled "PMID:n §k" from §1 in reading order.
- The re-encode command re-encodes every passage with the current **Search model**, contacting neither PubMed nor Europe PMC.
- Each paper in the index records that it uses its abstract; the committed index is rebuilt with passages.
- When the Coach reads the index, it loads the passages into an in-memory vector database (sqlite-vec), and every search queries it.
- Papers rank by their closest passage; the model receives the 4 best papers, each listed once with its 2 closest passages and their labels, instead of the abstract cut to 1,200 characters.
- The card's list of papers found shows the 4 papers, each with the score of its closest passage.
- The **Trace**'s paper search step records the search text and each passage given, with its label, paper and score.
- The README's paper index paragraphs and the diagram's paper step describe passages instead of whole abstracts.

## Acceptance Criteria

- [ ] Every passage holds whole sentences, at most 600 characters, labeled "PMID:n §k" and numbered from 1 in reading order (REQ-1, REQ-2)
- [ ] The re-encode command re-encodes every passage without contacting PubMed or Europe PMC (REQ-6)
- [ ] Each paper records that it uses its abstract; an index without passages is refused, saying how to restore or rebuild it (REQ-5)
- [ ] Every search runs in an in-memory sqlite-vec database built from the index the Coach read (REQ-8)
- [ ] The model receives the 4 papers with the closest passages, each once, with its 2 closest passages and their labels (REQ-9, REQ-10)
- [ ] The card's papers-found list shows each paper's closest-passage score (REQ-11)
- [ ] The trace's paper search step records the search text and each passage given, with label, paper and score (REQ-23)

## Edge Cases

- A single sentence longer than 600 characters → cut at the last space before 600 and continued in the next passage; no word is split (REQ-1)
- A full stop inside a number or an abbreviation ("2.5 W/kg", "e.g.", "Fig. 2", "vs.") → it does not end a sentence (REQ-1)
- A structured abstract's heading ("METHODS:") → it stays attached to the sentence after it (REQ-1)
- An abstract under 100 characters → the build stops naming the paper, as today; the previous index is unchanged (REQ-1)
- A rebuild changes a paper's text (it gains a full text) → its passages are renumbered from §1; results files keep the labels they recorded (REQ-2)
- The same k twice within one paper → never: k is unique within a paper, and the PMID in the label is the paper's own (REQ-2)
- An index from before this feature (no passages) → the Coach refuses it with a message saying how to restore it from git or rebuild it (REQ-5)
- An abstract paper → records "abstract" and no license (REQ-5)
- Internet off → the re-encode command works (REQ-6)
- Re-encode on an index from before this feature → it stops and asks for a full rebuild; the previous index is unchanged (REQ-6)
- An index encoded by another search model → refused with the re-encode command, as today (REQ-8)
- Two Coach requests at the same time → each searches its own database; neither waits for the other (REQ-8)
- The index is rebuilt while BikeTR runs → used from the next request, without a restart, as today (REQ-8)
- The index cannot be reached → the same message as today (REQ-8)
- A paper with a single passage → it brings that one passage (REQ-9)
- Two papers' closest passages score the same → the paper earlier in the index ranks first, as today (REQ-9)
- Fewer than 4 papers in the index → all of them, each with up to 2 passages (REQ-9)
- A passage containing a prompt marker such as "<PROTOCOL_LIST>" → passages are inserted last, like abstracts today, so the marker is never replaced (REQ-10)
- The prompt's wording changes → it gets a new prompt version, so its results never mix with the old prompt's (REQ-10)
- The papers section changes form (passages instead of abstracts) → the prompt version changes too, so before and after rows never share a version (REQ-10 · from code)
- Fewer than 4 papers found → the list shows those found (REQ-11)
- The score shown → the closest passage's score, with 3 decimals as today (REQ-11)
- Phoenix not answering → the Coach answers as usual, as today (REQ-23)
- "Disconnect from Strava" → Coach-screen traces are deleted as today, passages included (REQ-23)
