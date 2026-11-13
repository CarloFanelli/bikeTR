# Process log

The decisions taken while building BikeTR, with the reason behind each one and what it costs. Entries are appended and never rewritten: when a later feature reverses a decision, a new dated entry records the change and points back to the old one.

## docker-setup — one-command local setup (2026-11-05)

Before this feature, running BikeTR took four manual, macOS-only steps (a Python web server, Homebrew, a `launchctl` CORS setting, a Node script) and the Strava client secret lived in the browser.

### 2026-11-05 · Docker Compose is the only supported way to run BikeTR

- **Decision**: one `compose.yaml` starts everything with `docker compose up -d` and stops it with `docker compose down`; the README documents no manual alternative.
- **Why**: the same two commands work on macOS (Intel and Apple Silicon), Windows and WSL, and one documented path is easier to keep true than two.
- **Cost**: Docker Desktop is required, and the first start downloads about 2 GB of images.

### 2026-11-05 · Official images and bind mounts, no Dockerfile and no build step

- **Decision**: nginx, Ollama and Node run from their official images; the project folder is mounted read-only into nginx and served with revalidation (`Cache-Control: no-cache`).
- **Why**: a personal project should stay simple, and an edit to HTML, JavaScript or CSS must show after a normal browser reload, with no rebuild.
- **Cost**: configuration files under `docker/` are read only when a container starts, so changing them needs `docker compose up -d --force-recreate`.

### 2026-11-05 · Each person runs their own copy with their own Strava app

- **Decision**: BikeTR is installed per computer; each user creates a Strava app and writes its credentials in their own `.env`.
- **Why**: anyone should be able to use the app with their own Strava account without a shared server holding everyone's tokens.
- **Cost**: every user goes through the Strava app setup once.

### 2026-11-05 · Port 5050 and the `localhost` address are kept

- **Decision**: the app stays at `http://localhost:5050`, with the port changeable in `.env`.
- **Why**: browser data (settings, FTP history, caches) is stored per address, so keeping the old address keeps existing data; Strava's callback domain is `localhost`.
- **Cost**: users must always open `localhost`, never `127.0.0.1`, and changing the port hides data saved under the old one.

### 2026-11-05 · Only the web port is published, on the loopback, behind host and file guards

- **Decision**: the web port is bound to `127.0.0.1`; Ollama and the auth server have no host port. nginx answers 403 to any host name other than `localhost` or `127.0.0.1`, and never serves dotfiles (`.env`, `.git`) or the `docker/` folder.
- **Why**: other devices on the network must not reach the app, a hostile web page must not read it through DNS rebinding, and the project folder that nginx serves also contains `.env`.
- **Cost**: none for a single local user.

### 2026-11-05 · The Strava secret moves to `.env` now, behind a small auth server

- **Decision**: a Node auth server reads the Client ID and client secret from `.env`, runs the OAuth login (with a random `state` check) and keeps the refresh token in a Docker volume. The browser gets only short-lived access tokens.
- **Why**: keeping secrets out of the browser and out of tracked files from the start is basic hygiene, and a later server-side AI agent can reuse the server-held tokens.
- **Cost**: one more service, and a one-time reconnection, since the credentials the old version saved in the browser are deleted.

### 2026-11-05 · The browser keeps calling the Strava API directly

- **Decision**: only login and token renewal go through the auth server; every Strava API call still goes from the browser to Strava with an access token.
- **Why**: the smallest change that removes the secret from the browser; every Strava screen keeps its code and its behavior.
- **Cost**: after Disconnect, a tab that was already open can read Strava until it reloads or its access token expires (at most 6 hours).

### 2026-11-05 · The auth server is plain Node with no packages

- **Decision**: `docker/auth/server.mjs` uses only Node's built-in modules (`http`, `fs`, `crypto`, global `fetch`), like `build_papers_index.mjs`.
- **Why**: nothing to install, update or audit, and no build step; the server has five small routes.
- **Cost**: routing and JSON responses are written by hand.

### 2026-11-05 · One token renewal at a time, token file written atomically

- **Decision**: concurrent requests share a single in-flight renewal; the token file is written to a temporary file and renamed, and an unreadable file counts as "not connected".
- **Why**: Strava can replace the refresh token on each renewal, so two parallel renewals could leave a dead token saved; a crash in the middle of a write must not corrupt the connection.
- **Cost**: none measurable; a valid token is still returned in milliseconds.

### 2026-11-05 · Ollama runs in Docker on the CPU by default

- **Decision**: an Ollama container starts with the app, and a one-shot service downloads the missing models (`qwen2.5:7b`, `nomic-embed-text`) on each start.
- **Why**: the Coach must work with no manual installation on every platform.
- **Cost**: Docker cannot use a Mac's GPU, so generation is CPU-only and slow on small machines, and the models take about 5 GB.

### 2026-11-05 · The Coach reaches Ollama through the app's own address

- **Decision**: nginx forwards `/ollama/` to Ollama and removes the browser's `Origin` header; the Coach's default endpoint becomes `/ollama`, and a saved old default (`http://localhost:11434`) is migrated.
- **Why**: same-origin requests need no CORS setting (`OLLAMA_ORIGINS`, `launchctl`), and Ollama needs no host port.
- **Cost**: nginx must wait longer than its default for answers (300 s instead of 60 s), because the Coach receives the whole answer at the end.

### 2026-11-05 · Host-Ollama option via `.env`, relying on Docker Desktop

- **Decision**: `OLLAMA_CONTAINERS=0` plus `OLLAMA_URL=http://host.docker.internal:11434` turn the Ollama container off and use the Ollama installed on the computer. The planned `extra_hosts` entry was dropped.
- **Why**: on a Mac, the host Ollama uses the GPU. Docker's internal DNS, which nginx uses, ignores `extra_hosts`, while Docker Desktop resolves `host.docker.internal` by itself, so the extra line would have done nothing.
- **Cost**: the option needs Docker Desktop; on Linux and WSL the host Ollama must listen on all interfaces.

