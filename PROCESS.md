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
