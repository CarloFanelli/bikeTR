---
feature: coach-service
version: 1.0
status: approved
completed: true
base: 681071003dda4507c9d9922f3ffbb6bf16fcc1ea
---

# Coach Service

## Overview

Moves the AI Coach's work from the browser to a new Python service, the **Coach service**, running in Docker next to the others. When you ask for today's workout, the service downloads your recent rides from Strava, computes your training load, searches the paper index, asks the local model to pick a protocol and builds the workout; the browser sends your **athlete profile** and draws the result. The Coach decides exactly as today, but its answer now appears while the model writes it, Ollama stops when a request is abandoned, and automated tests prove the Python numbers equal the browser's. It is the base for the planned AI steps: tracing, evaluation, PDF search and the coaching graph.

## Project Context

- Local only: started by the existing Docker Compose setup on Mac, Windows and WSL, reached only through the web container on 127.0.0.1.
- The **Auth server** holds the **Strava tokens** and hands out short-lived access tokens; the client secret and refresh token never leave it.
- Ollama runs in its container or on the host, at the address set in `.env`; default models stay `qwen2.5:7b` and `nomic-embed-text`.
- The other tabs, the settings screen and the FTP and heart-rate estimates stay in the browser.
- The paper index (abstracts with embeddings) already exists in the repository and is reused unchanged.
- Strava allows about 100 read requests per 15 minutes and 1,000 per day, shared with the browser.
- Prompts and every message shown to the user stay in Italian, like the rest of the app.
- The WSL laptop has no usable GPU: end-to-end Coach checks happen by hand on the Mac.

## Functional Requirements

### Asking for a workout

- REQ-1: "Genera workout di oggi" sends the duration, the model name and the **athlete profile** to the **Coach service**, which prepares the workout.
- REQ-2: The **athlete profile** carries FTP, threshold heart rate and max heart rate exactly as the app shows them, plus weight and weekly hours and days.
- REQ-3: For the same rides and profile, the Coach service sends the model the same prompts, with the same retrieved papers, as today's browser Coach.
- REQ-4: For the same model answer, the Coach service returns the same protocol, watts, steps, rationale and cited papers as today's browser Coach.
- REQ-5: The Coach tab shows the result as today: workout card, rationale, cited and retrieved papers, model name, time, tokens and raw answer.

### Rides from Strava

- REQ-6: On each request the Coach service downloads the latest 60 activities from Strava, with an access token obtained from the Auth server.
- REQ-7: The Coach service downloads **ride details** once per ride, for the latest 40 rides, and keeps them across restarts.
- REQ-8: A ride's training load uses its ride details when saved, otherwise its summary figures, following today's browser rules.
- REQ-9: After FTP or threshold heart rate changes, saved rides' training load uses the new values without downloading anything again.
- REQ-10: Disconnecting from Strava also deletes every ride and ride detail the Coach service saved.

### Live answer and stopping

- REQ-11: The Coach tab names the running step (rides, ride details with progress, papers, model) and shows the model's text as it arrives.
- REQ-12: The Coach gives up after 3 minutes with no new text from the model; total time is unlimited while text keeps arriving.
- REQ-13: When the Coach gives up, a new workout is requested, or the page reloads or closes, Ollama stops that answer within 5 seconds.

### Coach settings

- REQ-14: The Coach settings keep the model name and drop the Ollama address, which now comes only from the `.env` file.
- REQ-15: "Ping Ollama" asks the Coach service, which reports whether Ollama answers and whether the chat and embedding models are installed.

### Tests

- REQ-16: A test shows that, on made-up rides, the service's NP, TSS, fitness, fatigue, form, intensity split and capacity tier equal the browser code's.
- REQ-17: A test shows that the fallback protocol choice and every protocol's watts and steps, at several FTPs and durations, match the browser code.
- REQ-18: A test shows that, for a fixed query vector, the paper search returns the browser code's four papers in the same order.
- REQ-19: All tests run with one command documented in the README, on Mac, Windows and WSL, without Ollama or Strava.