### 2026-11-05 · The paper index stays committed and is not rebuilt by Docker

- **Decision**: `papers_index.json` is used as committed; no start or stop command rebuilds it.
- **Why**: rebuilding needs PubMed and Ollama and changes the Coach's sources; it is a deliberate maintenance step, not part of starting the app.
- **Cost**: changing the embedding model requires rebuilding the index by hand.

### 2026-11-05 · Default Coach model and 3-minute timeout kept despite slow CPU generation

- **Decision**: `qwen2.5:7b` and the 3-minute Coach timeout stay the defaults, even though one generation took over 5 minutes on the development laptop (Intel i5-1240P, CPU only, WSL).
- **Why**: the laptop is for development; the Coach is tested by hand on a Mac. A smaller model (`qwen2.5:3b`, 161 s) was less precise in the test.
- **Cost**: on CPU-only machines the default can time out; the README explains how to choose a smaller model.

### 2026-11-05 · LF line endings for every text file

- **Decision**: `.gitattributes` with `* text=auto eol=lf`.
- **Why**: 17 files had Windows line endings, so checkouts on different systems showed files as modified when nothing had changed.
- **Cost**: none; Git detects binary files and leaves them alone.

## coach-service — the Coach moves to a Python service (2026-11-06)

Before this feature, the whole Coach ran in the browser: it computed the training load, searched the paper index and called Ollama through nginx. The planned AI steps (tracing, evaluation, PDF search, a coaching graph) are built on Python libraries, so the Coach's work moves to a server-side service first.

### 2026-11-06 · The Coach service is Python with FastAPI, uvicorn and httpx

- **Decision**: a new `coach` service runs Python 3.12 with FastAPI on uvicorn and uses httpx to call Ollama; nginx forwards `/coach/` to it, and it publishes no port.
- **Why**: Langfuse, LangGraph and the vector stores of the later steps are Python libraries. FastAPI streams responses and notices a closed connection, and httpx makes asynchronous calls with explicit timeouts, which the live answer and the stop of abandoned requests need.
- **Cost**: a second language in the project, and four pinned packages to keep up to date.

### 2026-11-06 · First Dockerfile, for the Coach service's packages only

- **Decision**: `docker/coach/Dockerfile` builds an image with Python and the packages of `requirements.txt`; the code is mounted read-only like the auth server's. This revises "Official images and bind mounts, no Dockerfile and no build step" (2026-11-05) for this one service.
- **Why**: Python packages must be installed before the service starts; installing them at every start would be slow and need the network each time.
- **Cost**: the first start builds the image, and a change to `requirements.txt` needs `docker compose up -d --build`. A code change still needs only `--force-recreate`.

### 2026-11-06 · Ollama's address comes only from `.env`

- **Decision**: the Coach settings drop the Ollama address field and keep the model name; an address saved by older versions is deleted from the browser. "Ping Ollama" asks the Coach service, which uses `OLLAMA_URL`.
- **Why**: once the service calls Ollama, an address typed in the browser would be one the service never uses; a single place to set it avoids two settings that disagree.
- **Cost**: switching between Docker's Ollama and the computer's means editing `.env` and restarting.

### 2026-11-06 · Every Coach service request from another website is refused

- **Decision**: the service answers 403 to any request whose `Sec-Fetch-Site` header is present and not `same-origin`, before doing any work, as the auth server does for Disconnect.
- **Why**: a page on another website open in the same browser could otherwise make the service download rides or keep the model busy.
- **Cost**: the Coach service's addresses cannot be opened by typing them in the browser's address bar; `curl`, which sends no such header, still works for checks.

### 2026-11-06 · The browser code is the reference for the Python numbers

- **Decision**: a Node script runs the browser's own modules on made-up activities, with a frozen clock and in two time zones, and saves their results; the Python tests must reproduce them exactly (to 12 significant digits for unrounded loads, exactly for every rounded value). The athlete profile replaces the browser's FTP and heart-rate estimates in the script.
- **Why**: a formula ported by hand can drift silently. JavaScript and Python differ in rounding (`Math.round(2.5)` is 3, Python's `round(2.5)` is 2), in summing (Python 3.12's `sum()` compensates rounding errors), and in how dates without a time zone are read, so the port reproduces JavaScript's behavior in a small `jscompat` module.
- **Cost**: while the Coach's other tabs still compute the same numbers in the browser, the formulas exist twice; the tests keep them equal, and the reference must be regenerated after a formula change.

### 2026-11-06 · Ride details store only figures that do not depend on FTP

- **Decision**: for each ride, the service keeps unrounded normalized power, the number of power samples, the unrounded mean heart rate and the number of heart-rate samples; TSS and heart-rate TSS are computed at each request from the current FTP and threshold heart rate.
- **Why**: the browser cached TSS computed with the FTP of the day it downloaded the data, so a new FTP needed a new download; now a new FTP changes the training load at once.
- **Cost**: none measurable; the computation takes microseconds per ride.

### 2026-11-06 · Ride days follow the browser's time zone

- **Decision**: each request carries the browser's time zone, and the service uses it to place each ride on a day and to know which day is today.
- **Why**: the Docker service runs in UTC while the browser runs in local time; Strava writes local start times with a "Z", so a ride at 23:30 counts on the next day in Rome, and the Coach must count it as the Training tab does.
- **Cost**: one more field in each request.

### 2026-11-06 · The Coach service downloads the rides itself and keeps only what it reads

