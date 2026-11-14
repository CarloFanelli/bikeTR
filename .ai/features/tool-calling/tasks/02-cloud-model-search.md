# Task 02: cloud-model-search

## Objective

Model mode works with the cloud Chat model too: every model turn of a Draft is charged, and the Spending cap stops further turns, leaving the choice to the Fallback rules.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-13

A Model search adds model turns, and with a cloud model each turn is paid. Task 01 built the search loop on Ollama, which is free; this task brings the OpenAI-compatible endpoint into the loop and keeps the spending total and the cap truthful.

## Depends on

- Task 01

## Expected Behavior

- With the cloud Chat model, model mode offers the same paper-search tool and runs the same loop as with Ollama.
- Every model turn accepted by the provider is added to the spending total; a Draft's tokens and cost are the sum of its turns.
- Once the total reaches the Spending cap, no further turn starts: the Draft ends and the Fallback rules decide, saying the cap was reached.
- A cloud endpoint rejecting the tool fields stops the request with the tool-support error plus the provider's message.

## Acceptance Criteria

- [ ] A cloud Draft with two searches and an answer charges three turns to the spending total (REQ-11)
- [ ] A Draft's tokens and cost equal the sum of its turns (REQ-11)
- [ ] With the cap reached after a search, no further turn starts and the Fallback rules decide (REQ-12)
- [ ] A cloud endpoint rejecting tools stops the request with the tool-support message and the provider's text (REQ-13)

## Edge Cases

- Provider gives no token counts for a tool turn → that turn's cost is unknown, and so is the request's total (REQ-11)
- Stop pressed during a tool turn → turns already accepted are charged; no further search runs (REQ-11)
- Cap reached after a search, before the model's answer → no further turn; Fallback rules, saying the cap was reached (REQ-12)
- Cloud endpoint rejects the tool fields → tool-support error with the provider's message (REQ-13)
- Maximum cost printed before a cloud Evaluation run in model mode → counts every turn a model-mode Draft can make, so a run that could exceed the cap does not start (REQ-11 · from code)
