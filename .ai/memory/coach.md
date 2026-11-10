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
The small text-embedding model inside the **Coach service** that encodes the search text and every **Passage**, to find the papers whose passages are closest. It is the same for every **Chat model** and works offline once installed.
_Avoid_: "embedding model" in user-facing text (too technical), "nomic-embed-text" (the Ollama model it replaces).

### Passage
A few whole sentences of a paper, at most 600 characters, labeled "PMID:n §k": from its abstract, or from its full text when an open license (CC BY, CC BY-SA, CC0) allows copying it. It is what the search finds and what the model cites; the workout card quotes it.
_Avoid_: "chunk" (jargon), "excerpt" or "snippet" (unclear which unit).

### Paper library
What the Coach searches: the **Base papers** minus the ones the athlete removed, plus the **Added papers**. The Libreria section of the app shows and changes it; it is personal and never committed.
_Avoid_: "index" (the committed file of **Base papers**), "corpus" (jargon).

### Base paper
One of the papers in the committed index file, built from the fixed list of PubMed searches. Removing one in the **Paper library** only hides it for that athlete.
_Avoid_: "default paper" (unclear whether it can change).

### Added paper
A paper the athlete added to the **Paper library** by its PMID, saved by the **Coach service** on that computer, outside git. Its full text is used only under an open license, otherwise its abstract.
_Avoid_: "uploaded paper" (nothing is uploaded: the app downloads it from PubMed and Europe PMC).

