# Task 06: coach-docs

## Objective

The README explains how to pick the **Chat model** in `.env` (Claude, or another Ollama model), how to run the **Live check**, which athlete data a cloud provider receives, and how the spending total is kept.

## Context

**Satisfies**: REQ-20, REQ-21

Anyone cloning BikeTR must be able to switch model and run the **Live check** from the README alone, and know before choosing a cloud provider which of their data leaves the computer.

## Depends on

- Task 05

## Expected Behavior

- The README gives a `.env` example for Claude (address, placeholder key, model, prices, limit) and one for another Ollama model.
- It gives the **Live check** command and says where the results file is written.
- It lists the athlete data a cloud provider receives, matching the prompt, and says that with Ollama none leaves the computer.
- It says the spending total survives restarts and "Disconnetti da Strava", and only `docker compose down -v` erases it.
- It says to set `OLLAMA_CONTAINERS=0` when the provider is cloud and Ollama isn't needed.
- An automated test proves the prompt holds no activity name.

## Acceptance Criteria

- [ ] The README has `.env` examples for Claude and for another Ollama model, with placeholder keys only (REQ-20)
- [ ] The README gives the **Live check** command and where its results file is written (REQ-20)
- [ ] The README lists the athlete data a cloud provider receives, and says none leaves the computer with Ollama (REQ-21)
- [ ] A test fails if the prompt contains an activity's name (REQ-21)
- [ ] The README says the spending total is erased only by `docker compose down -v` (REQ-24)

## Edge Cases

- README examples → use placeholder keys, never a real one (REQ-20)
- Data listed for cloud providers → matches the prompt; a test checks the prompt holds no activity name (REQ-21)
- Cloud provider chosen, Ollama containers left on → Ollama still starts and downloads the chat model; the README says to set `OLLAMA_CONTAINERS=0` (REQ-14)
- Coach restarted, or "Disconnetti da Strava" → the total stays; the README says only `docker compose down -v` erases it (REQ-24)
