---
feature: model-switch
status: DRAFT
reviewed: 2026-11-07
head: dc0c3392dbdcd1820dbaae4e5fd1d6e233abc440
---

# Review — model-switch

**Scope**: 47 files (primary — diff since base `02f2edf7`; 14 workflow artifacts under `.ai/` excluded)
**Findings**: 0 must-fix · 3 should-fix · 2 nit

## Findings

### F-1 · should-fix · bug · Cloud request charged before the provider accepted it   [ADDRESSED]
**File**: `docker/coach/app/workout.py:185`
**Issue**: `billed` starts as `True` and only a `ModelError` with `billed=False` clears it, so a cloud request that never reached the provider is still charged the ceiling cost (8,000 input and 4,000 output tokens): a `CLOUD_URL` written without `https://` raises httpx `UnsupportedProtocol`, which `cloud.connection_error` (`docker/coach/app/cloud.py:57`) leaves billed, and Stop, a new request or a closed tab while the client is still connecting or waiting for the provider's answer cancels the stream with no `ModelError` at all.
**Change**: Charge in the `finally` only once the provider has answered 200: have `cloud.chat_stream` signal acceptance right after its status check (`cloud.py:92`), mark the errors raised before it `billed=False`, and start `billed` as `False` in `workout.run` until that signal arrives.
**Why**: The plan's guard for this task reads "ceiling only when the provider answered 200 and usage never came"; the spec charges the ceiling because "the provider may bill what it already wrote", and a request it never received wrote nothing. Reproduced offline: with `CLOUD_URL=api.example.com/v1/` every request ends "Connessione con il provider cloud interrotta (UnsupportedProtocol)" with `billed=True`, so each click adds about $0.056 at the README's example prices until the cap stops the Coach.

### F-2 · should-fix · bug · Live check total leaves out ceiling charges   [ADDRESSED]
**File**: `docker/coach/app/live_check.py:166-168`
**Issue**: `totalCost` and the printed "Costo totale" add up only the per-situation `cost` values, so a situation the provider answered without token counts (cost `null`, ceiling charged) or one that failed mid-stream after a 200 (error record with no cost at all, `live_check.py:98-99`, ceiling charged by `workout.py:196-199`) adds to the spending total but not to the run's total.
**Change**: Record in every situation's entry, failed ones included, the amount the situation added to the spending total (ceiling included), and sum that amount into `totalCost` and the printed total.
**Why**: REQ-19 asks for "the run's total cost", and the file is how a run made on the Mac is judged here: with all three answers missing their token counts, the run prints "Costo totale: —" while about $0.17 (example prices) went into the total.

### F-3 · should-fix · bug · Unexpected error aborts the live check with no file   [ADDRESSED]
**File**: `docker/coach/app/live_check.py:98`
**Issue**: `situation()` catches only `CoachError`, so any other exception ends the command with a traceback, skips the remaining situations and writes no results file, even for answers already paid: for example an `OSError` writing `/data/spending.json`, a search-model failure, or `httpx.InvalidURL` from `provider.client(chat)` with a malformed `CLOUD_URL` such as `https://[::1` (verified: `InvalidURL` is not an `httpx.HTTPError`).
**Change**: Also catch `Exception` in `situation()` and record it as an internal error with its message, as the service does for each request in `docker/coach/app/main.py:105-108`, so the next situation runs and the file is written.
**Why**: REQ-18: a failing situation records its error and the run continues with the next situation.

### F-4 · nit · bug · Cloud address without http(s) gets a misleading message   [ADDRESSED]
**File**: `docker/coach/app/provider.py:67-71`
**Issue**: `settings()` accepts any non-empty `CLOUD_URL`, so an address written without `http://` or `https://` (for example `api.anthropic.com/v1/` or `https//api.anthropic.com/v1/`) fails every request and "Verifica connessione" with "Connessione con il provider cloud interrotta (UnsupportedProtocol)", which names neither the setting nor the cause.
**Change**: Refuse in `settings()` a `CLOUD_URL` that does not start with `http://` or `https://`, with an Italian message naming `CLOUD_URL`, as the missing-value check on line 67-69 does.
**Why**: The spec's validation rule: a wrong `.env` value gives a clear Italian message, with no call made.

### F-5 · nit · bug · Huge integer total crashes instead of refusing   [ADDRESSED]
**File**: `docker/coach/app/spending.py:45-46`
**Issue**: `is_amount` calls `math.isfinite` on a JSON integer without catching `OverflowError`, so a spending file holding an integer too large for a float (a hand edit, about 400 digits) raises instead of giving the `spending_unreadable` refusal: the status and workout routes answer a bare 500 and the live check crashes.
**Change**: Guard `math.isfinite` with the same `OverflowError` catch as `workout.is_number` (`docker/coach/app/workout.py:40-46`); `spending.py` cannot import it, since `workout.py` already imports `spending.py`.
**Why**: Spec edge case: an unreadable total refuses cloud requests with a message.