- **Decision**: on each Coach request the service asks the auth server for an access token and downloads the latest 60 activities; it saves the list, the athlete it belongs to, and the ride details of the latest 40 rides in a `coach-data` Docker volume. Of each activity it keeps only the figures the Coach reads (type, date, duration, distance, power, heart rate, climbing, suffer score): no coordinates, route maps or titles.
- **Why**: the later AI steps run on the server and need the rides there; the browser's copy of the rides is not reachable from Docker. Keeping only the needed fields limits what a copy of the volume would expose.
- **Cost**: the first Coach request after connecting makes up to 41 Strava requests (of the 100 allowed every 15 minutes, shared with the browser); later ones make 1 plus 1 per new ride.

### 2026-11-06 · Ride details are downloaded once per ride and survive restarts

- **Decision**: a ride's details are downloaded the first time it appears among the latest 40 rides and kept until it leaves them. A ride with neither power nor heart rate is saved as having no details and never asked again; a failed download is retried at the next request. A "too many requests" answer from Strava stops the downloads for that request.
- **Why**: Strava's request limit is small, and second-by-second data never changes once a ride is uploaded.
- **Cost**: when a download fails, that ride's training load comes from its summary figures until the next request, and the Coach says how many rides that affects.

### 2026-11-06 · Disconnect deletes the Coach service's saved rides, even mid-download

- **Decision**: "Disconnetti da Strava" first removes the tokens from the auth server, then asks the Coach service to delete its saved rides. A counter that grows at each deletion stops any download started before it from saving anything.
- **Why**: the data belongs to the connection, and Strava's terms ask apps to delete data when access is withdrawn; without the counter, a download in progress could write deleted rides back.
- **Cost**: if the Coach service is not running during Disconnect, its saved rides stay until the next Disconnect or `docker compose down -v`.

### 2026-11-06 · When Strava cannot be reached, the Coach uses the saved rides

- **Decision**: if Strava or the token renewal fails, or Strava answers "too many requests", the service uses the last saved list and details and reports when they were downloaded; with nothing saved it answers "Strava non raggiungibile, riprova più tardi".
- **Why**: a workout from rides a few hours old is more useful than no workout.
- **Cost**: the workout may miss the most recent rides; the Coach says from when its data is.

### 2026-11-06 · The workout is built on the Coach service; the browser only asks and draws

- **Decision**: the protocol catalog, the prompts, the paper search, the fallback rules and the cited papers move from `coach.js` to the Coach service. The browser sends the duration, the model name, its time zone and the athlete profile, then draws the steps and the result. The old browser code is kept in the tests folder, and the tests check that the service gives the same prompts, papers and workout for the same model answers.
- **Why**: the next AI steps (agents, tracing, evaluations) run in Python on the server and need this logic there; comparing against the old code proves the move changed nothing for the user.
- **Cost**: the browser code can no longer be changed and tested alone; the reference results must be regenerated in Node after changing the frozen copy or the test cases.

### 2026-11-06 · The workout answer arrives as a stream of events

- **Decision**: `POST /coach/workout` answers with one JSON line per event: each step (rides, ride details with progress, papers, model), the model's text while it is written, then the result or an error. Requests the service refuses (wrong duration, profile value, time zone or model name, missing FTP, another website) get a plain JSON error before any download or model call. nginx passes the events on as they arrive and waits up to 5 minutes between two of them.
- **Why**: a generation on CPU takes minutes; seeing the steps and the text shows the Coach is working, and a refusal before any work costs nothing.
- **Cost**: the browser needs a stream reader that rebuilds lines and characters split between network chunks; it has no automated test and was checked by hand.

### 2026-11-06 · The Coach service reads the paper index through nginx

- **Decision**: the service fetches `papers_index.json` from nginx (`http://web/papers_index.json`) at each request, instead of having the file mounted into its container as the plan said.
- **Why**: Docker mounts a missing single file as an empty folder it creates in the project; `git restore papers_index.json` would then fail. Through nginx a missing file gives the same "non trovato (HTTP 404)" message the browser gave, and an edited index counts at the next request.
- **Cost**: one small local request per workout, and the Coach's paper search depends on nginx, which already serves the Coach.

### 2026-11-06 · The Coach's time limit is 3 minutes of silence, not 3 minutes in total

- **Decision**: the Coach service waits as long as the model keeps writing and gives up only after 3 minutes without new text, including the wait before the first word. Answers are capped at 1,000 tokens by Ollama's own option; a cut answer goes to the fallback rules. The browser has no time limit of its own. This revises "Default Coach model and 3-minute timeout kept despite slow CPU generation" (2026-11-05): the default model stays, the limit changes meaning.
- **Why**: on a CPU a correct answer can take more than 5 minutes while text keeps arriving; silence is what shows the model is stuck. The cap stops a model that never ends its answer.
- **Cost**: a model that writes very slowly but steadily can keep the computer busy for a long time; the tab shows its text, so the user can stop it.

### 2026-11-06 · An abandoned Coach request stops Ollama

- **Decision**: when the browser leaves a request (new request from the same tab, reload, closed tab, dropped connection) or the silence limit fires, the service cancels that request's work and closes its connection to Ollama, which stops generating. Each request has its own connection, so other tabs carry on. Tests use a real fake Ollama server and a real uvicorn server to measure that the connection closes within 5 seconds.
- **Why**: an abandoned answer that kept running in Ollama held the Mac's processor at 100%.
- **Cost**: it relies on uvicorn telling the app that the client left while nothing is being written. The installed uvicorn and Starlette do this; an upgrade of either must keep the cancellation test green.

## vue-ts-restructure — the browser app moves to Vue and TypeScript (2026-11-06)

Before this feature, the browser app was hand-written JavaScript: files of up to 1,900 lines mixed calculations, saved data and HTML strings, nothing checked their types, and only the Coach service had tests. The Auth server was plain JavaScript too.

### 2026-11-06 · The app is Vue and TypeScript, turned into JavaScript by Vite as it is served

