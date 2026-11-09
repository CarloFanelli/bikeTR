# Task 05: passage-citations

## Objective

The model cites the passages it used by label, and the workout card quotes them under each cited paper, crediting a full text's license; the evaluation counts passage labels the model invents.

## Context

**Satisfies**: REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18

The answer now says which sentences it relied on. Labels the model invents never reach the card, and grading counts them, as it does for invented PMIDs. Results files record the passages given to each answer, so grading can tell a given label from an invented one.

## Depends on

- Task 02
- Task 03

## Expected Behavior

- The prompt asks the model to cite passages by label in its rationale (for example "[PMID:21812820 §2]") and to list the labels it used.
- The card shows each cited paper once, with the passages the model cited from it quoted under its title, in label order.
- A quoted full-text passage shows the paper's license, linked, beside the authors.
- A cited label that was not among the passages given never appears on the card.
- When the chosen protocol's **Supporting paper** is not cited, the card adds it, quoting its closest passage when the search found it and without a quote otherwise; this also holds when the **Fallback rules** choose.
- Live-check and evaluation results files record, for each answer, the passages given, with label and score.
- Grading counts a cited label that was not given in that answer as an invented citation; files saved before this feature are graded as today.

## Acceptance Criteria

- [ ] The prompt asks for passage labels in the rationale and for the list of labels used (REQ-12)
- [ ] The card shows each cited paper once, its cited passages quoted under the title in label order (REQ-13)
- [ ] A quoted full-text passage shows the paper's license, linked and opening in a new tab, beside the authors (REQ-14)
- [ ] A label not among the passages given never appears on the card (REQ-15)
- [ ] An uncited supporting paper is added, quoting its closest passage when found, also when the fallback rules choose (REQ-16)
- [ ] Live-check and evaluation results files record each answer's passages given, with label and score (REQ-17)
- [ ] Grading counts a cited label not given in that answer as invented; older files are graded as today (REQ-18)

## Edge Cases

- The model cites a paper without a passage ("[PMID:24550842]") → it counts as citing the paper; the card shows the paper without a quote (REQ-12)
- A label written another way ("PMID 24550842 § 2", "PMID:24550842, §2") → recognized as the same label (REQ-12)
- No citation at all → the card shows only the supporting paper, as today (REQ-12)
- The same passage cited twice → quoted once (REQ-13)
- Two passages of one paper cited → both quoted under one title, in label order (REQ-13)
- A quoted abstract passage → no license line; the PubMed link as today (REQ-14)
- The license link → opens the license page in a new tab (REQ-14)
- A label of a paper given, with a § not given (§7 when §2 and §5 were given) → not shown on the card; graded as invented (REQ-15)
- A label of a paper not in the index → not shown on the card; graded as invented, as PMIDs today (REQ-15)
- The fallback rules choose (answer cut off, unreadable, not in the catalog, too long) → the fallback protocol's supporting paper is added, quoting its closest passage when found (REQ-16)
- A practice protocol → no paper added, as today (REQ-16)
- The supporting paper is not among the 4 found → added without a quote (REQ-16)
- A request that fails before the search → its answer records no passages given (REQ-17)
- A results file holds passage labels and scores, not passage text → the file stays small; the label finds the text in the index (REQ-17)
- A results file from before this feature (PMIDs only) → graded as today (REQ-18)
- A label cited both in the rationale and in the list → counted once (REQ-18)
