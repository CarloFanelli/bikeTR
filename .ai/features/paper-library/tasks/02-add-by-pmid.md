# Task 02: add-by-pmid

## Objective

The athlete types a PMID, sees a preview of the paper, confirms it, and the paper enters the **Paper library**: the Coach searches it from the next request.

## Context

**Satisfies**: REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-16, REQ-17, REQ-18

The core of the feature. It creates the personal saved library, outside git, that task 03 also writes, and makes the Coach search the **Base papers** plus the **Added papers**. REQ-16, REQ-17 and REQ-18 are shared with task 03 on purpose.

## Depends on

- Task 01

## Expected Behavior

- Libreria has a field for a PMID and a button to look it up; there is no file upload.
- The preview shows title, authors, year, journal, the license, whether the full text or the abstract will be used (and why), the passage count, and that indexing is free.
- Confirming adds the paper; leaving the preview without confirming adds nothing.
- The full text is used only when Europe PMC holds it under CC BY, CC BY-SA or CC0, with a license link; otherwise the abstract.
- The paper is cut into passages and encoded exactly like the **Base papers**.
- After adding, Libreria shows the passages saved and the seconds indexing took, and the paper appears in the list as added.
- The added paper is saved on the computer, survives a restart of the Coach service, and the committed index file does not change.
- A Coach request started after the confirmation can find the added paper; one already running cannot.

## Acceptance Criteria

- [ ] A PMID gives a preview with title, authors, year, journal, license, text used, passage count and "gratis". (REQ-7, REQ-8)
- [ ] Nothing is saved until the athlete confirms the preview. (REQ-9)
- [ ] A CC BY paper uses its full text; a CC BY-NC paper uses its abstract and says why. (REQ-10)
- [ ] Added passages have the same labels, size limit and vectors as the base papers' passages. (REQ-11)
- [ ] After confirming, Libreria shows the passages saved and the seconds taken. (REQ-12)
- [ ] The 51st added paper is refused with a message. (REQ-13)
- [ ] After a restart the added paper is still listed and searched; papers_index.json is unchanged. (REQ-16, REQ-17, REQ-18)

## Edge Cases

- PMID empty or with letters → refused before contacting PubMed: "Il PMID è un numero" (REQ-7)
- PMID already in the library → refused: "Già in libreria", naming the paper (REQ-7)
- PMID unknown to PubMed → refused: "PubMed non conosce il PMID n" (REQ-8)
- PubMed or Europe PMC unreachable, slower than 30 s or HTTP 5xx → message naming the service, nothing saved, the athlete can retry (REQ-8, REQ-11)
- Abstract under 100 characters and no open full text → refused with the reason, nothing saved (REQ-8)
- Europe PMC answers 500 for a full text → asked only when its record says it holds the text, as the build command does (REQ-10)
- Full text with no license link → the abstract is used (REQ-5, REQ-10)
- Preview confirmed after another tab added the same PMID → refused: "Già in libreria" (REQ-9)
- Same PMID confirmed twice quickly → added once, the second refused (REQ-9)
- Indexing interrupted (tab closed, service restarted) → the paper is not saved; the library is as before (REQ-11, REQ-17)
- Exactly 50 added papers → the 50th accepted, the 51st refused (REQ-13)
- Adding while a Coach request runs → that request doesn't see it, the next one does (REQ-16)
- Saved library file unreadable → Libreria shows the base papers with a message; the Coach searches the base papers; the file is left untouched (REQ-1, REQ-17)
- Disconnecting from Strava → the library stays: it is not Strava data (REQ-17)
- After a git pull a base paper has the PMID of an added paper → the base paper wins; the added copy is ignored and listed as "ora tra i paper di base" (REQ-17, REQ-18)