## Data & Dependencies

### Information the feature must retain

- **Saved rides** — the latest successfully downloaded activity list and the athlete it belongs to; replaced at each successful download, used when Strava is unreachable; deleted on Disconnect, on a change of athlete, or by `docker compose down -v`.
- **Ride details** — per ride, the second-by-second figures that don't depend on FTP or threshold heart rate (normalized power, duration, heart-rate figures); created at first download and never changed; same deletion as saved rides.

### External capabilities relied on

- Strava API — activity list and per-ride second-by-second data.
- Auth server — a short-lived Strava access token on request.
- Ollama — embeddings for the paper search and the chat model, at the address in `.env`.
- Paper index — the existing abstracts with their embeddings.

## Non-Functional Requirements

- **Performance** — the first request after connecting makes at most 41 Strava requests; later requests make 1 plus 1 per new ride among the latest 40.
- **Security** — the Coach service has no published port: it is reachable only through the web container on 127.0.0.1.
- **Security** — Strava tokens never reach the browser from the Coach service; logs contain no tokens, coordinates or ride data.
- **Security** — Coach requests coming from another website are refused before any download or model call.
- **Security** — ride data lives only in a Docker volume, never in the project folder (served by the web container) or the repository; test rides are made up.
- **Validation** — duration is a whole number of minutes from 20 to 240; profile values are positive numbers or empty; the model name is non-empty and at most 100 characters.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Duration below 20 or above 240 minutes | Refused before any download: "La durata deve essere tra 20 e 240 minuti" | REQ-1 |
| FTP missing from the profile | Today's "FTP non disponibile" message; no Strava download, no model call | REQ-1 |
| Coach service not running or not answering | "Coach non raggiungibile: avvia BikeTR con docker compose up -d" | REQ-1 |
| Request coming from another website | Refused; nothing downloaded, no model call | REQ-1 |
| Two tabs ask for a workout at the same time | Both are served; neither cancels the other; the second may wait for the model | REQ-1 |
| Threshold or max heart rate, weight or weekly hours empty | Same defaults and skipped calculations as today | REQ-2 |
| A profile value that is not a positive number | Refused, naming the field | REQ-2 |
| Paper index missing or unreadable | Error naming the file and how to restore it, as today | REQ-3 |
| Ollama unreachable or embedding model missing during the paper search | "Errore retrieval paper" with today's checklist, updated for the service | REQ-3 |
| N/A — concurrent, permission: the prompts depend only on their inputs | — | REQ-3 |
| Model answer not valid JSON, or naming an unknown protocol | Today's deterministic fallback, with the warning badge | REQ-4 |
| Duration too short for the chosen protocol | Falls back to Z2 endurance with today's note | REQ-4 |
| Answer cites papers that are unknown | Ignored as today; the protocol's source paper is always added | REQ-4 |
| Model cites no papers | Only the protocol's source paper is shown, as today | REQ-5 |
| N/A — network, concurrent: displays an answer already complete | — | REQ-5 |
| Strava unreachable, erroring or over its request limit | Uses the saved rides and says from when; with none saved, "Strava non raggiungibile, riprova più tardi" | REQ-6 |
| Strava refuses the access (revoked on strava.com) | "Collega di nuovo Strava"; nothing else downloaded | REQ-6 |
| Auth server unreachable | Same wording as the main page's login-service message | REQ-6 |
| No activities at all | Fitness, fatigue and form are 0; the Coach still answers | REQ-6 |
| Connected athlete differs from the saved rides' athlete | Saved rides and details discarded before use, then downloaded again | REQ-6 |
| 41st most recent ride or older | Summary figures only; no details downloaded | REQ-7 |
| A detail download fails or hits Strava's limit | That ride uses summary figures this time and is retried next request; the result says how many rides used summaries | REQ-7 |
| Ride with neither power nor heart-rate data | Recorded as having no details; not downloaded again | REQ-7 |
| Saved details unreadable or corrupted | Treated as missing and downloaded again; no crash | REQ-7 |
| Two requests need the same new ride | Each ride is saved once and the saved data stays readable | REQ-7 |
| Request abandoned during the detail downloads | Details already downloaded are kept | REQ-7 |
| Non-ride activities (runs, hikes, gym) | Today's type weights and rules; no details downloaded for them | REQ-8 |
| N/A — network: uses only data already downloaded | — | REQ-8 |
| FTP changes between two requests | The second request's loads use the new FTP, with zero detail downloads | REQ-9 |
| Threshold heart rate empty | Heart-rate-based load skipped, as today | REQ-9 |
| Coach service not running during Disconnect | Disconnect still completes; saved rides stay until the next Disconnect or `docker compose down -v` | REQ-10 |
| Disconnect while a Coach request is downloading | The request stops; nothing it downloaded is kept | REQ-10 |
| Connection between browser and service drops mid-answer | The tab shows "Connessione col Coach interrotta"; the service stops Ollama | REQ-11 |
| First request downloads 40 ride details | The tab shows the progress, e.g. "Scarico dettagli corse 12/40" | REQ-11 |
| Model writes nothing for 3 minutes, including before its first word | Stops with "Il modello non ha scritto nulla per 3 minuti" and a pointer to the README's slow-computer section | REQ-12 |
| Model keeps writing past 1,000 tokens | Stopped; today's fallback rules pick the protocol, with the warning badge | REQ-12 |
| Model returns an empty answer | Today's fallback rules pick the protocol, with the warning badge | REQ-12 |
| New request in the same tab while the previous one runs | The previous one stops; only the new one continues | REQ-13 |
| Ollama already finished when the stop arrives | Nothing happens; no error shown | REQ-13 |
| Two tabs running, one closes | Only the closed tab's answer stops | REQ-13 |
| Model field empty | Uses `qwen2.5:7b`, as today | REQ-14 |
| Model not installed in Ollama | Error naming the model and the command that downloads it | REQ-14 |
| An old Ollama address still saved in the browser | Ignored and removed | REQ-14 |
| Coach service up, Ollama down | "Coach ok, Ollama non raggiungibile" | REQ-15 |
| A model missing | Names the missing model, as today | REQ-15 |
| Made-up rides: power, heart rate only, neither, hikes with climbing, runs, with and without details | Every value matches the browser code's | REQ-16 |
| Python and JavaScript differ only in the last decimals | Compared after the rounding the app displays | REQ-16 |
| Duration exactly at a protocol's minimum, and one minute below | Same workout or same "too short" result as the browser code | REQ-17 |
| Two papers with identical scores | Same order as the browser code | REQ-18 |
| N/A — network, permission: tests use only fixed local data | — | REQ-16, REQ-17, REQ-18 |
| Docker not running when the tests are launched | The command fails with Docker's own message | REQ-19 |
| Tests launched while BikeTR is running | They run alongside without touching its saved rides or Strava connection | REQ-19 |

## Out of Scope

- **Other tabs move to the service** — only the Coach moves; the formulas exist twice meanwhile, and the tests keep them equal.
- **FTP and heart-rate estimates on the server** — they depend on starred-segment data only the browser downloads (interview decision).
- **Settings stored on the server** — stays backlog item B-11; the browser sends the profile with each request.
- **Changes to prompts, protocol catalog, paper index or default models** — the Coach moves unchanged, so later steps measure against today's behavior.
- **Tracing, evaluation, PDF search, graph, tool calling, ride classifier, model routing** — later roadmap steps, already backlog items B-1 to B-7.
- **A Stop button** — a request stops on time limit, new request, reload or close; a button wasn't asked for.
- **Access from other devices or the internet** — BikeTR stays local on 127.0.0.1.
