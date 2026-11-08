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

### Chat model
The model that writes the Coach's answer, picked in `.env`: an Ollama model (`qwen2.5:7b` by default) or a cloud model reached through an OpenAI-compatible endpoint (reference: Claude). The browser never chooses it.
_Avoid_: "the model" alone (the **Search model** is a model too), "provider" (where the chat model runs, not the model itself), "LLM" (generic).

### Search model
The small text-embedding model inside the **Coach service** that encodes the search text and the papers to find the 4 closest. It is the same for every **Chat model** and works offline once installed.
_Avoid_: "embedding model" in user-facing text (too technical), "nomic-embed-text" (the Ollama model it replaces).

### Live check
One command that runs the Coach on 3 made-up situations with the **Chat model** `.env` names and writes a results file into the repository, so a run made on another computer can be evaluated here.
_Avoid_: "test" (the automated tests use fake models), "test set" or "eval" (that is the **Evaluation set**).

### Spending cap
The dollar limit in `.env` on cloud **Chat model** spending: the **Coach service** keeps a running total of answer costs and refuses cloud requests once it reaches the limit. Ollama answers never count.
_Avoid_: "budget" (confused with the token limit per answer), "quota" (the provider's own rate limits).

### Evaluation set
The fixed list of 25–30 made-up athlete situations, each with the protocols the **Selection rules** allow, used to grade a **Chat model** answer by answer. A run saves every answer, and a grading step that calls no model scores it.
_Avoid_: "exam" (only a teaching comparison), "test set" (the automated tests use fake models), "live check" (the quick 3-situation run, **Live check**).

### Selection rules
The ordered rules that give, for an athlete's form, hard share and minutes available, the protocols the Coach may choose. Each names its source: the PMID of a **Supporting paper**, or "practice" when no paper gives the number. The prompt, the **Fallback rules** and the **Evaluation set** all follow them.
_Avoid_: "prompt rules" (they live outside the prompt too).

### Supporting paper
The paper in the Coach's index that a protocol comes from, found by a PubMed search. A protocol with no such paper is labeled practice.
_Avoid_: "source" alone (a selection rule's source may be practice).

### Fallback rules
The Coach's fixed choice of protocol when the **Chat model**'s answer is cut off, unreadable, names no catalog protocol, or picks one too long for the minutes: the first protocol the athlete's **Selection rules** rule allows for those minutes. The workout card names which of the four causes it was.
_Avoid_: "backup choice" (used once in an interview; the README says fallback).

## Decisions

- **The browser sends the athlete profile instead of the service estimating it**: FTP and heart-rate values travel with each Coach request. Why: the estimates use segment data only the browser has, and the Coach must use the same numbers the app shows.
- **Disconnecting from Strava deletes the rides the Coach service saved**: Why: data belongs to a connection, and Strava's terms ask apps to delete data when access is withdrawn.
- **The Coach request lives in `web/src/app/coach-run.ts`, not in the screen**: the screen only reads its state and calls `generateWorkout` / `stopWorkout`. Why: switching section unmounts the screen, and the answer must keep arriving and be there on return.
- **Stop only closes the connection**: it aborts the browser's request, with no new service endpoint. Why: the service already stops Ollama when the client leaves (`docker/coach/tests/test_cancel.py`), the same path a new request or a closed tab takes.
- **The shortest Coach workout is 30 minutes**: the **Selection rules** cover 30–240 minutes (user decision of 2026-11-07), and the Coach screen and service accept only 30–240 (eval-set spec 1.1); a duration saved in the browser outside that range opens at the nearest limit. Why: 20 minutes is not a valid workout, and a rider who only wants analysis (for example while following another app's plan in winter) does not ask the Coach.

- **A selection rule's source paper counts as given when grading**: a PMID cited from the rules' sources (Seiler 2010, Stöggl 2014) is not an invented citation, but "supporting paper found" still counts only the papers the search returned (user decision of 2026-11-08). Why: the prompt prints those sources beside the rules, and after the rewrite every "invented" citation was one of them, copied from the prompt.
- **A measured result goes into the README as measured, even when it is worse**: the rewritten rules made qwen2.5:7b follow them less (12 of 27, 15 before) and qwen2.5:3b barely more (9, 8 before), and the README says so (user decision of 2026-11-08). Why: the evaluation set exists to stop untested claims like "the new prompt is better".

- **Every unusable answer goes to the Fallback rules, and the card says which cause**: a catalog protocol too long for the minutes is treated like an unreadable answer (user decision of 2026-11-08), and the Coach service writes the card's warning, one Italian text per cause (cut off, unreadable, not in the catalog, too long), with only catalog names and numbers. Why: the old Z2 swap ignored the athlete's rule (a tired rider got Z2), the old fixed text blamed invalid JSON for every cause, and only the service knows catalog names and minimum minutes.

## Gotchas

- **The Coach tests cannot read the project's paper index**: the `coach` container mounts only `./docker/coach` (at `/app`), so pytest sees `tests/fixtures/papers_index.json`, never `/project/papers_index.json`. A check on the real index belongs in a `coach-tools` command (which mounts the project at `/project`), such as the index rebuild.
- **The browser reference cannot learn new Coach rules**: `tests/fixtures/coach_expected.json` is produced by the old browser Coach (`tests/reference/make_reference.mjs`), so a deliberate change to the prompt or the fallback choice can't be regenerated there. Don't hand-edit it: change only the assertions for what changed, and keep the browser comparison for the rest.
- **Regenerating the browser reference also rebuilds the test paper index**: `make_reference.mjs` rewrites `tests/fixtures/papers_index.json` from the project's `papers_index.json`, which gained the supporting papers after the fixtures were made, so a plain rerun changes the papers found in every case. To change only one case's input, mount the old index over the project's: `git show d28db13^:papers_index.json > /tmp/old.json`, then add `-v /tmp/old.json:/src/papers_index.json:ro` to the README command, and check that the diff touches only that case.
- **Python and JavaScript print values differently**: the browser wrote `null` (not `None`), `42` (not `42.0`), `[1,2]` as `1,2`, and treated `[]` as true. Every value the service puts in a prompt or compares like the browser goes through `js_str` / `js_truthy` in `docker/coach/app/jscompat.py`; the prompt tests fail otherwise.
- **httpx waits only 5 seconds by default**: on CPU, or with a cloud model reasoning in silence, the first word can take minutes. Talk to the chat model only through `provider.client()`, whose clients share `app/chat.py`'s 180-second read timeout, the Coach's 3-minute silence limit.
- **Stopping Ollama relies on uvicorn reporting a client that left**: uvicorn 0.54 declares ASGI 2.3, so Starlette watches for the disconnect while a stream is silent and cancels the request, which closes the connection to the chat model (Ollama or cloud). With ASGI 2.4 or later Starlette notices only at the next write, so a silent model would keep running. After upgrading uvicorn or Starlette, `tests/test_cancel.py` must stay green.
- **The test container sees the real `.env` and the real `/data`**: `docker compose run coach pytest` passes `COACH_PROVIDER` and `CLOUD_*` from `.env`, and mounts the `coach-data` volume at `/data`. `docker/coach/tests/conftest.py` deletes the cloud settings and points the spending total to the test's temporary folder before every test; a test that needs cloud settings sets them with `monkeypatch` (`fakes.CLOUD_ENV`), and one that reaches the ride store uses a `RideStore` in `tmp_path`.
- **Files that `coach-tools` writes into the project end up owned by root**: the container runs as root, so a new file or folder under `/project` (the paper index, `live-checks/`) stays root-owned on the computer and needs `sudo` to change. Pass every such path to `give_to_folder_owner` in `docker/coach/app/project_files.py`.
- **A cloud answer is paid from the provider's HTTP 200 on**: `workout.from_context` adds the cost (or the high estimate, when the token counts never come) only after the stream yields `Accepted`, which each provider's `chat_stream` yields right after its status check. A refused request, one that never reached the provider, or Stop before the 200 costs nothing. A new provider stream that forgets `Accepted` is never charged, so its answers would escape the cap.
- **An unreadable spending total must never count as zero**: unlike `RideStore.load`, which treats a broken rides file as nothing saved, `Spending.total` refuses cloud requests and leaves the file untouched; reading it as 0 would silently restart the cap.
- **httpx `json=` fails on half a surrogate pair**: httpx 0.28 encodes `json=` as UTF-8 without escaping, so a lone surrogate (an abstract cut at 1,200 UTF-16 units in the middle of a character above U+FFFF, or a pasted model name) raises `UnicodeEncodeError`. Send model requests as `content=json.dumps(...)`, which escapes it as `\ud835` like the browser's `JSON.stringify`.
- **Bad JSON bodies raise more than `ValueError`**: deeply nested JSON makes `json.loads` raise `RecursionError`, and a huge JSON integer makes `math.isfinite` raise `OverflowError`. Catch both wherever a request body, a model answer or a saved file is parsed or validated (check numbers with `is_number` in `docker/coach/app/jscompat.py`), or the client gets a bare 500 instead of the `{error, message}` refusal.
- **Every await in the browser's Coach request can outlive its click**: a newer click or Stop aborts the request, and a `.catch(() => null)` on a body read hides the `AbortError`. After each await in `generateWorkout`, return when `ctrl.signal.aborted` before drawing anything.
- **A fake stream that closes on abort hides a missing abort check**: a real aborted fetch fails the reader at once, so a test built like it passes even without the `signal.aborted` checks. The fake in `web/tests/coach/coach-run.test.ts` keeps sending after the abort on purpose; removing the checks must make its tests fail.
- **Saved-ride paths must re-check after waiting**: a Disconnect can arrive during any await, and another request can save a ride and drop it from the in-flight downloads. Before returning or downloading rides, check the store's `generation` (the Strava-unreachable fallback included) and the saved details, as `StravaRides.refresh` does.
- **Clearer rules in the prompt do not make a small chat model follow them**: printing all 11 selection rules in order, with sources and minimum minutes, did not raise how often qwen2.5 picks an allowed protocol (the 3b keeps a favourite, the 7b ignores the minutes). Have the code work out the allowed protocols and let the model choose among them, instead of rewriting the rules again.
- **Ctrl+C during a cloud answer charges it but never records it**: `workout.from_context`'s `finally` adds the cost to the spending total, but cancellation is not an `Exception`, so `coach_answer` never returns and the answer, with its `charged`, never reaches the results file. A total summed from saved answers (`totalCost`) is then lower than the spending total grew; the spending total itself is right.
- **A new field in the Coach result may be missing in the browser**: after an update Vite reloads the browser app at once, while the Coach service keeps its old code until `docker compose up -d --force-recreate`. Declare the field optional in `web/src/core/coach-types.ts` and give the screen a behavior when it is absent, as the fallback warning does (no warning).
