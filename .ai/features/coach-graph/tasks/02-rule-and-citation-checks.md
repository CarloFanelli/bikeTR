# Task 02: rule-and-citation-checks

## Objective

The **Check** also sends back a **Draft** whose protocol today's **Selection rules** rule does not allow, or that cites a passage or PMID it was not given; when the drafts run out, a citation-only problem keeps the model's protocol.

## Context

**Satisfies**: REQ-3, REQ-4, REQ-7, REQ-9

Adds the two checks the evaluation set already measures ("Rules followed", "Invented citations") to the graph of task 01, and the fifth **Fallback rules** cause, "not allowed today". REQ-9 is shared with task 01 on purpose.

## Depends on

- Task 01

## Expected Behavior

- A draft choosing a catalog protocol that today's rule does not allow for the minutes is sent back with the allowed protocols named.
- A draft citing a passage label or a PMID outside the passages given is sent back with the invented citations named; the source PMID of the rule shown in the prompt counts as given.
- A draft with several problems receives all the reasons at once.
- If the third draft fails only on citations, the card keeps its protocol and rationale, drops those citations and says so.
- If the third draft breaks the rule, alone or with invented citations, the fallback rules choose and the card says "not allowed today".

## Acceptance Criteria

- [ ] TSB −12 and a draft choosing 4×8 Seiler → sent back; a Z2 second draft is delivered. (REQ-3)
- [ ] A draft citing a label not given → sent back with that label named. (REQ-4)
- [ ] Third draft fails only on citations → model's protocol kept, citations dropped, card says so. (REQ-7)
- [ ] Third draft not allowed today → fallback rules choose, card names "not allowed today". (REQ-8, REQ-9)
- [ ] A protocol that fits the minutes but breaks the rule no longer reaches the card as the model's choice. (REQ-3)

## Edge Cases

- Draft fails on the rule and on citations at once → both reasons go back; on the third draft the rule failure wins: fallback rules (REQ-5, REQ-7)
- Model chooses a catalog protocol not shown in the narrowed prompt → rejected as not allowed today (REQ-3)
- Draft has an empty citation list → passes the citation check (REQ-4)
- Citation of the shown rule's source PMID that was not retrieved → counts as given (REQ-4)