- **Decision**: the app is rewritten in Vue 3 and TypeScript under `web/src/`. A new `app` container (the official `node:22-alpine` image with a start script, no Dockerfile) runs Vite's development server behind nginx, which turns each TypeScript and Vue file into JavaScript when the browser asks for it. There is no optimized built version. This revises "Official images and bind mounts, no Dockerfile and no build step" (2026-11-05): the app now has a build step, done live by Vite, and still no Dockerfile.
- **Why**: types and small tested files catch mistakes the old files let through, and Vue screens replace HTML built by joining strings. Vite keeps the old habit: a saved change shows in the open page within seconds.
- **Cost**: npm packages to install at the first start (kept in a Docker volume) and to keep up to date; the first start takes about a minute longer.

### 2026-11-06 · The Auth server is TypeScript, run directly by Node, still without packages

- **Decision**: `docker/auth/server.mjs` becomes `server.ts`, which Node 22 runs by removing the types; it still uses only Node's built-in modules. This revises "The auth server is plain Node with no packages" (2026-11-05) in language only.
- **Why**: the same check command covers it, and nothing needs to be built or installed.
- **Cost**: only TypeScript that Node can strip is allowed (no `enum`, no parameter properties); its types are checked by the check command, not when it starts.

### 2026-11-06 · Calculations are functions that get everything as input and keep the old numbers

- **Decision**: every calculation moves to `web/src/core/` and receives settings, saved values and the current time as arguments. Results recorded from the JavaScript app before the move are the reference the tests compare with, and the Coach service's reference results are regenerated identically from the new code.
- **Why**: a rewrite must not change a single number, and a function that reads nothing by itself can be tested with made-up data.
- **Cost**: known wrong behaviors are kept as they were (formula fixes are their own feature), and the recorded results can no longer be re-recorded once the old app is gone.

### 2026-11-06 · One check command for types, tests, import loops and file length

- **Decision**: `docker compose run --rm --no-deps app npm run check` type-checks the app and the Auth server, runs their tests, and fails on any file that imports a file importing it back or that is longer than 500 lines.
- **Why**: small files without loops can be read and tested one at a time, and one command is easy to run before every commit.
- **Cost**: the import check reads imports with a regular expression instead of the TypeScript compiler, which takes seconds to load; long files must be split.

### 2026-11-07 · Vuetify, not PrimeVue

- **Decision**: the screens are built from Vuetify 4 components (MIT licence), with Material Design Icons as SVG paths (`@mdi/js`). PrimeVue, chosen in the plan, is removed.
- **Why**: since July 2026 PrimeVue 5 needs a licence key renewed every year; without one every page shows a red notice, so anyone running their own copy would see it.
- **Cost**: Vuetify's components cannot be loaded in the tests, so screens are checked in a browser.

### 2026-11-07 · A sidebar, an Impostazioni screen, and the activity detail inside the app

- **Decision**: a sidebar lists the five sections, with Impostazioni and the Strava connection at its bottom. The settings that sat inside the Training tab, the Coach model with Ping Ollama, and "Disconnetti da Strava" move to Impostazioni. An activity's detail opens inside the app, and nginx sends old `activity.html?id=…` links to it, copying the id only when it is made of digits.
- **Why**: the settings were hard to find inside the Training tab, and a separate detail page lost the app's state. Old bookmarks keep working.
- **Cost**: texts that pointed to the old places, such as the Coach's "FTP missing" error, are rewritten to point to Impostazioni.

### 2026-11-07 · Long actions keep running when you change section

- **Decision**: "Aggiorna con streams", the JSON export, "Completa da dettagli attività" and the Coach request live outside the screens, so moving to another section does not stop them; a second click while one runs does nothing, or, for the Coach, replaces the older request. The Coach screen gets a Stop button.
- **Why**: the old app drew every tab on one page, so nothing stopped when you switched; Vue removes a screen you leave.
- **Cost**: their state lives in shared modules that every screen must read, not in the screen itself.

### 2026-11-07 · Text from Strava and from the model is shown as text

- **Decision**: activity, segment and athlete names, and the model's answer, reach the page only as text, never as HTML.
- **Why**: the old app inserted some names as HTML, so a name such as `Errore <i>sempre</i>` was drawn in italics, and a crafted one could have run code.
- **Cost**: a name written with tags shows the tags.

### 2026-11-07 · The new app grew beside the old one, then replaced it at the same address

- **Decision**: the new app ran at `/nuova/` on the same address, sharing the saved browser data, and each section was compared with the old one in a browser before the next. Once every section existed, `http://localhost:5050` became the new app, and the old JavaScript, `activity.html`, `style.css` and the reference recorder were deleted. The paper-index builder moved to `tools/`, so the project root keeps only documentation, configuration and data.
- **Why**: the browser keeps saved data per address, so keeping `localhost:5050` keeps settings, caches and the Strava connection, and the side-by-side comparison showed every difference before the switch.
- **Cost**: `/nuova/` addresses no longer open anything, and the old app can come back only from git history.

## model-switch — the Coach's chat model is chosen in `.env`: Ollama or a cloud model (2026-11-07)

Before this feature, the Coach's answer could come only from Ollama, the browser sent the model's name, and the paper search needed Ollama's `nomic-embed-text`. Comparing a local model with a cloud one was not possible.

### 2026-11-07 · The paper search runs inside the Coach service, with its own model

- **Decision**: the papers and the search query are encoded by `BAAI/bge-small-en-v1.5` through `fastembed`, downloaded into the Coach image when it is built; the index records the model's name, and Ollama downloads only the chat model. This revises "Ollama runs in Docker on the CPU by default" (2026-11-05): `nomic-embed-text` is no longer used.
- **Why**: the search must find the same papers whatever model writes the answer, and a cloud model must work with Ollama turned off.
- **Cost**: the Coach image grows to about 630 MB and its first build needs internet; changing the search model means re-encoding the index (`python -m app.build_index --reencode`).

