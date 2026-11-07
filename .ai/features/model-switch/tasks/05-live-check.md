# Task 05: live-check

## Objective

One command runs the Coach on 3 made-up situations with the `.env` **Chat model**, without Strava or a browser, and writes a new results file into a git-tracked folder, so a run made on another computer can be evaluated here.

## Context

**Satisfies**: REQ-15, REQ-16, REQ-17, REQ-18, REQ-19

Real model runs happen on the Mac, without Claude Code. The **Live check** turns such a run into a file that travels through git and is read here. Its cloud spending goes into the same total and **Spending cap** as the app's (Task 03).

## Depends on

- Task 01
- Task 02
- Task 03

## Expected Behavior

- One command runs 3 made-up situations (rides, **athlete profile** and duration) through the same steps as a Coach request, with the `.env` **Chat model**, the **Search model** and the paper index.
- It never contacts Strava, opens a browser, or reads or changes the rides the **Coach service** saved.
- Each situation records the provider, model, chosen protocol, use of the backup rule, cut at the token limit, JSON readability, papers found and cited, tokens, cost, seconds and raw answer, or its error.
- Each run writes a new file, named by date, time and model, into a git-tracked project folder; earlier files are never overwritten.
- The command prints one line per situation (protocol, backup rule use, seconds, tokens, cost), then the run's total cost.
- Cloud spending adds to the same total as the app's and stops at the same **Spending cap**.

## Acceptance Criteria

- [ ] One command runs 3 made-up situations with the `.env` model, touching neither Strava nor the saved rides (REQ-15)
- [ ] Each situation's record holds every field the spec lists, and the file never contains the cloud key (REQ-16)
- [ ] Each run creates a new file named by date, time and model in the tracked folder; earlier files stay untouched (REQ-17)
- [ ] A failing situation records its error and the next one runs; if all 3 fail, the command exits with an error code (REQ-18)
- [ ] The command prints one line per situation, then the run's total cost (REQ-19)

## Edge Cases

- Chat model unreachable from the start → every situation records the same error; the file is still written (REQ-15)
- **Live check** while the app is in use → both work; the check never touches saved rides or Strava (REQ-15)
- **Live check** and the app spend at the same moment → both add to the same total; neither amount is lost (REQ-24)
- Empty model answer → raw answer "", not readable as JSON, backup rule used (REQ-16)
- Answer cut at the token limit → recorded as cut, backup rule used (REQ-16)
- Two runs in the same second → the second file gets a distinct name (REQ-17)
- Model name with `:` or `/` → replaced in the file name; the full name stays inside the file (REQ-17)
- Provider drops during a situation → its error is recorded; the next situation starts (REQ-18)
- All 3 situations fail → the file is still written; the command exits with an error code (REQ-18)
- Situation failed → its line shows "errore:" and the message (REQ-19)
- Tokens or cost unknown → printed as "—" (REQ-19)
- **Live check** reaches the cap mid-run → the remaining situations are recorded as refused; the file is still written (REQ-25)
