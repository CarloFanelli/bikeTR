# Live checks

Each file here is one run of the Coach's live check: the chat model chosen in `.env` picks today's workout in 3 made-up situations (no Strava, no browser), and the file records what it did. The files are tracked in git so a run made on another computer can be committed, pushed, and evaluated here.

Run it from the project folder:

```bash
docker compose run --rm coach-tools python -m app.live_check
```

The command prints one line per situation (protocol, fallback use, seconds, tokens, cost), then the run's total cost and the file name. When an answer has no cost of its own (no token counts, or an error) but added the high estimate to the spending total, its line ends with `addebitati` and that amount. With a cloud model, every answer adds to the same spending total as the app and stops at the same `CLOUD_SPENDING_LIMIT`.

## File name and content

`{date}_{time}_{model}.json`, with the time in UTC. Characters such as `:` and `/` in the model name become `-`; the full name is inside the file. A second run in the same second gets `-2`, and no file is ever overwritten.

Each file holds `startedAt`, `provider`, `model`, `searchModel`, `totalCost` (the dollars the run added to the spending total, the sum of every `charged`; `null` with Ollama) and one entry per situation:

| Field | Meaning |
|---|---|
| `situation`, `duration` | athlete profile from the made-up rides, and minutes available |
| `protocolId` | the protocol the Coach chose |
| `fellBack` | `true` when the fallback rules chose instead of the model |
| `truncated` | the answer stopped at the token limit |
| `jsonReadable` | the answer was readable as a JSON object |
| `papersFound` | the 4 papers the search model retrieved, with their score |
| `passagesFound` | the passages the model was given, 2 per paper, with their label and score; the label finds the text in `papers_index.json` |
| `papersCited` | the passage labels the model said it used (`passaggiUsati`), as it wrote them |
| `inputTokens`, `outputTokens`, `cost`, `seconds` | `null` when the provider doesn't report them |
| `charged` | dollars this situation added to the spending total: its cost, or the high estimate (8,000 tokens read, 4,000 written) when the provider gave no token counts or the answer broke off; `null` with Ollama |
| `modelRaw` | the model's whole answer, its last draft when the check sent earlier ones back |
| `drafts` | every draft, the first included: `protocolId` (`null` when unreadable), `modelRaw`, `truncated`, `inputTokens`, `outputTokens`, `cost`, and `check` with `ok`, the `causes` (`truncated`, `unreadable`, `not_in_catalog`, `too_long`, `not_allowed`, `invented`) and the `reasons` sent back to the model. `inputTokens`, `outputTokens` and `cost` above are the sums over the drafts |
| `fallbackCause` | why the fallback rules chose, the last draft's first cause; `null` when they did not |
| `citationsDropped` | the citations dropped from the card because the model was not given them, when the last draft was wrong only there |

A failed situation has `error`, `message` and `charged` instead (`internal` for an unexpected error), and the next situation still runs. The command exits with code 1 when all 3 fail, and with code 2, writing no file, when `.env` is wrong. The cloud key is never written here.