### Search score
The "Expected paper found" column of the **Evaluation set**: how many situations have the **Supporting paper** of a protocol the **Selection rules** allow among the 4 papers the search finds. It needs no **Chat model**, so a search-only run measures it on any computer.
_Avoid_: "recall@4" (jargon), "Support found" (another column, which depends on the model's choice).

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
The Coach's fixed choice of protocol when the **Coach graph** runs out of **Draft**s without one the **Check** accepts: the first protocol the athlete's **Selection rules** rule allows for those minutes. The card names the last draft's cause: cut off, unreadable, not in the catalog, too long for the minutes, or not allowed today. A last draft failing only on invented citations keeps its protocol instead.
_Avoid_: "backup choice" (used once in an interview; the README says fallback).

### Coach graph
The Coach's request as a LangGraph graph: rides, metrics, papers, **Draft**, **Check**, deliver, with the check sending a rejected draft back to the model, up to 3 drafts. The **Live check** and the **Evaluation set** enter it at papers.
_Avoid_: "pipeline" (it has a loop back), "agent" (the model chooses no steps; that is the tool-calling step).

### Draft
One answer of the **Chat model** within a Coach request; a request makes at most 3. The Coach screen calls it "tentativo".
_Avoid_: "retry" for the first one (every request has a first draft), "attempt" in specs (the screen's word only).

### Check
The **Coach graph** node that accepts a **Draft** or sends it back with code-written reasons: unusable answer, protocol not allowed by the **Selection rules** today, or a citation outside the passages given.
_Avoid_: "validation" (used for request input), "guardrail" (vague).

### Trace
The record in Phoenix of one Coach request, from the Coach screen, the **Live check** or the **Evaluation set**: each step with its duration, the prompt, the papers found, the model's raw answer, tokens, cost and the decision. Disconnecting from Strava deletes the Coach screen's traces.
_Avoid_: "log" (the service's log is lines of text, a trace has steps and durations), "span" outside code (OpenTelemetry's name for one step of a trace).

## Decisions

- **The browser sends the athlete profile instead of the service estimating it**: FTP and heart-rate values travel with each Coach request. Why: the estimates use segment data only the browser has, and the Coach must use the same numbers the app shows.
- **Disconnecting from Strava deletes the rides the Coach service saved**: Why: data belongs to a connection, and Strava's terms ask apps to delete data when access is withdrawn.
- **The Coach request lives in `web/src/app/coach-run.ts`, not in the screen**: the screen only reads its state and calls `generateWorkout` / `stopWorkout`. Why: switching section unmounts the screen, and the answer must keep arriving and be there on return.
- **Stop only closes the connection**: it aborts the browser's request, with no new service endpoint. Why: the service already stops Ollama when the client leaves (`docker/coach/tests/test_cancel.py`), the same path a new request or a closed tab takes.
- **The shortest Coach workout is 30 minutes**: the **Selection rules** cover 30–240 minutes (user decision of 2026-11-07), and the Coach screen and service accept only 30–240 (eval-set spec 1.1); a duration saved in the browser outside that range opens at the nearest limit. Why: 20 minutes is not a valid workout, and a rider who only wants analysis (for example while following another app's plan in winter) does not ask the Coach.

- **A selection rule's source paper counts as given when grading**: a PMID cited from the rules' sources (Seiler 2010, Stöggl 2014) is not an invented citation, but "supporting paper found" still counts only the papers the search returned (user decision of 2026-11-08). Why: the prompt prints those sources beside the rules, and after the rewrite every "invented" citation was one of them, copied from the prompt.
- **A measured result goes into the README as measured, even when it is worse**: the rewritten rules made qwen2.5:7b follow them less (12 of 27, 15 before) and qwen2.5:3b barely more (9, 8 before), and the README says so (user decision of 2026-11-08). Why: the evaluation set exists to stop untested claims like "the new prompt is better".

- **Every unusable answer goes to the Fallback rules, and the card says which cause**: a catalog protocol too long for the minutes is treated like an unreadable answer (user decision of 2026-11-08), and the Coach service writes the card's warning, one Italian text per cause (cut off, unreadable, not in the catalog, too long), with only catalog names and numbers. Why: the old Z2 swap ignored the athlete's rule (a tired rider got Z2), the old fixed text blamed invalid JSON for every cause, and only the service knows catalog names and minimum minutes.

- **Papers enter by PMID only, and copy a full text only under an open license**: the paper library adds a paper from its PMID (no PDF upload), and its full text is used only under CC BY, CC BY-SA or CC0, otherwise its abstract (user decision of 2026-11-10, paper-library). Why: the user wants no legal risk, and passages leave the computer through the cloud **Chat model** and, later, an online deployment, not only through a commit.

## Gotchas

- **The Coach tests cannot read the project's paper index**: the `coach` container mounts only `./docker/coach` (at `/app`), so pytest sees `tests/fixtures/papers_index.json`, never `/project/papers_index.json`. A check on the real index belongs in a `coach-tools` command (which mounts the project at `/project`), such as the index rebuild.
- **The browser reference cannot learn new Coach rules**: `tests/fixtures/coach_expected.json` is produced by the old browser Coach (`tests/reference/make_reference.mjs`), so a deliberate change to the prompt or the fallback choice can't be regenerated there. Don't hand-edit it: change only the assertions for what changed, and keep the browser comparison for the rest.
- **Regenerating the browser reference also rewrites the test paper index**: `make_reference.mjs` rewrites `tests/fixtures/papers_index.json` from the project's `papers_index.json` in the browser's form (one vector per paper, no **Passage**), and the project index gained the supporting papers after the fixtures were made, so a plain rerun changes the papers found in every case. To change only one case's input, mount the old index over the project's: `git show d28db13^:papers_index.json > /tmp/old.json`, then add `-v /tmp/old.json:/src/papers_index.json:ro` to the README command, check that the diff touches only that case, and put the passage index back with `git restore docker/coach/tests/fixtures/papers_index.json`. In that index every passage carries its paper's old one-hot vector, so the service finds the same papers as the browser did.
- **Python and JavaScript print values differently**: the browser wrote `null` (not `None`), `42` (not `42.0`), `[1,2]` as `1,2`, and treated `[]` as true. Every value the service puts in a prompt or compares like the browser goes through `js_str` / `js_truthy` in `docker/coach/app/jscompat.py`; the prompt tests fail otherwise.
- **httpx waits only 5 seconds by default**: on CPU, or with a cloud model reasoning in silence, the first word can take minutes. Talk to the chat model only through `provider.client()`, whose clients share `app/chat.py`'s 180-second read timeout, the Coach's 3-minute silence limit.
- **Stopping Ollama relies on uvicorn reporting a client that left**: uvicorn 0.54 declares ASGI 2.3, so Starlette watches for the disconnect while a stream is silent and cancels the request, which closes the connection to the chat model (Ollama or cloud). With ASGI 2.4 or later Starlette notices only at the next write, so a silent model would keep running. After upgrading uvicorn or Starlette, `tests/test_cancel.py` must stay green.
- **The test container sees the real `.env` and the real `/data`**: `docker compose run coach pytest` passes `COACH_PROVIDER` and `CLOUD_*` from `.env`, and mounts the `coach-data` volume at `/data`. `docker/coach/tests/conftest.py` deletes the cloud settings and points the spending total, the pending trace deletion and the saved **Paper library** (`library.LIBRARY_FILE` and `main.saved_library`) to the test's temporary folder before every test, so the re-encode command and the evaluation, which open the library file when they run, never touch the athlete's added papers; a test that needs cloud settings sets them with `monkeypatch` (`fakes.CLOUD_ENV`), and one that reaches the ride store, `/coach/forget` included, uses a `RideStore` in `tmp_path`, or it deletes the real saved rides.
- **Files that `coach-tools` writes into the project end up owned by root**: the container runs as root, so a new file or folder under `/project` (the paper index, `live-checks/`) stays root-owned on the computer and needs `sudo` to change. Pass every such path to `give_to_folder_owner` in `docker/coach/app/project_files.py`.
- **A cloud answer is paid from the provider's HTTP 200 on**: `workout.from_context` adds the cost (or the high estimate, when the token counts never come) only after the stream yields `Accepted`, which each provider's `chat_stream` yields right after its status check. A refused request, one that never reached the provider, or Stop before the 200 costs nothing. A new provider stream that forgets `Accepted` is never charged, so its answers would escape the cap.
- **An unreadable spending total must never count as zero**: unlike `RideStore.load`, which treats a broken rides file as nothing saved, `Spending.total` refuses cloud requests and leaves the file untouched; reading it as 0 would silently restart the cap.
- **httpx `json=` fails on half a surrogate pair**: httpx 0.28 encodes `json=` as UTF-8 without escaping, so a lone surrogate (in a pasted model name, for example) raises `UnicodeEncodeError`. Send model requests as `content=json.dumps(...)`, which escapes it as `\ud835` like the browser's `JSON.stringify`.
- **Bad JSON bodies raise more than `ValueError`**: deeply nested JSON makes `json.loads` raise `RecursionError`, and a huge JSON integer makes `math.isfinite` raise `OverflowError`. Catch both wherever a request body, a model answer or a saved file is parsed or validated (check numbers with `is_number` in `docker/coach/app/jscompat.py`), or the client gets a bare 500 instead of the `{error, message}` refusal.
- **Every await in the browser's Coach request can outlive its click**: a newer click or Stop aborts the request, and a `.catch(() => null)` on a body read hides the `AbortError`. After each await in `generateWorkout`, return when `ctrl.signal.aborted` before drawing anything.
- **A fake stream that closes on abort hides a missing abort check**: a real aborted fetch fails the reader at once, so a test built like it passes even without the `signal.aborted` checks. The fake in `web/tests/coach/coach-run.test.ts` keeps sending after the abort on purpose; removing the checks must make its tests fail.
- **Saved-ride paths must re-check after waiting**: a Disconnect can arrive during any await, and another request can save a ride and drop it from the in-flight downloads. Before returning or downloading rides, check the store's `generation` (the Strava-unreachable fallback included) and the saved details, as `StravaRides.refresh` does.
- **Clearer rules in the prompt do not make a small chat model follow them**: printing all 11 selection rules in order, with sources and minimum minutes, did not raise how often qwen2.5 picks an allowed protocol (the 3b keeps a favourite, the 7b ignores the minutes). Have the code work out the allowed protocols and let the model choose among them, instead of rewriting the rules again.
- **Ctrl+C during a cloud answer charges it but never records it**: `workout.from_context`'s `finally` adds the cost to the spending total, but cancellation is not an `Exception`, so `coach_answer` never returns and the answer, with its `charged`, never reaches the results file. A total summed from saved answers (`totalCost`) is then lower than the spending total grew; the spending total itself is right.
- **A command that exits must send its traces first**: traces leave from a background thread every 5 seconds, so a `coach-tools` command that ends right after its last answer loses that answer's trace. Call `tracing.setup(project)` before the run and the returned provider's `shutdown()` in a `finally`, as `live_check.main` and `evaluation.main` do; with Phoenix down this costs at most about 1 second.
- **Europe PMC answers HTTP 500, not 404, for a full text it does not have**: `/{PMCID}/fullTextXML` with a PMCID it holds no text for returns 500, the same as a real outage. The rebuild asks for a full text only when the search record says `inEPMC: "Y"` and gives a `pmcid`, so a 500 there always stops the build as Europe PMC failing.
- **A model's raw JSON can hide a passage label**: JSON may write "§" as `\u00a7`, so a label read from `modelRaw` as text loses its passage number and looks like a bare PMID. Read citations from the decoded fields too (`grading.cited_in` adds the decoded `razionale`); the card reads only decoded fields.
- **sqlite-vec does not keep insertion order between equal distances**: its KNN query returned 12 equal vectors in reverse rowid order, so papers with the same score would swap places. `papers.nearest_passages` sorts the hits again by score, then by position in the index; keep that sort whenever the query changes (`tests/test_papers.py` checks ties).
- **A new field in the Coach result may be missing in the browser**: after an update Vite reloads the browser app at once, while the Coach service keeps its old code until `docker compose up -d --force-recreate`. Declare the field optional in `web/src/core/coach-types.ts` and give the screen a behavior when it is absent, as the fallback warning does (no warning).