### 2026-11-07 · `.env` chooses the chat model; the browser no longer sends one

- **Decision**: `COACH_PROVIDER` (`ollama` when missing, or `cloud`) and the model's settings live only in `.env`, read by the Coach service at each request. Impostazioni shows the model in use and has no model field; a model name saved by older versions is deleted from the browser. This revises "Ollama's address comes only from `.env`" (2026-11-06), which kept the model's name in the browser.
- **Why**: the cloud key must stay out of the browser, like the Strava secret, and a single file then describes a run, so runs made on different computers compare.
- **Cost**: switching model takes an edit of `.env` and `docker compose up -d`, not a click.

### 2026-11-07 · One OpenAI-compatible path for cloud models, with no fallback to Ollama

- **Decision**: a cloud model is reached through the OpenAI-compatible chat format with `httpx`, no provider package; Claude is the reference provider, at `https://api.anthropic.com/v1/`. The prompt, catalog, fallback rules and citations are the same for every model; cloud requests send no temperature and allow 4,000 answer tokens. When the cloud provider fails, the Coach shows its error and does not ask Ollama instead.
- **Why**: one path serves Claude and other providers with a change of address, and Anthropic presents this format as meant for testing and comparing models, which is this project's use. A silent switch to Ollama would hide which model answered.
- **Cost**: only what the OpenAI-compatible format offers is reachable, and the code was tested against made-up providers only: the first real run on the Mac is the first contact with Claude.

### 2026-11-07 · A spending cap in `.env`, counted by the Coach service

- **Decision**: each cloud answer costs its tokens times `CLOUD_PRICE_IN` and `CLOUD_PRICE_OUT`; when the provider gives no token count (Stop, a dropped connection) the Coach counts 8,000 tokens read and 4,000 written. A request costs nothing until the provider accepts it (HTTP 200): refused, never received, or stopped before that, it adds nothing. The total is one file in the Coach's volume, written by one process at a time; it survives "Disconnetti da Strava", and once it reaches `CLOUD_SPENDING_LIMIT` cloud requests are refused. An unreadable total refuses them too, instead of counting as zero.
- **Why**: the user pays for every test and must see the cost before and after it; counting high when unsure keeps the cap a real cap. Money spent is not Strava data, so disconnecting does not reset it.
- **Cost**: the total is an estimate from prices typed by hand; two requests started together just under the cap can pass it by two answers; only `docker compose down -v` resets it.

### 2026-11-07 · The connection check spends no tokens

- **Decision**: **Verifica connessione** asks Ollama for its model list, or the cloud provider for the card of `CLOUD_MODEL` (`GET models/{name}` with the key), never for an answer.
- **Why**: a check clicked many times while fixing `.env` must be free.
- **Cost**: Claude's OpenAI-compatible layer documents only chat, so the lookup also sends the headers Claude's own model lookup expects; it is proven only against a made-up provider until the first click on the Mac.

### 2026-11-07 · The live check runs on made-up rides, and its results go into git

- **Decision**: `docker compose run --rm coach-tools python -m app.live_check` runs the Coach's steps with the chat model of `.env` on 3 made-up situations, the rides of the tests, and writes a new JSON file to `live-checks/`, never overwriting one and never writing the key. The files are committed.
- **Why**: development happens on a laptop where Ollama must not run and no paid model is called, so runs happen on the Mac and travel through git to be evaluated. Made-up rides keep runs comparable, and send no real ride to a provider while it is unclear whether Strava's terms allow it.
- **Cost**: 3 situations do not show how a model does on real, varied rides; a cloud run costs money and counts toward the same cap as the app.

## eval-set — the Coach is measured on 27 made-up athletes, before and after its rules are rewritten (2026-11-08)

Before this feature, the Coach's prompt held eight hand-written selection rules with gaps (form -12 with 10% hard riding matched none) and clashes (time rules came last), six of the eight papers the catalog cited were missing from the paper index and some described other training, and only 3 situations were ever checked.

### 2026-11-07 · The selection rules come from the papers, or say they are practice

- **Decision**: the selection rules are data in the Coach service, in a fixed order (rest and recovery, then the time rules, then the others), each naming its source: the PMID of a paper in the index, or practice when no paper gives its number. The prompt prints them, the fallback rules follow them, and the tests check that every situation gets at least one allowed protocol that fits its minutes.
- **Why**: one written copy cannot disagree with itself, and a source per rule shows which numbers rest on a study and which on coaching habit.
- **Cost**: most numbers are practice (the form cut-offs, the time rules), and saying so makes it visible.

### 2026-11-07 · Each workout names a paper that describes it, found by a PubMed search

- **Decision**: every catalog protocol names a supporting paper whose PubMed title or abstract describes it, or is labeled practice; the index rebuild finds each through a PubMed search that must return it first, never through a typed PMID.
- **Why**: several cited papers described other training (Z2 with cadence drills cited a heavy strength study), and a search that must find the paper keeps the choice checkable.
- **Cost**: seven protocols, sweet spot among them, have no paper and say so.

### 2026-11-08 · An evaluation set graded by fixed checks, not by another model

- **Decision**: 27 made-up athletes, each listing the protocols the selection rules allow and naming the rule it tests, with every rule tested twice and every threshold exactly on it. `python -m app.evaluation` runs the chat model of `.env` on all of them and writes a results file to `eval-runs/`, committed like the live check; `python -m app.grading` scores saved files with fixed checks on what the model wrote (rules followed, readable JSON, invented citations, supporting paper cited and found, fallback, seconds, cost), and calls no model.
- **Why**: a fixed check repeats identically and costs nothing, a corrected set re-grades old runs without running them again, and judging the model's own text keeps the Coach's corrections from passing as the model's merit.
- **Cost**: the scores say whether the choice is allowed, not whether the explanation is good; 27 answers make a difference of a few answers uncertain.

### 2026-11-08 · The shortest Coach workout is 30 minutes

