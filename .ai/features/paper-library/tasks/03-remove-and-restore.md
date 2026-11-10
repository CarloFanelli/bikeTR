# Task 03: remove-and-restore

## Objective

The athlete removes a paper from the **Paper library**, is warned when a workout or a selection rule loses its **Supporting paper**, and restores a removed **Base paper** with one click.

## Context

**Satisfies**: REQ-6, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18

Builds on the saved library of task 02, which gains the removed **Base papers**. REQ-16, REQ-17 and REQ-18 are shared with task 02 on purpose.

## Depends on

- Task 02

## Expected Behavior

- Every listed paper has a remove action.
- Removing an **Added paper** deletes it; removing a **Base paper** hides it and moves it to a separate list of removed papers.
- Before removing a paper that is the **Supporting paper** of a workout or a rule, Libreria names them and asks for confirmation; other papers are removed after a plain confirmation.
- Each removed base paper has a restore action that puts it back in the list.
- The Coach searches the library as it is when a request starts: a removed paper is not searched from the next request, a restored one is.
- Removals are saved on the computer, survive restarts, and never change the committed index file.

## Acceptance Criteria

- [ ] Removing an added paper deletes it from the list and from the saved library. (REQ-14)
- [ ] Removing a base paper moves it to the removed list, which has a restore action. (REQ-6, REQ-14)
- [ ] Removing Whitty 2016 names the cadence workout and asks confirmation first. (REQ-15)
- [ ] After a removal, the next Coach request never finds that paper; after restoring, it can. (REQ-16)
- [ ] Removals survive a restart; papers_index.json is unchanged. (REQ-17, REQ-18)

## Edge Cases

- One paper left in the library → its remove action is refused: the Coach needs at least one paper (REQ-14)
- No removed base papers → the removed list is hidden (REQ-6)
- Restoring while another tab restores the same paper → the second finds it already restored and does nothing (REQ-6)
- PMID of a removed base paper typed in the add field → no preview: Libreria offers to restore it (REQ-7, REQ-6)
- Removing a paper during a running Coach request → that request keeps the library it started with (REQ-14, REQ-16)
- Removing a selection rule's source paper → the rule still prints its source, and grading still counts that PMID as given (REQ-15)
- Removal confirmation cancelled → nothing changes (REQ-15)
- A git pull changes the base papers → Libreria shows the new ones; removals of PMIDs no longer among them are ignored (REQ-18)
