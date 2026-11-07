---
feature: model-switch
version: 1.0
status: approved
completed: false
base: 02f2edf7e37991bb50492db607a3e101224e6a0a
---

# Model Switch

## Overview

The Coach's answer can be written by a model in Ollama, as today, or by a cloud model reached through the OpenAI-compatible format; `.env` decides which, and Claude is the reference cloud provider. Cloud answers show their cost, and a spending cap in `.env` stops cloud requests once reached. The paper search no longer needs Ollama: a small search model runs inside the Coach service, the same for every chat model. A live check runs the Coach on three made-up situations with the chosen model and writes a results file, so a run made on another computer can be brought back and evaluated.

## Project Context

- Development happens on a laptop where Ollama must not run; Ollama runs happen on the Mac, without Claude Code.
- Only the Coach service holds the cloud key; the browser never sees it, like the Strava credentials.
- Prompt, protocol catalog, backup rule and citations stay identical whatever model writes, so runs compare.
- Anthropic presents its OpenAI-compatible endpoint as meant for testing and comparing models: this feature's use.
- Claude 5 models reject a temperature below 1 and reason silently before answering, using answer tokens.
- Anthropic credit is prepaid: with automatic top-up off, the account itself caps spending.
- Today's paper index was encoded with Ollama's `nomic-embed-text`.
- The prompt carries no ride names: dates, types, minutes, km, power, heart rate, FTP, threshold HR, weight, load.

## Functional Requirements

### Choosing the chat model

- REQ-1: `.env` names the chat model's provider (Ollama or an OpenAI-compatible endpoint), the model name and, for the endpoint, its address and key.
- REQ-2: With no provider set in `.env`, the Coach uses Ollama with `qwen2.5:7b`, as today.
- REQ-3: Every Coach request uses the chat model `.env` names; the browser no longer chooses or sends a model.

### Writing with a cloud model

- REQ-4: With a cloud provider, the Coach screen shows the model's text as it arrives, as it does with Ollama.
- REQ-5: Stop, a new request, a closed tab or 3 minutes of model silence closes the connection to the cloud provider.
- REQ-6: Cloud requests send no sampling temperature and allow 4,000 output tokens, hidden reasoning included; Ollama requests keep temperature 0.2 and 1,000 tokens.

### Showing which model answered

- REQ-7: The workout result shows local or cloud, the model name, seconds taken, and input and output tokens.
- REQ-8: Impostazioni shows the provider and model the Coach service uses; the model text field is removed.
- REQ-9: A connection check replaces "Ping Ollama": it reports whether the provider answers, accepts the key and has the model, spending no tokens.

### Paper search without Ollama

- REQ-10: The 4 closest papers are found by a search model inside the Coach service, never by Ollama or the cloud provider.
- REQ-11: Once installed, the search works with no internet connection.
- REQ-12: `papers_index.json` is re-encoded with the new search model and records that model's name.
- REQ-13: Rebuilding the paper index encodes papers with the Coach's search model and needs no Ollama.
- REQ-14: Ollama's start-up download fetches only the chat model; `nomic-embed-text` is no longer downloaded.

### Live check

- REQ-15: One documented command runs the Coach on 3 made-up situations with the `.env` chat model, without Strava or a browser.
- REQ-16: Each situation records provider, model, chosen protocol, backup-rule use, cut at limit, JSON readability, papers found and cited, tokens, cost, seconds and raw answer.
- REQ-17: Each run writes a new results file, named by date, time and model, in a git-tracked project folder, never overwriting earlier files.
- REQ-18: A failing situation records its error message and the run continues with the next situation.
- REQ-19: The command ends by printing one line per situation (protocol, backup-rule use, seconds, tokens, cost), then the run's total cost.

### Documentation

- REQ-20: The README gives `.env` examples for Claude and for another Ollama model, and the live-check command.
- REQ-21: The README states which athlete data a cloud provider receives, and that with Ollama none leaves the computer.

### Cost and spending cap

- REQ-22: With a cloud provider, `.env` holds the prices per million input and output tokens and a spending limit in dollars.
- REQ-23: Each cloud answer's cost, computed from its token counts and the `.env` prices, appears on the Coach screen.
- REQ-24: The Coach service keeps a running total of cloud spending that survives restarts.
- REQ-25: Once the running total reaches the limit, cloud requests are refused with a message naming the total and the limit; no call is made.
- REQ-26: Impostazioni shows the running total and the limit next to the cloud model in use.
- REQ-27: Ollama answers cost nothing: no cost shown, nothing added to the total, never refused by the cap.