- **Decision**: the Coach service refuses durations outside 30–240 minutes, the Coach screen's field stops there, and a saved shorter or longer duration opens at the nearest limit. This revises the 20–240 minutes of the coach-service feature.
- **Why**: 20 minutes is not a workout, and the selection rules are tested on 30–240 only.
- **Cost**: a tab opened before the update gets the refusal until it is reloaded.

### 2026-11-08 · The prompt rewrite changes the rules section only

- **Decision**: today's prompt was graded with qwen2.5:3b and qwen2.5:7b before the rewrite; the rewrite replaced only the eight rules and the "negative rule" with the selection rules, a line of minimum minutes per protocol, and a sentence saying the sources are not papers to cite. The fallback rules now take the first protocol the athlete's rule allows.
- **Why**: changing one thing lets the before and after rows measure that thing; the minimum minutes are part of the rules, since the allowed list drops a protocol that does not fit.
- **Cost**: the browser's prompt is no longer the reference for the rules section.

### 2026-11-08 · A rule's source paper counts as given, not invented

- **Decision**: the grading counts a citation of a selection rule's source paper (Seiler 2010, Stöggl 2014) as given, because the prompt shows it beside the rule; "supporting paper found" still counts only the papers the search returned.
- **Why**: after the rewrite the models copied those two numbers into their cited papers in 8 and 10 of 27 answers; they are real papers in the index, and calling them invented would read as made-up citations.
- **Cost**: an answer to the old prompt that cited one of those two papers without being given it would also pass; none did.

### 2026-11-08 · The rewritten prompt stays, though it did not raise rule-following

- **Decision**: the app keeps the rewritten prompt and the README shows the after rows as measured: qwen2.5:3b followed the rules in 9 of 27 situations (8 before), qwen2.5:7b in 12 (15 before). The next step is to show the model only the protocols its athlete's rule allows.
- **Why**: the new rules are complete and match the fallback rules and the tests, which the old ones did not; the drop is a few answers on one run, and the remedy is a different design, not the old rules.
- **Cost**: until that step, qwen2.5:7b follows the rules less often than with the old prompt on this set.

## fallback-reason — the workout card says why the Coach chose by itself (2026-11-08)

Before this feature, a protocol too long for the minutes became a Z2 ride whatever the athlete's selection rule said, with the model's rationale and papers on a workout the athlete did not get, and the card always blamed invalid JSON.

### 2026-11-08 · A protocol too long for the minutes goes to the fallback rules

- **Decision**: when the model picks a catalog protocol that does not fit the minutes, the Coach gives the first protocol the athlete's selection rule allows, with the fallback rationale and no papers from the model, as for an unreadable answer.
- **Why**: a tired rider with 45 minutes whose model picked Over-Under got Z2 endurance, which the recovery rule does not allow; one fallback path follows one set of rules.
- **Cost**: the model's explanation is dropped even when it was sensible; it explained a workout the rider does not get.

### 2026-11-08 · The Coach service writes the warning, one per cause

- **Decision**: the workout carries a warning naming why the fallback rules chose: the answer was cut off, was not readable, named no catalog protocol, or picked one too long for the minutes (with its name and minimum minutes). The service writes the text and the card shows it; the "fallback used" flag stays for the live check, the evaluation and grading.
- **Why**: the card blamed invalid JSON even when the JSON was fine and only the minutes were short; only the service knows the catalog names and minimum minutes, as it already writes the fallback rationale.
- **Cost**: until the Coach service is restarted after an update, the card shows no warning.

## passage-search — the Coach searches passages of the papers, and the search gets its own score (2026-11-09)

Before this feature, the Coach searched whole abstracts and gave the model 4 abstracts cut to 1,200 characters, so an answer could cite a paper but never the sentences it relied on, and no number measured the search apart from the chat model.

### 2026-11-09 · The search is measured on its own before it changes

- **Decision**: the evaluation gains "Expected paper found": the situations where the search finds, among its 4 papers, the supporting paper of a protocol the selection rules allow. A search-only run prints it without any chat model, and grading computes it from the papers found that results files already record.
- **Why**: "Support found" depends on the protocol the model chose, so it mixes the search with the model. A search-only number costs nothing and runs on any computer, so every change to the search shows its effect: 9 of 20 before this feature.
- **Cost**: it says whether the right paper is among those found, not whether the passages given are the useful ones.

### 2026-11-09 · Abstracts cut into passages, searched in sqlite-vec built in memory at every request

- **Decision**: each abstract is cut into passages of whole sentences, at most 600 characters, labeled "PMID:n §k", and each passage is encoded alone, without the paper's title. The index stays a JSON file in git; every search loads its passages into an in-memory sqlite-vec table, and the model gets the 4 papers with the closest passages, 2 passages each.
- **Why**: a passage is something the model can cite and the card can quote. Passages alone scored 14 of 20 with the final search text, against 13 with the title in front (measured with the search model only). 600 characters stay well under the 512 tokens the search model reads. A JSON file in git keeps `git restore` and the rebuild command as they were, and a database built per request needs no file on disk and no restart after a rebuild. 4 papers × 2 passages keep the paper text in the prompt within 4,800 characters, as 4 abstracts cut at 1,200 did. With passages alone the search score goes from 9 to 11 of 20.
- **Cost**: sqlite-vec is a new package in the Coach image, so each computer needs `docker compose up -d --build` once. The database is rebuilt at every request, a few milliseconds for 66 passages. The rest of a paper's text never reaches the model.

### 2026-11-09 · A paper uses its full text only under a license that allows copying it

