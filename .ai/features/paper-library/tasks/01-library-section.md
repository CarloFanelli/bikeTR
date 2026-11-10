# Task 01: library-section

## Objective

The athlete opens Libreria from the sidebar and sees every paper the Coach searches, what each one is, what depends on it, and the passages the Coach can read and cite.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5

First because every later task changes what this list shows. At this point the **Paper library** holds only the **Base papers**, so the list shows the 17 with the base label; adding and removing come next.

## Depends on

None

## Expected Behavior

- The sidebar has a Libreria section, between Coach AI and Impostazioni at the bottom.
- Libreria lists every paper of the **Paper library**: title, authors, year, journal.
- Each paper shows whether it is a **Base paper** or an **Added paper**, its passage count, and "testo completo" with its license or "abstract".
- Each paper names the workouts and selection rules whose **Supporting paper** it is, by their Italian names.
- Opening a paper shows its **Passages** in reading order, each with its label "PMID:n §k".
- Each paper links to its PubMed page and, when it uses its full text, to its Europe PMC page.
- When the Coach service is down, Libreria shows the same "Coach non raggiungibile" message as the other Coach screens.

## Acceptance Criteria

- [ ] Libreria lists the 17 base papers with title, authors, year and journal. (REQ-1)
- [ ] Each paper shows base or added, its passage count, and full text with license or abstract. (REQ-2)
- [ ] Whitty 2016 names the cadence workout; Seiler 2010 names its selection rule. (REQ-3)
- [ ] Opening a paper lists all its passages in order with labels "PMID:n §k". (REQ-4)
- [ ] Each paper links to PubMed; a full-text paper also links to Europe PMC. (REQ-5)
- [ ] Titles, authors and passages are shown as text, never as HTML. (REQ-1)

## Edge Cases

- A paper is the source of a workout and a rule → both are named (REQ-3)
- A paper no workout or rule names → no dependency line (REQ-3)
- A paper with 1 passage → opens with that one passage (REQ-4)
- Concurrent and permission axes for these views → not applicable: one local user, nothing changes on view (REQ-1–REQ-5)
