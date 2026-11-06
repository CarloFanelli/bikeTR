---
feature: coach-service
status: APPROVED
reviewed: 2026-11-06
head: 681071003dda4507c9d9922f3ffbb6bf16fcc1ea
---

# Review — coach-service

**Scope**: 13 files (re-verification — the fix round's changes since the review of `68107100`; nothing was committed in between, so the git delta repeated all 41 feature files and the 28 the previous verdict covered, untouched since, were not re-read; 16 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · should-fix · bug · Disconnect during a slow Strava list still yields a workout   [ADDRESSED]
**File**: `docker/coach/app/strava.py:74-78`
**Issue**: When Strava fails after a Disconnect arrived during the token or list wait, the fallback returns the rides loaded at line 70, before the Disconnect, without checking `self.store.generation`, so the request builds a workout from rides the user just deleted.
**Change**: In the `except StravaUnavailable` branch, raise the `disconnected` `CoachError` when `self.store.generation != generation`, as `_saved_since` does at `strava.py:113-118`, and add a test beside `test_disconnect_during_downloads_keeps_nothing` in `docker/coach/tests/test_rides.py`.
**Why**: SPEC edge case "Disconnect while a Coach request is downloading → the request stops; nothing it downloaded is kept" (REQ-10).

### F-2 · should-fix · convention · Ping Ollama has no test   [ADDRESSED]
**File**: `docker/coach/tests/test_workout.py:29`
**Issue**: No test calls `GET /coach/ping`, so its answer (installed models, missing chat or embedding model with the pull command, 503 `ollama_unreachable` when Ollama is down) can change unnoticed.
**Change**: Let the fake Ollama answer `/api/tags` and add tests for the three answers, pinning the pull command as a literal.
**Why**: Task 01 AC "Ping Ollama answers from the Coach service and names any missing chat or embedding model" (REQ-15).

### F-3 · should-fix · convention · the 60-activity list size is never checked   [ADDRESSED]
**File**: `docker/coach/tests/test_rides.py:53`
**Issue**: The fake Strava ignores the query parameters of the activity list, so `per_page` could be any number and every test would still pass.
**Change**: Record the list request's parameters in `FakeStrava.handle` and assert `per_page == "60"` in `test_first_request_downloads_the_list_and_details_of_the_latest_40_rides` (`test_rides.py:86`).
**Why**: Task 03 AC "A request downloads the 60 latest activities with a token obtained from the Auth server" (REQ-6).

### F-4 · nit · bug · lone surrogates make the chat request fail   [ADDRESSED]
**File**: `docker/coach/app/ollama.py:104`
**Issue**: httpx encodes `json=` as UTF-8 without escaping, so a lone surrogate in the chat body raises `UnicodeEncodeError` and the request ends as "Errore interno" after the Strava download. One source is an abstract with a character above U+FFFF at UTF-16 units 1199–1200, cut in half by `prompts.paper_entry` (`prompts.py:48`). The other is a model name such as `"\ud800"`. Verified in the coach image. The browser's `JSON.stringify` escaped such characters.
**Change**: Send the chat body as `content=json.dumps(body)` with a `Content-Type: application/json` header, so lone surrogates travel escaped as `JSON.stringify` sent them.
**Why**: None of today's 10 papers has such a character, but `build_papers_index.mjs` adds PubMed abstracts, which can contain mathematical letters above U+FFFF.

### F-5 · nit · bug · crafted request bodies get a bare 500 instead of the refusal   [ADDRESSED]
**File**: `docker/coach/app/workout.py:40`, `docker/coach/app/main.py:69-72`
**Issue**: A huge JSON integer (`"duration": 1` followed by 400 zeros) makes `math.isfinite` raise `OverflowError`. Deeply nested JSON makes `request.json()` raise `RecursionError`. Both give a plain-text 500 instead of the 400 `{error, message}` refusal. The browser can send neither.
**Change**: Have `is_number` return `False` on `OverflowError`, and catch `(ValueError, RecursionError)` around `request.json()`, as `parse_model_json` does at `workout.py:104`.

### F-6 · nit · bug · an aborted refusal can overwrite the newer request   [ADDRESSED]
**File**: `coach.js:210-211`
**Issue**: When a new click aborts a request while its refused response body is being read, `res.json().catch(() => null)` swallows the `AbortError`, and "Coach non raggiungibile" is drawn over the new request's output.
**Change**: Return when `ctrl.signal.aborted` right after the `await res.json()`, as the stream loop does at `coach.js:217`.

### F-7 · nit · bug · a ride whose streams come back as a list is retried on every request   [ADDRESSED]
**File**: `docker/coach/app/strava.py:165-170`
**Issue**: A 200 stream response whose JSON is not an object (for example `[]`) makes `ride_details` raise `AttributeError`. The ride then counts as "failed" and is downloaded again on every request. The browser stored it as a ride without details and never fetched it again (`strava.js:116`).
**Change**: Pass `{}` to `ride_details` when the 200 body is not an object, so the ride is saved as "no details" like the browser did.

### F-8 · nit · bug · two requests with different lists can download a ride twice   [ADDRESSED]
**File**: `docker/coach/app/strava.py:94-102`
**Issue**: `todo` is a snapshot. When a second request's list differs (a new ride on top), the first request can finish a ride and drop it from `_downloading` before the second reaches it, and the second downloads it again. Line 102 reloads the saved data but does not use it to skip rides saved in the meantime.
**Change**: Before creating a download task, skip a ride already present in `self._saved_since(generation)["details"]`, and keep the progress count.
**Why**: Task 03 requires two concurrent requests to download each ride once (REQ-7).

### F-9 · nit · dup · ping rebuilds the "Ollama unreachable" text   [ADDRESSED]
**File**: `docker/coach/app/main.py:58-59`
**Issue**: The ping error writes `f"Coach ok, Ollama non raggiungibile su {ollama.OLLAMA_URL}"` inline, although `ollama.unreachable()` (`ollama.py:64-65`) returns the same text.
**Change**: Use `f"Coach ok, {ollama.unreachable()}"`.

### F-10 · nit · convention · the APP_CONFIG comment still promises timeouts   [ADDRESSED]
**File**: `constants.js:62`
**Issue**: The comment says "limiti rete e timeout", but this diff removed the only timeout (`ollamaTimeoutMs`).
**Change**: Drop "e timeout" from the comment.

### F-11 · nit · dead · protocolName in the reference is never read   [ADDRESSED]
**File**: `docker/coach/tests/reference/make_reference.mjs:161`
**Issue**: The generator writes `protocolName` into `coach_expected.json`, but no test or service code reads it.
**Change**: Remove the field and regenerate `coach_expected.json`.

### F-12 · nit · dup · the workout request body is written three times   [ADDRESSED]
**File**: `docker/coach/tests/test_cancel.py:91`, `docker/coach/tests/test_cancel.py:167`, `docker/coach/tests/test_cancel.py:176`
**Issue**: `request()`, `until_first_token()` and `whole_answer()` each spell out the same `{"duration": 60, "model": model, "timeZone": "Europe/Rome", "profile": ...}` dictionary.
**Change**: Build it once in a `body(model)` helper used by all three, as `test_workout.py:26` does with `BODY`.

### F-13 · nit · bug · the test server start can hang the suite   [ADDRESSED]
**File**: `docker/coach/tests/test_cancel.py:155-156`
**Issue**: `CoachServer.__aenter__` loops on `self.server.started` with no deadline and never looks at `self.task`, so a uvicorn that fails to start makes the suite wait forever.
**Change**: Stop waiting when `self.task` is done or a deadline passes, as `FakeOllamaServer.wait_closed` does at `test_cancel.py:83-87`.
