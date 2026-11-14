# Task 03: searches-on-screen-traces

## Objective

On the Coach screen the athlete sees each Model search as it happens, with the text searched and its number, and each Trace in Phoenix records every Model search.

## Context

**Satisfies**: REQ-14, REQ-15

The new thing to observe is what the model chooses to search. Showing it on the Coach screen and in the Trace lets the user follow it without opening a results file.

## Depends on

- Task 01

## Expected Behavior

- Each Model search shows as a Coach screen step like "Il modello cerca: 'polarized recovery' (ricerca 2 di 3)", then the Draft continues.
- The search text appears as plain text, cut to 300 characters.
- Each Trace has one step per Model search with its Draft number, search text, papers and passages found with scores, and duration.

## Acceptance Criteria

- [ ] Each Model search sends one Coach screen step with the search text and "ricerca N di 3" (REQ-14)
- [ ] A search text containing HTML shows as text on the Coach screen (REQ-14)
- [ ] Each Model search is a Trace step with Draft number, search text, passages with scores and duration (REQ-15)
- [ ] Disconnecting from Strava deletes Coach screen Traces including their Model search steps (REQ-15)

## Edge Cases

- Search text with HTML or very long → shown as plain text, cut to 300 characters (REQ-14)
- Browser closed during a Model search → the request continues; the steps are lost with the page (REQ-14)
- Phoenix down → the Coach answers anyway (REQ-15)
- Disconnecting from Strava → deletes the Coach screen's Traces, Model searches included (REQ-15)
