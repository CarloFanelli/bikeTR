# Task 01: supporting-papers

## Objective

Every protocol in the Coach's catalog either names a supporting paper that really describes it, found through PubMed, or is labeled practice; every supporting paper is in the paper index the Coach searches.

## Context

**Satisfies**: REQ-1, REQ-2

The papers are the main rules, but 6 of the catalog's 8 cited papers are missing from the index and some describe other training (Z2 with cadence drills cites a heavy strength study). The selection rules (Task 02) and the support score (Task 05) both need a trustworthy supporting paper per protocol, so this comes first.

## Depends on

None

## Expected Behavior

- Each catalog protocol has either one supporting paper (its PMID) or none, meaning practice.
- A supporting paper's PubMed title or abstract describes the protocol it supports; a citation that describes something else is replaced by a better paper found by search, or the protocol becomes practice.
- Rebuilding the paper index fetches every supporting paper through a PubMed search and stops, leaving the old index, when a search returns a different paper first.
- The rebuilt index is committed and the Coach searches it as before; when a protocol's supporting paper is among the papers found, the Coach still adds it to the cited papers.

## Acceptance Criteria

- [ ] Every catalog protocol names one supporting paper or is labeled practice (REQ-1)
- [ ] For each supporting paper, its PubMed title or abstract describes the protocol it supports, recorded per protocol (REQ-1)
- [ ] The paper index holds every supporting paper, each fetched by a PubMed search (REQ-2)
- [ ] The index rebuild stops with a message, index unchanged, when a search's first result is not the expected paper (REQ-2)
- [ ] An automated test fails when a supporting paper has no PubMed search that fetches it (REQ-2)

## Edge Cases

- A protocol cites a paper about something else (Z2 with cadence drills cites a heavy strength study) → replaced by a paper found by search that describes it; if none, labeled practice (REQ-1)
- A protocol with no study behind it (sweet spot, threshold, over-under, tempo, rest) → labeled practice; its answers are left out of the support score (REQ-1)
- PubMed unreachable while rebuilding the index → the index file stays as before; the command says why (REQ-2)
- A PubMed search returns another paper first → the search text is refined until its first result is the intended paper; never a typed PMID (REQ-2)
- Two protocols share one supporting paper → the paper is in the index once (REQ-2)
