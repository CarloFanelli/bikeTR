# Task 01: coach-service-setup

## Objective

BikeTR starts a **Coach service** alongside the other services; "Ping Ollama" checks Ollama through it, and the Coach settings ask only for the model name.

## Context

**Satisfies**: REQ-14, REQ-15

Every later task runs inside this service. The ping is the smallest real round trip through it (browser, web container, Coach service, Ollama), so the plumbing is proven before any training logic moves. Workout generation still runs in the browser until Task 04.

## Depends on

None

## Expected Behavior

- The one-command start (`docker compose up -d`) also starts the Coach service; it has no port of its own and is reached only through the app's address.
- The Coach settings show the model field, Save and "Ping Ollama"; the Ollama address field is gone.
- "Ping Ollama" reports, through the Coach service, whether Ollama answers and whether the chat model typed in the field and the embedding model are installed.
- A Coach service request coming from another website is refused.
- Generating a workout keeps working exactly as before.

## Acceptance Criteria

- [ ] The one-command start brings up the Coach service, reachable only through the web container on 127.0.0.1 (REQ-15)
- [ ] The Coach settings no longer show an Ollama address; the model name is saved and reused as before (REQ-14)
- [ ] "Ping Ollama" answers from the Coach service and names any missing chat or embedding model (REQ-15)
- [ ] An Ollama address saved by an older version is ignored and removed from browser storage (REQ-14)
- [ ] Generating a workout still works after this task (REQ-14)

## Edge Cases

- Model field empty → uses `qwen2.5:7b`, as today (REQ-14 from the spec edge-case table)
- Model not installed in Ollama → the ping names the model and the command that downloads it (REQ-14)
- An old Ollama address still saved in the browser → ignored and removed (REQ-14)
- Coach service up, Ollama down → "Coach ok, Ollama non raggiungibile" (REQ-15)
- A model missing → names the missing model, as today (REQ-15)
- Coach service not running → "Coach non raggiungibile: avvia BikeTR con docker compose up -d" (REQ-15, wording from REQ-1)
