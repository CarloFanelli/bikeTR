# Task 01: graph-with-returns

## Objective

Every Coach request runs through the **Coach graph**: an unusable **Draft** goes back to the **Chat model** with the reason, up to 3 drafts, each counted in cost, spending cap and **Trace**.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-5, REQ-6, REQ-8, REQ-9, REQ-13, REQ-14, REQ-15

The graph replaces the fixed path shared by the Coach screen, the **Live check** and the **Evaluation set**, with the **Check** limited to unusable answers: the four **Fallback rules** causes of today. Rule and citation checks come in task 02. REQ-9 is shared with task 02 on purpose.

## Depends on

None

## Expected Behavior

- A Coach request goes through rides, metrics, papers, draft, check and deliver; the evaluation set enters at papers with its ready athlete numbers.
- A draft that is cut off, unreadable, without a catalog protocol or too long for the minutes is sent back to the model with its previous answer and the code-written reason, in Italian.
- The first accepted draft is delivered; after 3 rejected drafts the **Fallback rules** choose and the card names the last draft's cause.
- Every draft's tokens and cost add to the request's totals and to the cloud spending total; once the cap is reached no new draft starts.
- The trace shows each node as a step, and each draft and each check as its own step.

## Acceptance Criteria

- [ ] A first draft that is usable gives the same workout as before the graph, with one model call. (REQ-1, REQ-6)
- [ ] An unreadable first draft followed by a usable one delivers the second; the model received the first and the reason. (REQ-2, REQ-5)
- [ ] Three unusable drafts end with the fallback rules and the last draft's cause on the card. (REQ-6, REQ-8, REQ-9)
- [ ] Cost and tokens of a cloud request are the sum of its drafts, and each is added to the spending total. (REQ-13)
- [ ] With the cap reached after the first draft, no second draft starts and the request still delivers a workout. (REQ-14)
- [ ] The trace of a three-draft request shows the nodes plus three draft and three check steps. (REQ-15)

## Edge Cases

- First draft passes → delivered at once, one model call (REQ-6)
- Model stream fails (Ollama down, cloud error) during any draft → the request ends with today's model error, no further drafts (REQ-6)
- Stop pressed during the second draft → request cancelled; drafts already accepted by a cloud provider are charged (REQ-13)
- Spending cap reached after the first draft → no second draft; the first is treated as the last (REQ-14)
- Live check → enters at rides with its made-up rides, so it also runs rides and metrics (REQ-1 · from code)
- Phoenix off → the Coach answers anyway; the trace is lost, as today (REQ-15)
- N/A — concurrent: one request runs one graph; two requests share only the spending total, already locked (REQ-1)
- N/A — permission: the graph adds no new caller or endpoint (REQ-1)

## Notes from implementation

- **Known limitation**: the plan kept `workout.run` and `workout.from_context` as thin calls to the graph. The graph's deliver node uses `workout.decide`, so the graph importing workout and workout importing the graph made a circular import. `run` and `from_context` moved to `app/graph.py` with the same signatures; `main.py`, `live_check.py` and `evaluation.py` now call `graph.run` / `graph.from_context`.
- **Known limitation**: `parse_model_json` moved from `workout.py` to `check.py`; grading reads the last draft with `check.read_draft` instead of its own `model_choice`.
