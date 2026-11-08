# Evaluation runs

Each file here is one run of the Coach's evaluation set: the chat model chosen in `.env` picks today's workout in every made-up situation of `docker/coach/evaluation/situations.json` (no Strava, no browser), and the file records every answer. The files are tracked in git so a run made on another computer can be committed, pushed, and graded here.

## Running it

From the project folder, with BikeTR started (`docker compose up -d`) so Ollama is running:

```bash
docker compose run --rm coach-tools python -m app.evaluation
```

`--repeat 3` answers every situation 3 times, to see how much the model changes its mind on the same question; the default is 1. Each situation goes through the same paper search, chat model and protocol choice as a Coach request, starting from the athlete's numbers.

1. Set the model in `.env` (`OLLAMA_CHAT_MODEL=qwen2.5:3b`, for example) and run `docker compose up -d`.
2. Run the command and wait: it prints one line per answer as it finishes (`[3/27] situation (minutes): protocol · fallback · seconds · tokens · cost`), then the total cost and the file name.
3. Commit the new file in `eval-runs/` and push it.

With a cloud model, the command first prints the worst case: every answer at the high estimate (8,000 tokens read, 4,000 written). If that exceeds what is left under `CLOUD_SPENDING_LIMIT`, the run does not start; raise the limit or ask for fewer repeats. Every answer adds to the same spending total as the app.

## File name and content

`{date}_{time}_{model}.json`, with the time in UTC. Characters such as `:` and `/` in the model name become `-`; the full name is inside the file. A second run in the same second gets `-2`, and no file is ever overwritten by another run.

The file is rewritten after every answer, so a run stopped halfway (Ctrl+C, the computer sleeps, Ollama stops) keeps every finished answer. It holds:

| Field | Meaning |
|---|---|
| `kind` | always `evaluation`: tells these files apart from live check files |
| `startedAt`, `provider`, `model`, `searchModel` | when the run started and which models it used |
| `promptVersion` | 8 characters that change whenever the Coach's system prompt text changes |
| `repeat` | how many times each situation was asked |
| `complete` | `true` only when every answer arrived without an error; a run stopped halfway, or with a failed answer, stays `false` and is not used for a table row |
| `totalCost` | the dollars the run added to the spending total, the sum of every `charged`; `null` with Ollama |
| `answers` | one entry per answer, in the order they ran |

Each answer has the same fields as a live check situation (see `live-checks/README.md`), plus `repeat`, the repeat it belongs to: `situation`, `duration`, `protocolId`, `fellBack`, `truncated`, `jsonReadable`, `papersFound` (the papers the model was given), `papersCited`, `inputTokens`, `outputTokens`, `cost`, `charged`, `seconds` and `modelRaw` (the whole answer).

A failed answer has `error`, `message` and `charged` instead (`internal` for an unexpected error), and the next answer still runs. The command exits with code 1 when every answer fails, with code 2, writing no file, when `.env` or `--repeat` is wrong or the worst case exceeds the cap, and with code 130 after Ctrl+C. The cloud key is never written here.
