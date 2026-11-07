# Task 04: evaluation-run

## Objective

One command runs every situation of the evaluation set with the chat model `.env` names, as many times as asked, and writes a new results file into a folder tracked in git, refusing a cloud run that cannot finish under the spending cap.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16

This is what the user runs on the Mac. Each situation goes through the same paper search, chat model and decision as a Coach request, starting from its athlete numbers instead of Strava. Scores arrive in Task 05; this task prints one line per answer and the total charged.

## Depends on

- Task 03

## Expected Behavior

- The command runs each situation (times the repeat count, default 1) through paper search, chat model and protocol decision, without Strava or the browser.
- It prints one line per answer as it finishes, then the run's total charged dollars and the file name.
- The results file holds the chat model, search model, prompt version, start time, whether the run is complete, and per answer: situation, repeat number, whole answer, papers given, protocol, fallback used, seconds, tokens, cost and charged dollars.
- With a cloud model, before any call, it prints the worst-case cost and refuses to start when that exceeds what is left under the spending cap.
- A failing answer records its error, and the run continues.

## Acceptance Criteria

- [ ] Every situation runs through search, chat model and decision exactly as a Coach request does, without Strava (REQ-11)
- [ ] Each run writes a new file in the tracked results folder; same-second runs never overwrite (REQ-12)
- [ ] The file keeps each whole answer, papers given, seconds, tokens, cost, charged, model and prompt version, never the key (REQ-13)
- [ ] A repeat count of 3 answers every situation three times; 0, negative or non-whole is refused before any call (REQ-14)
- [ ] A cloud run whose worst case exceeds what is left under the cap does not start (REQ-15)
- [ ] One line prints per answer as it finishes, then the total charged dollars (REQ-16)

## Edge Cases

- Chat model unreachable, or refuses mid-run → that answer records its error, and the run continues with the next (REQ-11)
- The app is used during a run on the same computer → both add to the same spending total under its lock; the rides the Coach service saved stay untouched (REQ-11)
- Two runs start in the same second → the second file gets `-2`; neither is overwritten (REQ-12)
- Results folder does not exist → created, owned by the project folder's owner, as for the live check (REQ-12)
- Provider gives no token counts → tokens and cost are null; charged holds the high estimate (REQ-13)
- An error message contains the cloud key → the key is written as `***` (REQ-13)
- Two prompt texts → never share a prompt version; the same text always gives the same version (REQ-13)
- Repeat count 0, negative or not whole → refused before any call, with no file (REQ-14)
- Repeat count 3 → each situation answered 3 times; every answer graded on its own (REQ-14)
- Worst-case cost exactly equal to what is left → the run starts (REQ-15)
- Ollama (no prices) → no cost line and no guard (REQ-15)
- Spending file unreadable → refuses to start with the existing message (REQ-15)
- The app spends during the run and the cap is reached → later answers record the cap error; the file is written and marked incomplete (REQ-15)
- Every answer fails → the file is still written; the command ends with code 1 (REQ-16)
- A wrong `.env` → refused in Italian before any call, with no file (Validation)
- The run stops halfway (Ctrl+C, the Mac sleeps, Ollama stops) → the file already holds every finished answer and is marked incomplete (REQ-12 · from code)
- One answer fails while the others arrive → the run is marked incomplete and is not used for a table row (REQ-12 · from code)
