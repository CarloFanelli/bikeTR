---
feature: model-switch
spec-version: 1.0
status: approved
---

# Architecture Plan: Model Switch

## Technical Approach

### Overview

The **Coach service** stops talking to one model server and gets two injected dependencies: an `embed` callable (the **Search model**, in-process with fastembed) and a `chat` callable (Ollama or an OpenAI-compatible endpoint, picked from `.env`). `workout.run` keeps its steps, prompt, backup rule and citations; only where the vectors and the text come from changes, so runs compare across models. The cloud client mirrors `app/ollama.py` with raw httpx, not an SDK: one streaming POST and one model lookup do not justify a package, and the 180-second silence limit and the cancel-closes-connection behavior stay identical. The only new package is fastembed (ONNX on CPU). A profiled compose service `coach-tools` runs the commands that write into the project: the index rebuild and the **Live check**.

### Shared Concerns

#### `.env` settings reach the Coach through compose

- **Appears in**: Task 01, Task 02, Task 03, Task 05
- **Reference example**: `compose.yaml:60-61` (coach `environment`), `.env.example:17-28`
- **Rule**: every new setting is passed to both `coach` and `coach-tools` through one YAML anchor (`x-coach-env`), defaults to empty with `${VAR:-}`, and gets a commented line in `.env.example`; the key never gets a default.

#### One settings reader, validated per request

- **Appears in**: Task 02, Task 03, Task 04, Task 05
- **Reference example**: `docker/coach/app/ollama.py:35-42` (`chat_model` raising `CoachError` with an Italian message)
- **Rule**: `app/provider.py` reads and validates all chat-model, price and limit settings into one frozen object; requests, the connection check, the status line and the **Live check** all call it, so a wrong `.env` gives the same Italian refusal everywhere, before any call.

#### Provider-neutral answer pieces

- **Appears in**: Task 02, Task 03, Task 05
- **Reference example**: `docker/coach/app/workout.py:184-195` (the chat loop)
- **Rule**: both streams yield the same pieces (text, then one end piece with input tokens, output tokens, cut-at-limit flag, all possibly unknown); `workout.run` never looks at Ollama or OpenAI field names.

## Per-Task Technical Guidance

### Task 01: search-model-in-coach

**Files to modify:**
- `docker/coach/requirements.txt` — add `fastembed` (pinned, 0.9.1 or the latest at build time).
- `docker/coach/Dockerfile` — set `SEARCH_MODEL=BAAI/bge-small-en-v1.5` (384 dimensions) and a cache folder outside `/app`; download the model in a `RUN`, then set `HF_HUB_OFFLINE=1`.
- `docker/coach/app/workout.py` — `run` takes an `embed` callable instead of `ollama.embed` (line 176).
- `docker/coach/app/papers.py` — the index must be non-empty and its `model` must equal `SEARCH_MODEL`, else a message with the rebuild command; split validation from fetching so Task 05 can load the file directly.
- `docker/coach/app/main.py` — pass the **Search model**'s encoder to `run`.
- `docker/coach/app/ollama.py` — drop `embed` and `EMBED_MODEL`.
- `compose.yaml` — `ollama-pull` loops over the chat model only; add the `coach-tools` service (profile `tools`, project mounted read-write at `/project`).
- `papers_index.json` — re-encoded by the new command.
- Tests: `test_workout.py:30-60,95,233-236`, `test_cancel.py:52`, fixture index `model` (and `tests/reference/make_reference.mjs:224`).

**Files to create:**
- `docker/coach/app/search.py` — the **Search model**: loaded once, encodes off the event loop.
- `docker/coach/app/build_index.py` — port of `tools/build_papers_index.mjs` (then deleted) with a re-encode-only mode; writes with `store.py:41-45`'s temporary file plus rename.

**Watch out for:**
- Encoding is CPU-bound and synchronous: called directly it freezes every other request, Stop included — `workout.py:176` → run it with `asyncio.to_thread`; test: a second request's events flow while one encodes.
- Two first requests at once load the model twice — `search.py` (new) → load under a `threading.Lock`; test: two concurrent searches call the loader once.
- `/app` is a read-only mount over the image (`compose.yaml:56`): a model cached under `/app` at build disappears at run → cache in `/models`; test: the image loads it with `HF_HUB_OFFLINE=1` and no network.
- fastembed falls back to downloading when its cache lookup fails; without `HF_HUB_OFFLINE=1` a broken cache silently needs internet — `Dockerfile:11-12` → set it after the download step; test: same as above.
- Today's builder skips failed papers and writes in place (`tools/build_papers_index.mjs:135-138,148`), so a PubMed outage shrinks the index → stop at the first failure, replace the file only when complete; test: a failing fetch leaves the file unchanged.
- An empty paper list passes today's check (`papers.py:34`'s `all()` on `[]` is true) → refuse zero papers explicitly; test: `{"model": …, "papers": []}` gets the restore message.
- The fixture index says `nomic-embed-text`: the new model check refuses every test search → update the fixture's `model` and `make_reference.mjs:224` together.