- **Decision**: the rebuild asks Europe PMC for each paper's license. With CC BY, CC BY-SA or CC0 and the full text there, the paper's passages come from its abstract and its body sections, leaving out references, tables, figures, acknowledgments, funding, conflicts, author contributions and untitled sections; otherwise from its abstract. The license name comes from Europe PMC's search record, the license link from the full text, and a full text without a Creative Commons link falls back to the abstract. The index records the text used, and for a full text its license and link.
- **Why**: the repository is public, so copying a text into it needs a license that allows it; checking paper by paper means papers added later follow the same rule. A full text gives the search the methods and results an abstract summarizes in one sentence, and the card can always credit the license it shows.
- **Cost**: only 2 of 17 papers qualify today, and their 62 and 90 passages make them appear among the 4 papers found in 8 situations instead of 1: the search score stays 11 of 20, because they take the place of papers that were not the expected ones. The index grows from 0.6 to 1.9 MB, and the rebuild makes 19 more requests.

### 2026-11-09 · The search text names the workouts the selection rules allow

- **Decision**: the search text keeps the browser's words for form, hard share and minutes, and ends with the names of the protocols the selection rules allow for that athlete and those minutes, the same list the fallback rules use. The Coach screen, the live check, the evaluation and the search-only run all build it in the one place.
- **Why**: the model may only choose among the allowed protocols, so the useful papers are the ones about those protocols. Their names ("Seiler 4×4' (VO2max)", "Rønnestad 30/15") bring the search close to the studies behind them. The search score goes from 11 to 14 of 20, as in the trial during the spec; names, not ids, because the trial used names.
- **Cost**: some names are Italian ("Riposo", "Soglia 3×10'") and add little for an English search model. A protocol without a supporting paper still adds its name, which can pull the search toward unrelated passages.

### 2026-11-09 · The answer cites passages by label, and the card quotes them

- **Decision**: the prompt asks the model to cite passages as "[PMID:n §k]" in its explanation and to list the labels in `passaggiUsati` (it was `paperUsati`). One reader in `papers.py` turns labels, written in any of the ways models write them, and bare PMIDs into citations for both the card and the grading. The card shows each cited paper once, in first-cited order, quoting only the passages the model was given, in label order, with a full text's license linked beside the authors; the supporting paper of the chosen workout is added when missing, quoting its closest passage. Results files record the passages given (`passagesFound`, label and score); grading counts a label not given as invented, while files without `passagesFound` are graded on PMIDs as before.
- **Why**: a passage label says which sentence an answer relied on, so a reader can check it, and the card can quote it. Dropping labels that were never given keeps an invented quote off the card, and counting them keeps the evaluation honest. Reading the old list only in grading keeps the four saved runs' scores unchanged (checked: identical rows).
- **Cost**: the prompt version changes again, so the saved runs and new ones do not share a version. A paper whose only citation is an invented label still appears on the card, without a quote, because its PMID is real. A rule source's PMID stays allowed, but not a passage of it the model was not given.

### 2026-11-10 · The athlete adds papers by PMID, into a personal library outside git

- **Decision**: Libreria takes a PMID, shows a preview (title, authors, year, journal, the text the Coach would use and why, the passage count), and adds the paper only when the athlete confirms. The paper goes through the same steps as the base papers: PubMed for the record, Europe PMC for the license, the full text only under CC BY, CC BY-SA or CC0, the same passage cutter and the same search model. It is saved in the Coach's data volume (`/data/library.json`), never in `papers_index.json`, and the Coach searches the base papers plus the added ones from the next request. At most 50 papers can be added. There is no PDF upload.
- **Why**: a PMID points to a public record, so the app never stores a text it may not copy, and the license rule written for the base papers covers added ones without a second check. A personal library keeps the committed index, and the evaluation scores measured on it, the same for everyone. Confirming downloads the paper again rather than keeping the preview, so nothing is held between the two clicks and a restart in between loses nothing.
- **Cost**: confirming waits for PubMed and Europe PMC a second time, a few seconds. Papers without an open license enter with their abstract only. The added papers live in a Docker volume, so `docker compose down -v` deletes them with the rides.

### 2026-11-10 · The Coach runs as a graph whose check sends a draft back to the model

- **Decision**: each Coach request runs as a LangGraph graph with nodes rides, metrics, papers, draft, check and deliver; the evaluation set enters at papers, with the athlete numbers already computed, while the Coach screen and the live check enter at rides. The check accepts a draft that is whole, readable, a catalog protocol that fits the minutes and that today's selection rule allows, and that cites only passages the model was given (or the PMID of today's rule source). Otherwise the draft goes back to the model with its previous answer and the reasons, written by the code in Italian, up to 3 drafts. After the third, a draft wrong only in its citations keeps its workout and drops them; any other cause goes to the fallback rules, which now also cover "not allowed today". The prompt shows only the workouts today's rule allows, with that rule and its source. Results files record every draft and the fallback cause, and grading reports the rules followed at the first draft and at the last.
- **Why**: the evaluation runs showed small models following the selection rules in 9 to 15 of 27 situations, and writing all the rules out did not help. The code already knows the allowed workouts, so it can narrow the choice in the prompt and check the answer, instead of hoping the model applies 11 ordered rules. A graph makes the loop back from check to draft explicit, one node per step, each with its own step in the trace. Grading the first and the last draft separately tells what the narrower prompt achieves alone and what the returns add.
- **Cost**: a sent-back answer costs a full new model call, so a request can take up to three times as long and, with a cloud model, cost up to three times as much; the evaluation's worst case counts 3 drafts per answer. LangGraph is a new package in the Coach image (`docker compose up -d --build` once). The prompt version changes, so earlier runs and new ones do not share a version. A paper cited only through a passage label the model was not given no longer appears on the card at all.

## data-backend — the server keeps every Strava activity in a database (2026-11-13)

### 2026-11-13 · PostgreSQL in its own container, reached only by the Coach service

