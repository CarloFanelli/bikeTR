---
feature: tracing
spec-version: 1.0
status: approved
---

# Architecture Plan: Tracing

## Technical Approach

### Overview

The Coach service and the `coach-tools` commands record each Coach request with the OpenTelemetry SDK. A batch processor sends the traces from a background thread to a new `phoenix` container, so a request never waits for Phoenix. One new module, `docker/coach/app/tracing.py`, owns everything about traces: the sender, the request and step helpers, the single log line and the filter for Disconnect. Workout code only opens steps and sets values on them. Each process writes to its own Phoenix project: `coach-screen` for the service, `live-check` and `evaluation` for the commands. Disconnect can then delete one project's traces through Phoenix's `DELETE /v1/projects/{name}/traces` (phoenix 20.24.0 `server/api/routers/v1/traces.py:384-428`). Step values use the OpenInference names Phoenix draws: LLM, RETRIEVER and CHAIN steps, `llm.input_messages`, `llm.token_count.*`, `llm.cost.total`, `retrieval.documents.*`. Three new pinned packages, all released at least two weeks ago: `opentelemetry-sdk==1.45.1`, `opentelemetry-exporter-otlp-proto-http==1.45.1` (Phoenix accepts only protobuf, `traces.py:463`) and `openinference-semantic-conventions==0.1.41`.

### Shared Concerns

#### Trace helpers

- **Appears in**: Task 01, Task 02, Task 03, Task 04
- **Reference example**: `docker/coach/app/spending.py` (one small module with a narrow API that the service and the commands share)
- **Rule**: workout code uses only the helpers in `app/tracing.py`: one request helper per caller (the root of the trace) and one step helper per step. Nothing else imports `opentelemetry`.
- **Watch out for**: the global provider can be set only once (`opentelemetry/trace/__init__.py:558`). `tracing.py` keeps its own provider so the tests can swap it.

#### Fake trace receiver in tests

