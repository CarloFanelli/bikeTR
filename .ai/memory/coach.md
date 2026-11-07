# Coach

The AI Coach that proposes today's workout: where its work runs, what the browser sends it, and which ride data it uses.

## Terms

### Coach service
The server-side Python service that prepares the Coach's workout: it downloads rides from Strava with a token from the **Auth server**, computes training load, searches the paper index and calls the model. The browser only sends the **athlete profile** and draws the result.
_Avoid_: "backend" (generic: the Auth server runs on the server too), "agent" (it has no tools or graph yet).

### Athlete profile
The values the browser sends with each Coach request: FTP, threshold heart rate and max heart rate exactly as the app shows them (typed or estimated), plus weight and weekly hours and days. The estimates stay in the browser because they use starred-segment data only the browser downloads.
_Avoid_: "settings" (also covers zones, rest days and the Coach model).

### Ride details
A ride's second-by-second power and heart-rate data from Strava, downloaded once per ride by the **Coach service** and kept across restarts. Without them, a ride's training load comes from its summary figures.
_Avoid_: "precision data" (the browser button's label, not the data), "streams" outside code (Strava's API name).

## Decisions

- **The browser sends the athlete profile instead of the service estimating it**: FTP and heart-rate values travel with each Coach request. Why: the estimates use segment data only the browser has, and the Coach must use the same numbers the app shows.
- **Disconnecting from Strava deletes the rides the Coach service saved**: Why: data belongs to a connection, and Strava's terms ask apps to delete data when access is withdrawn.
- **The new app's Coach request lives in `web/src/app/coach-run.ts`, not in the screen**: the screen only reads its state and calls `generateWorkout` / `stopWorkout`. Why: switching section unmounts the screen, and the answer must keep arriving and be there on return, as in today's tab.
- **Stop only closes the connection**: it aborts the browser's request, with no new service endpoint. Why: the service already stops Ollama when the client leaves (`docker/coach/tests/test_cancel.py`), the same path a new request or a closed tab takes.

## Gotchas

- **Python and JavaScript print values differently**: the browser wrote `null` (not `None`), `42` (not `42.0`), `[1,2]` as `1,2`, and treated `[]` as true. Every value the service puts in a prompt or compares like the browser goes through `js_str` / `js_truthy` in `docker/coach/app/jscompat.py`; the prompt tests fail otherwise.
- **httpx waits only 5 seconds by default**: on CPU the model can stay silent for minutes before its first word. Talk to Ollama only through `ollama.client()`, whose 180-second read timeout is the Coach's 3-minute silence limit.
- **Stopping Ollama relies on uvicorn reporting a client that left**: uvicorn 0.54 declares ASGI 2.3, so Starlette watches for the disconnect while a stream is silent and cancels the request, which closes the connection to Ollama. With ASGI 2.4 or later Starlette notices only at the next write, so a silent model would keep running. After upgrading uvicorn or Starlette, `tests/test_cancel.py` must stay green.
- **httpx `json=` fails on half a surrogate pair**: httpx 0.28 encodes `json=` as UTF-8 without escaping, so a lone surrogate (an abstract cut at 1,200 UTF-16 units in the middle of a character above U+FFFF, or a pasted model name) raises `UnicodeEncodeError`. Send model requests as `content=json.dumps(...)`, which escapes it as `\ud835` like the browser's `JSON.stringify`.
- **Bad JSON bodies raise more than `ValueError`**: deeply nested JSON makes `json.loads` raise `RecursionError`, and a huge JSON integer makes `math.isfinite` raise `OverflowError`. Catch both wherever a request body or a model answer is parsed or validated, or the client gets a bare 500 instead of the `{error, message}` refusal.
- **Every await in the browser's Coach request can outlive its click**: a newer click or Stop aborts the request, and a `.catch(() => null)` on a body read hides the `AbortError`. After each await in `generateWorkout` (and `coach_generate` in today's tab), return when `ctrl.signal.aborted` before drawing anything.
- **A fake stream that closes on abort hides a missing abort check**: a real aborted fetch fails the reader at once, so a test built like it passes even without the `signal.aborted` checks. The fake in `web/tests/coach/coach-run.test.ts` keeps sending after the abort on purpose; removing the checks must make its tests fail.
- **Saved-ride paths must re-check after waiting**: a Disconnect can arrive during any await, and another request can save a ride and drop it from the in-flight downloads. Before returning or downloading rides, check the store's `generation` (the Strava-unreachable fallback included) and the saved details, as `StravaRides.refresh` does.