---

### Task 02: chat-model-from-env

**Files to modify:**
- `docker/coach/app/ollama.py` — `chat_stream` yields the shared pieces (input tokens = `prompt_eval_count`); `chat_model` becomes the `.env` default logic.
- `docker/coach/app/workout.py` — `parse_request` stops reading `model` (line 88); `run` takes a `chat` callable; the result carries `provider`, `model`, `seconds`, `inputTokens`, `outputTokens` (replacing `evalCount`) and `truncated`.
- `docker/coach/app/main.py` — settings validated before the stream starts (JSON refusal, like `no_ftp`); the producer (lines 75-87) opens the chosen client.
- `web/src/core/coach-types.ts`, `web/src/data/coach.ts`, `web/src/screens/CoachScreen.vue:20,29` — no model in the request; drop the stored-model line (lines 58-60).
- `web/src/core/coach-view.ts:37` — result line: local or cloud, model, seconds, tokens or "—".
- Tests: `test_workout.py`, `test_cancel.py`, `web/tests/coach/coach-run.test.ts:17`, `web/tests/core/coach-view.test.ts:29-31`.

**Files to create:**
- `docker/coach/app/provider.py` — settings reader (Shared Concerns) and the `chat` dispatcher.
- `docker/coach/app/cloud.py` — OpenAI-compatible stream, following `ollama.py:28-32,97-129`: `POST {url}/chat/completions` with `stream`, `stream_options.include_usage`, `max_tokens: 4000`, no temperature.

**Watch out for:**
- httpx waits 5 seconds by default; a cloud client built without `ollama.py:32`'s timeout cuts Claude's silent reasoning → share one `Timeout(10, read=180)`; test: `test_cancel.py`'s "late" plan against a fake SSE server.
- Stop closes the provider only because the cancelled producer exits `async with client.stream` (`main.py:75-95`) → keep the cloud stream inside that `async with`; test: a fake SSE server records the closed connection, as `test_cancel.py:33` does.
- The usage chunk arrives with an empty `choices` list, after `finish_reason` → never index `choices[0]` blindly, stop at `data: [DONE]`, skip comment and `event:` lines; test: a stream ending usage-only.
- Error messages echo the provider's body (`ollama.py:113` pattern); the key must never appear in them or in logs → never format the request or its headers; test: a 401 message doesn't contain the key.
- A lone surrogate breaks httpx `json=` (memory gotcha) → send `content=json.dumps(body)` like `ollama.py:105`; test: `test_workout.py:144-150` for cloud.
- A 401/403 means "key rejected", 429 "rate limit": map them before the generic "provider said …"; no fallback to Ollama; test: one case per status.

---

### Task 03: cost-and-spending-cap

**Files to modify:**
- `docker/coach/app/provider.py` — prices and limit required for cloud: finite numbers ≥ 0, else refusal naming the value.
- `docker/coach/app/main.py` — cap check before the stream starts (JSON refusal naming total and limit; no ride download, no provider call).
- `docker/coach/app/workout.py` — the chat loop (lines 184-195) records the answer's cost in a `finally`; the result carries `cost` (null for Ollama or unknown tokens).
- `web/src/core/coach-types.ts`, `web/src/core/coach-view.ts:37` — cost with 4 decimals, "—" when unknown, nothing for Ollama.
- `compose.yaml` — `coach-tools` mounts `coach-data:/data`, so the **Live check** shares the total.

**Files to create:**
- `docker/coach/app/spending.py` — total in `/data/spending.json`: read (missing file means 0, unreadable means refusal), add, ceiling cost (8,000 input, 4,000 output tokens).

**Patterns to reuse:**
- Temporary file plus `os.replace` from `docker/coach/app/store.py:41-45`.