## Data & Dependencies

### Information the feature must retain

- **Live check results** — one file per run, created by the command, kept in the repository until deleted by hand; read here to evaluate a run made elsewhere.
- **Paper index encoding** — each paper's embedding plus the search model's name; valid until the search model changes, then re-encoded.
- **Spending total** — the sum of all cloud answer costs since the first cloud request; kept in the Coach's data folder across restarts, erased only when that folder is deleted, not by "Disconnetti da Strava".
- **Old browser model setting** — the model name Impostazioni saved before this feature; no longer read or sent.

### External capabilities relied on

- **Streaming chat endpoint, OpenAI-compatible** — writes the answer as a stream and reports token usage; reference: Anthropic's.
- **Text-embedding model running on CPU** — the search model; a new dependency, downloaded once at install.
- **Ollama** — optional: writes the answer only when `.env` picks it.
- **PubMed** — unchanged; used only when the paper list itself is rebuilt.

## Non-Functional Requirements

- **Performance** — encoding a search query takes under 1 second on the development laptop (CPU only).
- **Performance** — the search model adds at most 500 MB to the Coach service's image.
- **Security** — the cloud key appears only in `.env` and the Coach service: never in the browser, responses, logs or results files.
- **Security** — with Ollama as provider, no Coach data leaves the computer.
- **Validation** — a missing key, address, price or limit, or an unknown provider, gives a clear Italian message, with no call made.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Cloud provider chosen, key or address empty | Requests and the connection check fail naming the missing `.env` value; no call is made | REQ-1 |
| Provider value misspelled | Requests and the check fail with a message listing the two allowed values | REQ-1 |
| Model name over 100 characters | Refused with today's length message | REQ-1 |
| No `.env` file at all | Ollama in Docker with `qwen2.5:7b` | REQ-2 |
| Older `.env` with only `OLLAMA_CHAT_MODEL` set | That Ollama model is used; no new setting needed | REQ-2 |
| Tab opened before the update still sends a model name | The service ignores it and uses the `.env` model | REQ-3 |
| `.env` changed and Coach restarted during a request | That request ends with "Connessione col Coach interrotta"; the next uses the new model | REQ-3 |
| Cloud stream drops mid-answer | The text so far stays, followed by the model error, as with Ollama | REQ-4 |
| Key rejected by the provider | Error saying the key was rejected, with the provider's status; no switch to Ollama | REQ-4 |
| Provider refuses for rate limit or missing credit | Error saying so, with the provider's message | REQ-4 |
| Provider ends the stream with no text | Backup rule picks the protocol, as for today's empty answer | REQ-4 |
| Two tabs ask at once | Two independent provider requests; stopping one leaves the other running | REQ-5 |
| Provider silent for 3 minutes (long hidden reasoning) | Request ends with today's silence message | REQ-5 |
| Answer reaches 4,000 tokens | Treated as cut: backup rule picks the protocol | REQ-6 |
| N/A — empty, concurrent, network, permission: both limits are fixed per request, nothing configurable or shared | — | REQ-6 |
| Provider reports no token counts | Tokens shown as "—" | REQ-7 |
| Stop before the answer ends | No result line; the text so far is marked "Richiesta interrotta", as today | REQ-7 |
| Coach service unreachable when Impostazioni opens | The model line reads "Coach non raggiungibile" | REQ-8 |
| Model name saved in the browser by an older version | Ignored and not shown | REQ-8 |
| Provider address unreachable | Check says the provider can't be reached at that address | REQ-9 |
| Key rejected | Check says the provider rejected the key | REQ-9 |
| Model not downloaded in Ollama | Check shows the command that downloads it, as today | REQ-9 |
| Cloud provider doesn't list the model | Check warns the model isn't in the provider's list | REQ-9 |
| Index encoded by another search model | Search refused with a message giving the rebuild command | REQ-10 |
| Index with zero papers | Search refused with today's restore message | REQ-10 |
| Two requests search at once | Both get their papers without loading the search model twice | REQ-10 |
| No internet during installation | Build stops with the download error; running it again retries | REQ-11 |
| No internet later, provider Ollama | The whole Coach works | REQ-11 |
| Re-encoding the index | Same 10 papers, PMIDs, titles and abstracts; only embeddings and model name change | REQ-12 |
| Abstract longer than the search model's input limit | Encoded from its start; the rebuild prints how many were cut | REQ-12 |
| PubMed unreachable during a full rebuild | Rebuild stops; the existing index is unchanged | REQ-13 |
| Rebuild interrupted midway | Existing index unchanged: the file is replaced only when complete | REQ-13 |
| `nomic-embed-text` already downloaded | Stays in the Ollama volume; nothing deletes it | REQ-14 |
| Cloud provider chosen, Ollama containers left on | Ollama still starts and downloads the chat model; README says to set `OLLAMA_CONTAINERS=0` | REQ-14 |
| Chat model unreachable from the start | Every situation records the same error; the file is still written | REQ-15 |
| Live check while the app is in use | Both work; the check never touches saved rides or Strava | REQ-15 |
| Empty model answer | Raw answer "", not readable as JSON, backup rule used | REQ-16 |
| Answer cut at the token limit | Recorded as cut, backup rule used | REQ-16 |
| Two runs in the same second | The second file gets a distinct name | REQ-17 |
| Model name with `:` or `/` | Replaced in the file name; the full name stays inside the file | REQ-17 |
| Provider drops during a situation | Error recorded; the next situation starts | REQ-18 |
| All 3 situations fail | File still written; the command exits with an error code | REQ-18 |
| Situation failed | Its line shows "errore:" and the message | REQ-19 |
| Tokens or cost unknown | Printed as "—" | REQ-19 |
| README examples | Use placeholder keys, never a real one | REQ-20 |
| N/A — network, concurrent, permission: documentation only | — | REQ-20, REQ-21 |
| Data listed for cloud providers | Matches the prompt; a test checks the prompt holds no activity name | REQ-21 |
| Cloud provider chosen, a price or the limit missing | Every cloud request and the check refuse, naming the missing value; no call is made | REQ-22 |
| Price or limit negative or not a number | Same refusal, naming the wrong value | REQ-22 |
| Limit set to 0 | Every cloud request is refused | REQ-22 |
| Provider reports no token counts | Cost shown as "—"; the total adds a safe ceiling: 8,000 input and 4,000 output tokens | REQ-23 |
| Very small cost | Shown in dollars with 4 decimals, for example "$0.0004" | REQ-23 |
| Coach restarted, or "Disconnetti da Strava" | The total stays; only `docker compose down -v` erases it, and the README says so | REQ-24 |
| Live check and the app spend at the same moment | Both add to the same total; neither amount is lost | REQ-24 |
| Total file unreadable | Cloud requests are refused with a message; the total is never silently reset to zero | REQ-24 |
| Request started under the limit ends above it | It finishes, and the next request is refused; the total passes the limit by at most one answer | REQ-25 |
| Two requests start just under the limit | Both may run; the total passes the limit by at most two answers | REQ-25 |
| Stop, silence limit or dropped connection before the token counts arrive | The total adds the ceiling cost of one answer, since the provider may bill what it already wrote | REQ-25 |
| Live check reaches the cap mid-run | The remaining situations are recorded as refused; the file is still written | REQ-25 |
| No cloud request made yet | Total shows "$0.00" | REQ-26 |
| Provider is Ollama | No total or limit shown | REQ-26 |
| Ollama chosen while `.env` still holds cloud prices | Prices are ignored; no cost shown | REQ-27 |
| Switch from cloud to Ollama and back | The total is kept, and continues when cloud is chosen again | REQ-27 |

## Out of Scope

- **Choosing the model in Impostazioni** — decided: `.env` only, so others pick any Ollama model and the browser never asks for one the server lacks.
- **Native Claude API** — one OpenAI-compatible path keeps the switch provider-neutral; prompt caching and visible reasoning aren't needed to pick a protocol.
- **Full test set with expected protocols and scores** — next roadmap step (B-6); it extends this command.
- **Two chat models at once (model routing)** — a later roadmap step; `.env` picks one at a time.
- **Falling back to Ollama when the cloud fails** — would hide errors and mix models in a comparison.
- **The cloud provider's own embeddings** — decided: one local search model, so every chat model gets the same papers.
- **Prompt changes for Claude** — the prompt stays identical so runs compare; tuning waits for the test set's numbers.
- **Turning Ollama containers off automatically** — `OLLAMA_CONTAINERS=0` already does it; documented.
- **Prices fetched from the provider automatically** — providers don't publish prices in a standard way; they are copied from the price page into `.env`.
- **A command to reset the spending total** — raising the limit is enough to keep going.

## Open Questions

- Does Strava's API agreement allow sending ride data to a third-party AI provider to generate an answer? Check before using the cloud provider with real rides; the live check uses made-up rides only. (Owner: Carlo)