- **Decision**: a `db` service (PostgreSQL 17, `db-data` volume, no published port) holds the athlete's Strava data; the Coach service is the only one that connects to it, with psycopg 3. Tables come from numbered SQL files in `docker/coach/migrations/`, applied at the Coach's start, each once. Every operation opens its own connection, without a pool.
- **Why**: the whole history (hundreds of activities, thousands later) and the Coach's ride details need queries a JSON file cannot answer without reading everything. One athlete on one computer makes few requests, so a connection each costs nothing noticeable, and the tests run each in their own event loop, to which a pool would stay bound.
- **Cost**: one more container and volume; `docker compose down -v` also deletes the activities. The Coach tests need the database running, so their command loses `--no-deps`.

### 2026-11-13 · The whole Strava activity is saved, name and route included

- **Decision**: the database keeps each activity as Strava lists it, replacing the 2026-11-06 rule that kept only the figures the Coach reads. The Coach still reads only those figures.
- **Why**: Attività will show every activity from the server, with its name and route map, so the server needs them.
- **Cost**: a copy of the `db-data` volume exposes names, start points and routes, as the browser's saved data already did. "Disconnetti da Strava" deletes them all.

### 2026-11-13 · One sync at a time, at most every 5 minutes, resuming where it stopped

- **Decision**: a sync reads the athlete, the all-time stats and the activity list. The first one pages back through the whole history, 200 at a time, each page continuing before the oldest saved activity; until it reaches the first activity, the next sync resumes from there. Later syncs ask for activities after the newest saved and re-read the last 30 days, replacing changed ones and deleting those Strava no longer lists. A sync asked within 5 minutes of the last check, failed checks included, answers from the database; two syncs at once share one. A "too many requests" answer pauses until the next quarter hour.
- **Why**: Strava allows 100 requests every 15 minutes; a long history takes a few pages, and an interrupted first sync must not start over. Renames and deletions usually happen soon after a ride, so 30 days catches them without re-reading everything.
- **Cost**: an activity edited on Strava more than 30 days after its start keeps its old version.

### 2026-11-13 · Ride details download in the background, on their own budget

- **Decision**: the Coach service downloads the ride details of every activity with measured power or heart rate, one at a time, newest first, with failed ones retried after the others. It counts its own requests in the database, at most 60 per Strava quarter hour and 600 per UTC day, and pauses until the next quarter hour when Strava's usage header reaches 80 of 100 or Strava answers "too many requests". A sync wakes it; a restart resumes from the first activity still without details. "Aggiorna con streams" is gone; Profilo e dati shows how many activities have details.
- **Why**: a full history needs one request per activity, more than Strava's 100 per 15 minutes, so it cannot run behind a button. Its own lower budget, plus the usage header that counts the browser's requests too, leaves room for syncs and segment jobs. Power that Strava estimates without a power meter has no stream, so those rides are not asked.
- **Cost**: a long history takes a few hours to complete. The browser keeps computing loads from its own saved streams until the Coach computes them from the server's details.

### 2026-11-13 · The app reads the athlete and activities from the server, not from Strava

- **Decision**: on opening, the browser asks the Coach service to sync (at most once every 5 minutes) and then reads the athlete, the all-time stats and the latest 60 activities from it; the browser no longer asks Strava for them. "Aggiorna da Strava" in the athlete's menu syncs at once, sharing a sync already running, and reloads the screens' data without reloading the page. When Strava does not answer, the saved data are shown with a warning saying when they were last updated, or when Strava's pause ends.
- **Why**: page reloads were each downloading the athlete and 60 activities from Strava and had hit the 100-requests limit; one copy on the server, refreshed on a timer, makes reloads free.
- **Cost**: a ride uploaded less than 5 minutes after the last check appears only after "Aggiorna da Strava" or the next check. Starred segments, an activity's detail and the export still call Strava from the browser.

### 2026-11-13 · Attività and Home's last ride read the whole history; the rest keeps 60

- **Decision**: Attività shows the whole history saved on the server, 60 activities at a time (rounded up to whole weeks) and 60 more when the end of the list scrolls into view; its search and sport filters look through everything. Home's "Ultima uscita" searches the whole history. The server sends the full list with only the fields the cards use. The power curve, records, level, plan and charts keep reading the latest 60.
- **Why**: the history is the visible gain of keeping everything on the server, but changing the analysis windows would move values the athlete already knows (user decision).
- **Cost**: the full list is read once per session and again after each update, a few hundred kilobytes for a few thousand activities.

### 2026-11-13 · The athlete's data lives on the server; display choices stay in the browser

- **Decision**: Impostazioni, the calendar's skipped and rainy days, the FTP history, the mesocycle, the segment cache and the Coach duration are saved in the Coach service's database and read at every opening. The server refuses a value with an unknown field or a wrong type and names it. At the first opening after the update, a browser that finds the server empty sends its old copies, cleaned of fields the app no longer uses, then deletes them; a browser that finds data there deletes its copies without sending them. Theme, last Analisi tab and Attività view stay in each browser. "Disconnetti da Strava" deletes only the segment cache.
- **Why**: the same data in every browser on this computer, without merging two different histories (user decision); display choices are per device.
- **Cost**: the first browser to open the updated app decides what the server keeps, so the browser that holds the data must be opened first. A save that fails puts the previous value back and shows the error.

### 2026-11-13 · The Coach service computes each activity's load; the plan keeps a tested copy

- **Decision**: every real activity's training load comes from the Coach service, computed with the ride details it saved and the athlete's current FTP, LTHR and maximum heart rate; the browser asks again when those thresholds change. Fitness, fatigue and form are averaged in the browser from those loads. The four-week plan's simulated workouts keep a browser copy of the formula, and a test compares it with the Coach's expected values.
- **Why**: one place computes the load of what really happened, with the most precise data (user decision); the plan's simulation stays in the browser to keep the plan unchanged (backlog B-45 moves it later).
- **Cost**: two copies of the formula until B-45, kept equal by a test; opening the app needs the Coach to answer.
