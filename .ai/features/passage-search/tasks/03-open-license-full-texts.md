# Task 03: open-license-full-texts

## Objective

Papers that Europe PMC holds under a license allowing copying are searched by their full text; every paper records which text it uses and, for a full text, its license.

## Context

**Satisfies**: REQ-3, REQ-4, REQ-5

The repository is public, so the index may hold a full text only under a license that allows copying it. Today 2 of the 17 papers qualify (polarized training 2014, heavy strength 2017, both CC BY). The license is checked paper by paper, so papers added later follow the same rule.

## Depends on

- Task 02

## Expected Behavior

- The build command asks Europe PMC for each paper's license; with CC BY, CC BY-SA or CC0 and the full text available there, the paper's passages come from its abstract and its body sections.
- References, tables, figures, acknowledgments, funding, conflicts, author contributions and untitled body sections are left out.
- Each paper records "abstract" or "full text"; a full text also records its license and the license's link.
- The committed index is rebuilt: today 2 papers with their full text and 15 with their abstract.
- The README's paper index paragraphs say which text a paper uses and why.

## Acceptance Criteria

- [ ] A paper uses its full text only when Europe PMC holds it under CC BY, CC BY-SA or CC0; otherwise its abstract (REQ-3)
- [ ] A full text's passages come from its abstract and body sections, leaving out the excluded sections (REQ-4)
- [ ] Each paper records which text it uses; a full text also records its license and the license's link (REQ-5)
- [ ] When Europe PMC does not answer, the build stops naming it and the previous index is unchanged (REQ-3)
- [ ] The committed index holds the full texts of the 2 papers licensed CC BY today and the abstracts of the other 15 (REQ-3)

## Edge Cases

- Europe PMC does not answer or answers with an error → the build stops with a message naming Europe PMC; the previous index is unchanged (REQ-3)
- License allows copying but Europe PMC has no full text → the paper uses its abstract (REQ-3)
- License CC BY-NC, CC BY-ND, any other, or none (a free-to-read copy included) → the paper uses its abstract (REQ-3)
- License written another way ("cc by", "CC BY 4.0", "cc-by-sa") → recognized as the same license (REQ-3)
- N/A — concurrent: the build command is run by hand, one at a time (REQ-3)
- A full text with no body sections → the paper uses its abstract, and the command's output says so for that paper (REQ-4)
- Subsections inside a kept section → kept, in reading order (REQ-4)
- Left-out section titles in another form ("Acknowledgements", "Conflict of Interests") → recognized regardless of case, spelling variant and plural (REQ-4)
- A body section without a title → left out: in today's full texts these hold the citation and funding notes (REQ-4)
- An abstract paper → records "abstract" and no license (REQ-5)
- Europe PMC lists an open license but the full text carries no Creative Commons link → the paper uses its abstract, so the card can always credit a full text (REQ-5 · from code)