**Watch out for:**
- The **Live check** container and the **Coach service** write the same file; `store.py:25`'s `asyncio.Lock` only serializes one process → `fcntl.flock` on a lock file around read-add-write; test: two processes adding at once keep both amounts.
- Stop cancels the producer (`main.py:95`); an `await` in the recording path can be cancelled before writing → record synchronously in the `finally` (tiny file, short lock); test: a cancelled cloud stream adds the ceiling cost.
- Adding the ceiling after a refused request bills what the provider never charged → ceiling only when the provider answered 200 and usage never came; test: a 401 adds nothing.
- `RideStore.load` turns a corrupt file into "nothing saved" (`store.py:29-39`); copying that resets the total → unreadable means refuse, file untouched; test: garbage file refuses and stays byte-identical.
- Python's `float()` accepts "nan", "inf" and "1e999" from `.env` → reject non-finite values like `workout.py:39-45`; test: `CLOUD_SPENDING_LIMIT=nan` refuses.

---

### Task 04: impostazioni-model-check

**Files to modify:**
- `docker/coach/app/main.py` — new `GET /coach/status` (provider, model, and for cloud total and limit; local only, no network); `GET /coach/ping` (lines 52-63) becomes the connection check without a `model` parameter: Ollama lists the chat model only; cloud calls `GET {url}/models/{model}` with the key.
- `web/src/data/coach.ts:14-30` — `coachStatus` and the check replace `pingOllama`.
- `web/src/components/CoachSettingsCard.vue` — no `defineModel`, no text field; provider and model line, total and limit for cloud, "Verifica connessione"; help panel without `nomic-embed-text`.
- `web/src/screens/SettingsScreen.vue:14,29,34,44` — drop the model from the form and from the unsaved-changes comparison.
- `web/src/data/storage.ts:101-115` — drop `model` from saved Coach settings, like `endpoint`.
- `web/src/screens/CoachScreen.vue` — model line from `coachStatus`; "no data leaves the computer" only with Ollama (gap resolution).
- Tests: `test_workout.py:266-287`, `web/tests/data/coach.test.ts:23-38`.

**Patterns to reuse:**
- The `endpoint` clean-up in `web/src/data/storage.ts:106-115`.

**Watch out for:**
- Not verifiable from here: Anthropic's compatibility page lists no models endpoint; its native lookup may want an `anthropic-version` header → report any unexpected status with the provider's message; the user's first check on the Mac (free) settles it.
- Model ids with `/` (other OpenAI-compatible providers) break the lookup path → percent-encode the id; test: `org/model` requests `/models/org%2Fmodel`.
- Impostazioni opens often: a status that calls the provider costs time and quota → status reads settings and the spending file only; test: status with the provider down still answers.

---

### Task 05: live-check

**Files to modify:**
- `compose.yaml` — `coach-tools` gets the shared `.env` settings (anchor).
- `.gitignore` — confirm `live-checks/` stays tracked.

**Files to create:**
- `docker/coach/app/live_check.py` — run with `docker compose run --rm coach-tools python -m app.live_check`; 3 situations from `tests/fixtures/rides.json` (scenarios `base`, `ftp280`, `noLthr`, different durations), each through `workout.run` with fixed rides, the Task 01 encoder, the Task 02 `chat`, and the index read from `/project/papers_index.json`; cap check before each situation.
- `live-checks/` — results folder; one JSON file per run.
- `docker/coach/tests/test_live_check.py` — fake chat and embed, temporary results folder.

**Patterns to reuse:**
- `FakeRides` in `docker/coach/tests/fakes.py:9-24` for fixed rides; `workout.parse_model_json` for JSON readability.

**Watch out for:**
- `papers.load_index` reads through nginx (`papers.py:13`), which `run --no-deps` doesn't start → read the mounted file with Task 01's shared validation; test: the check runs with no `web` service.
- `main.py:29-31` builds the ride store and Strava access on import → never import `app.main` here; test: the saved-rides file is untouched after a run.
- Two runs in one second or a reused name would overwrite → open with exclusive create, add a suffix on collision; test: two runs, same clock, two files.
- The settings object holds the key → write explicit fields, never the settings object; test: the file doesn't contain the fake key.

---

### Task 06: coach-docs

**Files to modify:**
- `README.md` — section 3's table (new settings, no `OLLAMA_EMBED_MODEL`), section 5 rewritten: `.env` examples for Claude and another Ollama model with placeholder keys, `OLLAMA_CONTAINERS=0` with cloud, data sent to a cloud provider (taken from `prompts.py:52-92`), the spending total and `docker compose down -v`, the paper-index rebuild command, the **Live check** command and `live-checks/`; section 7's `biketr_coach_settings` row without `model`.
- `.env.example` — final wording for every new setting.
- `PROCESS.md` — dated decisions: in-process **Search model**, one OpenAI-compatible path, **Spending cap**.
- `docker/coach/tests/test_prompts.py` — gives the fixture rides distinctive names (the fixture has none) and asserts no name reaches the prompt.
