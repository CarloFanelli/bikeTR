# Live checks

Each file here is one run of the Coach's live check: the chat model chosen in `.env` picks today's workout in 3 made-up situations (no Strava, no browser), and the file records what it did. The files are tracked in git so a run made on another computer can be committed, pushed, and evaluated here.

Run it from the project folder:

```bash
docker compose run --rm coach-tools python -m app.live_check
```

The command prints one line per situation (protocol, fallback use, seconds, tokens, cost), then the run's total cost and the file name. With a cloud model, every answer adds to the same spending total as the app and stops at the same `CLOUD_SPENDING_LIMIT`.

## File name and content

`{date}_{time}_{model}.json`, with the time in UTC. Characters such as `:` and `/` in the model name become `-`; the full name is inside the file. A second run in the same second gets `-2`, and no file is ever overwritten.

Each file holds `startedAt`, `provider`, `model`, `searchModel`, `totalCost` (dollars, `null` with Ollama) and one entry per situation:

| Field | Meaning |
|---|---|
| `situation`, `duration` | athlete profile from the made-up rides, and minutes available |
| `protocolId` | the protocol the Coach chose |
| `fellBack` | `true` when the fallback rules chose instead of the model |
| `truncated` | the answer stopped at the token limit |
| `jsonReadable` | the answer was readable as a JSON object |
| `papersFound` | the 4 papers the search model retrieved, with their score |
| `papersCited` | the papers the model said it used, as it wrote them |
| `inputTokens`, `outputTokens`, `cost`, `seconds` | `null` when the provider doesn't report them |
| `modelRaw` | the model's whole answer |

A failed situation has `error` and `message` instead, and the next situation still runs. The command exits with code 1 when all 3 fail, and with code 2, writing no file, when `.env` is wrong. The cloud key is never written here.
