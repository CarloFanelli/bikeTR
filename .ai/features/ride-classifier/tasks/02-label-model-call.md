# Task 02: label-model-call

## Objective

With Ride labels set to model, a Label model named in `.env` with its own provider labels the rides in one call per request, falling back to the Label rule ride by ride when it cannot.

## Context

**Satisfies**: REQ-3, REQ-4, REQ-6, REQ-10, REQ-11, REQ-20

This is the model routing: a small model labels, the Chat model writes the plan, each on the provider `.env` names. Labels are not saved yet (Task 03), so every request with rides makes one call. REQ-4 here covers the Label model settings; REQ-20 adds model, tokens and cost to the labelling step.

## Depends on

- Task 01

## Expected Behavior

- `.env` names the Label model: provider (ollama or cloud), model, and for cloud its address, key and prices; the Spending cap is the one already set.
- Ride labels = model with a missing or incomplete Label model setting fails every Coach request naming the missing setting.
- A request with recent rides makes exactly one Label model call for all of them, before the Draft.
- Each ride the Label model answers with one of the four labels takes that label, source model; every other ride takes the Label rule's label, source rule.
- A Label model that is unreachable, missing, cut off or answers something unreadable never stops the request.
- With a cloud Label model, the call is charged to the spending total; no call starts once the total reaches the Spending cap.
- The labelling step in the Trace has the Label model's provider, name, messages, tokens and cost.

## Acceptance Criteria

- [ ] Label model on Ollama and Chat model on cloud, and the reverse, both label and answer (REQ-3)
- [ ] Ride labels = model without a Label model, or cloud without key, fails naming the missing setting (REQ-4)
- [ ] One Label model call per request with rides; none without rides (REQ-6)
- [ ] Rides missing from the answer, with unknown labels, or after an unreadable answer get the Label rule's label (REQ-10)
- [ ] A cloud Label model call is added to the spending total; at the cap no call starts and the rule labels (REQ-11)
- [ ] The labelling step records provider, model, tokens, cost and each ride's label and source (REQ-20)

## Edge Cases

- Label model on Ollama, Chat model on cloud, Ollama off → Label rule labels, request continues, Trace says rule (REQ-3, REQ-10)
- Label model cloud key missing with cloud provider → request fails naming the missing Label model setting (REQ-4)
- Ride labels = model but no Label model named → request fails naming the Label model setting (REQ-4)
- Label model answers for only some rides → missing ones get the Label rule's label (REQ-6, REQ-10)
- Label model answers an id that is not one of the rides → ignored (REQ-10)
- Label model answer cut off or not JSON → all rides of that call get the Label rule's label (REQ-10)
- Stop during the labelling call → accepted cloud call charged; request ends stopped (REQ-11)
- Label model on Ollama not yet downloaded → downloaded at start like the Chat model; until then the Label rule labels (REQ-3 · from code)
- Evaluation set run with a cloud Label model → the worst-case cost counts one Label model call per answer at its prices (REQ-11 · from code)
- Spending cap reached before labelling → no Label model call; Label rule labels; then the Chat model's cap behavior as today (REQ-11)
