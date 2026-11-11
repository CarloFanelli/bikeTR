# Task 02: add-flow-in-reader

## Objective

An "Aggiungi un paper" button at the top of the list opens the add flow in the reading area; adding by PMID works as today and the added paper opens at once.

## Context

**Satisfies**: REQ-10, REQ-11, REQ-14

Moves today's add-by-PMID flow (preview, then confirmation) from above the list into the reading area, with its own address so the back button works on phones. Task 03 adds words to the same box.

## Depends on

01-split-reader-layout

## Expected Behavior

- "Aggiungi un paper" sits at the top of the list and opens the add flow in the reading area, at /libreria/aggiungi.
- The add box takes a PMID; "Cerca" shows the preview as today, then "Aggiungi alla libreria" or "Annulla".
- A removed base paper's PMID offers "Ripristina", as today.
- Confirming adds the paper as today and opens it in the reading area.

## Acceptance Criteria

- [ ] "Aggiungi un paper" tops the list and opens the add flow in the reading area at /libreria/aggiungi (REQ-10)
- [ ] A PMID shows today's preview, with today's messages for invalid input (REQ-11)
- [ ] Confirming adds the paper, refreshes the list and opens the paper at /libreria/{PMID} (REQ-14)
- [ ] Below 1280 px the add flow opens full width with "Torna all'elenco" (REQ-10)

## Edge Cases

- Library unreadable → the add button is still shown (REQ-10)
- Empty box or spaces only → "Cerca" does nothing; no request (REQ-11)
- Invalid PMID-like input ("0", 12+ digits) → today's PMID message (REQ-11)
- Preview cancelled → back to the add box with the same text (REQ-14)
- Adding fails (PubMed or save) → message as today; nothing added (REQ-14)
- Two tabs open, paper added in one → the other shows it on its next library load (REQ-14)
