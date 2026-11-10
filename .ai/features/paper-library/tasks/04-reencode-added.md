# Task 04: reencode-added

## Objective

After a change of **Search model**, the one re-encode command makes both the **Base papers** and the **Added papers** searchable again.

## Context

**Satisfies**: REQ-19

Without it, a search-model change would leave the added papers with vectors of the old model, and the Coach would compare vectors of two models: papers at random. The re-encode command already exists for the committed index.

## Depends on

- Task 02

## Expected Behavior

- The re-encode command re-encodes the passages of the added papers too, with the current **Search model**, contacting neither PubMed nor Europe PMC.
- It prints how many added passages it re-encoded, beside the base ones.
- With no saved library, it re-encodes only the base papers, as today.
- Until the command runs, the Coach refuses a library whose added papers were encoded by another model, with the message naming the command.

## Acceptance Criteria

- [ ] After the command, the added papers carry the current search model's name and vectors; labels and texts are unchanged. (REQ-19)
- [ ] The command contacts neither PubMed nor Europe PMC. (REQ-19)
- [ ] Without a saved library, the command behaves as before. (REQ-19)
- [ ] Added papers encoded by another model make the Coach refuse with the re-encode command's message. (REQ-19)

## Edge Cases

- Added paper encoded by another search model → the Coach refuses with the message naming the re-encode command, as for the base index (REQ-19)
- Saved library unreadable when the command runs → the command stops with the message and changes neither file (REQ-19, REQ-17)
- The Coach service adds a paper while the command re-encodes → one waits for the other; no paper is lost (REQ-19, REQ-17)