- **Appears in**: Task 01, Task 02, Task 03, Task 04
- **Reference example**: `docker/coach/tests/conftest.py:18-22` (an autouse fixture that keeps tests away from real state)
- **Rule**: an autouse fixture gives every test a provider that keeps finished steps in memory (the SDK's `InMemorySpanExporter`) and sends nothing to the network. Tests read the steps from it.

## Per-Task Technical Guidance

### Task 01: coach-screen-traces

**Files to modify:**
- `compose.yaml`:
  - add a `phoenix` service on `arizephoenix/phoenix:version-20.24.0`, port `127.0.0.1:${PHOENIX_PORT:-6006}:6006`, with a `phoenix-data` volume;
  - set `PHOENIX_TELEMETRY_ENABLED=false` and `PHOENIX_ALLOW_EXTERNAL_RESOURCES=false`;
  - add `PHOENIX_URL: http://phoenix:6006` to `x-coach-env`;
  - add no `depends_on`: the Coach must work without Phoenix.
- `.env.example`: a `PHOENIX_PORT` block, written like `WEB_PORT`.
- `docker/coach/requirements.txt`: the three pinned packages.
- `docker/coach/app/workout.py`:
  - `run`: a rides step around `rides.refresh` and `coach_context`, recording `from_saved`;
  - `from_context`: paper search, Chat model call and decision steps;
  - `decide`: puts the parsed choice, the given protocol and the warning on the current step.
- `docker/coach/app/main.py`: `produce` opens the request (source, minutes, prompt version) around `workout.run`; the provider is set up at import as `coach-screen`.

**Files to create:**
- `docker/coach/app/tracing.py`: provider, batch sender to `{PHOENIX_URL}/v1/traces`, request and step helpers.
- `docker/coach/tests/test_tracing.py`: built like `docker/coach/tests/test_workout.py`, with `FakeRides`, `FakeOllama` and `FakeCloud` from `fakes.py`.

**Key decisions:**
- The search step records PMID, title and score only, never the `embedding` and `abstract` that `papers.top_papers` carries (`papers.py:71`).
- `from_context`'s result is unchanged, so results files and the browser are untouched.

**Watch out for:**
- The Phoenix image runs as a non-root user (its Dockerfile, line 22: distroless `nonroot`). A volume mounted where the image has no folder belongs to root. Mount it on `/home/nonroot` (Phoenix's default `~/.phoenix`, `config.py:1169-1174`). Test: `down`/`up` keeps a trace.
- Phoenix turns telemetry pixels on by default (`config.py:3720`) and the screen loads web fonts. Without the two `false` settings, opening a trace calls the internet. Test: `docker compose config` shows both settings.
- `docker compose up -d` here also starts Ollama, which is not allowed on this computer. Start only Phoenix with `docker compose up -d --no-deps phoenix`, and run the tests with `--no-deps`.
- `requirements.txt` changes need `docker compose build coach` (`Dockerfile:3-4`). Until the image is rebuilt, `import opentelemetry` fails in the tests.

---

### Task 02: failed-and-stopped

**Files to modify:**
- `docker/coach/app/tracing.py`:
  - the step and request helpers mark a step failed with the error message, or stopped on cancellation, then re-raise;
  - the sender is wrapped so it prints one `[coach]` line when traces start being lost, and nothing more until a send succeeds;
  - the sender's timeout is 1 s, and the exporter's own loggers are silenced.
- `docker/coach/app/workout.py`: the Chat model step records the partial answer and the dollars charged in the existing `finally` (`workout.py:209-213`).

**Files to create:**
- none. Tests extend `docker/coach/tests/test_tracing.py`:
  - the Stop and silence cases mirror `docker/coach/tests/test_cancel.py:56-170`;
  - the never-answering receiver is a socket that accepts a connection and never replies, like `FakeModelServer`.

**Patterns to reuse:**
- The log line format of `strava.log` (`strava.py:31-32`).

**Key decisions:**
- A failed step records the `CoachError` message (code-written Italian). Any other exception records its type name only. No exception text and no stack trace go into a trace, so a key, a token or a header cannot slip in.

**Watch out for:**
- Stop raises `CancelledError`, which `start_as_current_span` does not record (`opentelemetry/trace/__init__.py:606-609`). The helpers must catch it, mark the step stopped and re-raise. Test: Stop leaves a stopped trace with the charge.
- The OTLP client retries with backoff until its timeout, 10 s by default (`opentelemetry/exporter/otlp/common/http.py:31,185-221`). It logs every attempt (`:213,222,228`). Set the timeout to 1 s and silence those loggers. Test: never-answering receiver.

---

### Task 03: test-run-traces

**Files to modify:**
- `docker/coach/app/live_check.py`:
  - `coach_answer` (shared by both commands) opens the request with the situation, the repeat when present, the minutes and the prompt version;
  - `main` sets up the provider as `live-check`.
- `docker/coach/app/evaluation.py`: `main` sets up the provider as `evaluation`.
- `docker/coach/tests/test_live_check.py` and `docker/coach/tests/test_evaluation.py`: one trace per situation or answer, with its names. The existing `FIELDS` checks (`test_live_check.py:24,59`, `test_evaluation.py:25,78`) prove the results files are unchanged.

**Patterns to reuse:**
- Trace helpers (see Shared Concerns).
- `base` already carries situation, repeat and minutes (`evaluation.py:60`, `live_check.py:138`).

**Key decisions:**
- The source comes from the process's project name, set once in `main`. `coach_answer` does not need a new parameter.
- The Evaluation set runs `from_context` without rides, so its traces have no rides step (`evaluation.py:57`).
- The Live check's rides step says made-up rides: `MadeUpRides` (`live_check.py:46-56`) goes through `workout.run` like Strava's rides.

**Watch out for:**
- The command exits right after its last answer. The exit hook (`opentelemetry/sdk/trace/__init__.py:1283-1284`) sends what is queued, and a stopped Phoenix delays the exit by about 1 s. Test: the last answer's trace reaches the fake receiver.

---

### Task 04: disconnect-deletes-traces

**Files to modify:**
- `docker/coach/app/main.py`:
  - `forget` hands the disconnect time to the tracing filter and to the trace deletion, then answers 204 without waiting;
  - a FastAPI `lifespan` resumes a deletion still pending in `/data`.
- `docker/coach/app/tracing.py`: the sender drops Coach screen steps of traces started before the latest disconnect, including requests still running at that moment.
- `docker/coach/tests/conftest.py`: an autouse fixture puts the pending-deletion file in `tmp_path`, as `cloud_spending` does.
- `README.md` (REQ-14):
  - §4: Phoenix's address, and that `down -v` deletes traces;
  - §5: what a trace holds and which rider data it stores;
  - §9: the `phoenix` service;
  - "First start": Phoenix's image, about 330 MB.

**Files to create:**
- `docker/coach/app/trace_deletion.py`:
  - keeps the pending time in `/data/trace-deletion.json`, written to a temporary file and renamed, like `store.py:41-45`;
  - one background task sends `DELETE {PHOENIX_URL}/v1/projects/coach-screen/traces` with `end_time` set to the disconnect time;
  - 204 or 404 clears the file; any other answer is retried every 10 s.
- `docker/coach/tests/test_trace_deletion.py`: a fake Phoenix on `httpx.MockTransport` (`fakes.py`).

**Key decisions:**
- The deletion runs about 5 s after the disconnect, so steps that are still being sent arrive and are deleted too.
- A second disconnect keeps the later time.

**Watch out for:**
- Phoenix stores incoming steps a moment after answering (`db/bulk_inserter.py:123`). A DELETE sent at once can miss a trace already on its way. Wait about 5 s and filter the sender. Test: a request running at Disconnect leaves no trace.
- `asyncio.create_task` keeps only a weak reference, so the deletion task can disappear mid-wait. Keep it in a module-level variable. Test: the pending deletion runs after the fake Phoenix comes back.
- `test_rides.py:139-145` calls `/coach/forget`. Without the conftest fixture it would write to `/data` and call the real Phoenix.
