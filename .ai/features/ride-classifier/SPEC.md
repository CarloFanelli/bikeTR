---
feature: ride-classifier
version: 1.0
status: approved
completed: true
base: 9750ee8ef73612df2f51a9416e80ec0a05846def
---

# Ride Classifier and Model Routing

## Overview

The Coach's prompt lists the week's rides with their numbers but not what kind of ride each was. This feature labels each recent ride as recovery, endurance, intervals or race, and writes the label into the prompt. A small Label model does the labelling, on any provider, while the Chat model keeps writing the plan; a Label rule based on intensity labels rides when the Label model is missing or fails, and serves as the baseline. A set of anonymized Labeled rides measures Label model against Label rule, and the Evaluation set measures whether labels improve answers and what each model costs.

## Project Context

- Labels only add information to the prompt: Selection rules, Check and Fallback rules stay unchanged.
- The classifier reads only data already saved: Strava summary, ride name, race flag, normalized power, and the athlete's FTP and LTHR.
- The repository is public and Strava data may not be published: Labeled rides are anonymized derivatives of the athlete's rides.
- Both providers (Ollama and OpenAI-compatible cloud) must work for the Label model, independently of the Chat model's provider.
- The Spending cap covers Label model and Chat model costs together.
- Development and automated tests use fake models only; real runs are started by the user.

## Functional Requirements

### Settings

- REQ-1: A `.env` setting chooses Ride labels: off, rule or model; missing or empty means off.
- REQ-2: With Ride labels off, the prompt and the result match today's Coach for the same request.
- REQ-3: `.env` names the Label model with its own provider, model and, for cloud, prices, separate from the Chat model.
- REQ-4: An unknown Ride labels value, or an incomplete Label model setting, fails every Coach request naming the setting.

### Labelling

- REQ-5: Each ride in the prompt carries one Ride label: recupero, fondo, ripetute or gara.
- REQ-6: In model mode, rides without a saved label are labelled by the Label model in one call per request.
- REQ-7: A label from the Label model is saved with that ride and the Label model's name, and reused on later requests.
- REQ-8: A saved label made by another Label model than the current one is not reused; the ride is labelled again.
- REQ-9: The Label rule labels: race flag → gara; intensity ≥ 0.85 of FTP (or LTHR without power) → ripetute; < 0.65 and ≤ 75 min → recupero; otherwise fondo.
- REQ-10: When the Label model is missing, unreachable or answers an unknown label, those rides get the Label rule's label, unsaved, and the request continues.
- REQ-11: With a cloud Label model, each call is charged to the spending total, and none starts once the Spending cap is reached.

### Labeled rides and measurement

- REQ-12: A command writes about 40 Labeled rides from the athlete's saved rides into a draft file kept out of git.
- REQ-13: Each drafted ride has an invented date, numbers changed by a few percent, a rewritten name, and no id or route.
- REQ-14: Each drafted ride carries a proposed label; the user corrects it before the file enters the repository.
- REQ-15: A command runs Label rule and Label model on the Labeled rides and prints accuracy overall and per label, seconds and cost.
- REQ-16: That command writes a results file into the repository; the README gets one row per run, like the Evaluation set's.
- REQ-17: Evaluation set situations' rides carry the fields the classifier reads: name, race flag, normalized power, maximum power and heart rate.
- REQ-18: The Evaluation set, Live check and Coach screen use the Ride labels setting; results files record it and each ride's label and source.
- REQ-19: Grading reports average cost and seconds per answer split between Label model and Chat model.

### Visibility

- REQ-20: Each Trace has a labelling step with the Label model, tokens, cost, and each ride's label and source (saved, model, rule).
- REQ-21: The README Coach section describes Ride labels, the Label model setting, the Label rule and both measurements.

## Data & Dependencies

### Information the feature must retain

- Ride label — per saved ride: label and the Label model that made it; created on first labelling, replaced when another Label model labels it, deleted with the ride (Disconnect).
- Labeled rides — anonymized rides with the correct label, in the repository; changed only by hand.
- Draft Labeled rides — the command's output before review; local, out of git, overwritten on each run.

### External capabilities relied on

- A second model endpoint (Ollama or OpenAI-compatible) — labels rides apart from the Chat model.

## Non-Functional Requirements

- **Performance** — labelling adds at most one Label model call per Coach request; with every label saved it adds no call.
- **Security** — the Label model's cloud key stays in the Coach service, never in the browser or a Trace; Labeled rides contain no Strava id, route, real date or real name.
- **Validation** — the Label model's answer is accepted only as one of the four labels per ride; anything else falls back to the Label rule for that ride.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|---|---|---|
| Setting value with different case or spaces ("Model ") | Read as the trimmed lower-case value | REQ-1 |
| N/A — concurrent: the setting is read at each request start, no shared state | — | REQ-1 |
| Ride labels off but a Label model named | Label model never called, no labelling step | REQ-2 |
| No rides in the last 7 days | No labelling call; prompt keeps "Nessuna attività bici negli ultimi 7 giorni." | REQ-2, REQ-6 |
| Label model provider is Ollama while Chat model is cloud and Ollama is off | Label rule labels, request continues, Trace says rule | REQ-3, REQ-10 |
| Label model cloud key missing with cloud provider | Request fails naming the missing Label model setting | REQ-4 |
| Ride labels = model but no Label model named | Request fails naming the Label model setting | REQ-4 |
| Ride with neither power nor heart rate | Label rule: race flag → gara, else fondo; Label model still asked | REQ-5, REQ-9 |
| All 10 rides already labelled by the current Label model | No call; saved labels used | REQ-6, REQ-7 |
| Two requests at once label the same new ride | Both may call; the last save wins; both prompts get a valid label | REQ-7 |
| Label model answers for only some rides | Missing ones get the Label rule's label, unsaved | REQ-6, REQ-10 |
| Label model answers an id that is not one of the rides | Ignored | REQ-10 |
| Label model answer cut off or not JSON | All rides of that call get the Label rule's label | REQ-10 |
| Label model changed in `.env` | Saved labels from the old model ignored; rides relabelled and saved again | REQ-8 |
| FTP changes after a ride was labelled | Saved label kept (labels describe the ride as it was judged) | REQ-7 |
| "Disconnetti da Strava" | Ride labels deleted with the rides | REQ-7 |
| Intensity exactly 0.85 or 0.65, duration exactly 75 min | ≥ 0.85 → ripetute; 0.65 → fondo; 75 min at < 0.65 → recupero | REQ-9 |
| No FTP and no LTHR | Label rule: race flag → gara, else fondo | REQ-9 |
| Stop during the labelling call | Accepted cloud call charged; no label saved; request ends stopped | REQ-11 |
| Spending cap reached before labelling | No Label model call; Label rule labels; then the Chat model's cap behavior as today | REQ-11 |
| Fewer than 40 saved rides | Command writes as many as there are and says how many | REQ-12 |
| No saved rides (not connected to Strava) | Command stops with a message saying to connect and sync first | REQ-12 |
| Ride name with a place or a person ("Giro del lago con Marco") | Rewritten without them ("Giro lungo") | REQ-13 |
| Draft file already exists | Overwritten, the command says so | REQ-12 |
| Labeled rides file missing or with an unknown label | Measurement command stops naming the file and the bad ride | REQ-15 |
| Label model unreachable during the measurement | Command stops with the provider message; no results file written | REQ-15 |
| Cloud Label model measurement | Worst-case cost printed before the run; refused past the Spending cap | REQ-15 |
| Results file from before this feature graded | Read as Ride labels off, no split cost | REQ-18, REQ-19 |
| N/A — permission: single local user, no roles | — | REQ-12, REQ-15 |
| Ollama Chat model, Ollama Label model | Costs shown as unknown, seconds still split | REQ-19 |
| Phoenix down | Coach answers as usual; traces lost as today | REQ-20 |

## Out of Scope

- Ride labels changing Selection rules — every new rule needs a source; labels are measured first.
- Labels shown in Attività or other screens — this spec touches only the Coach service; a badge comes after the labels prove reliable.
- Labelling the whole history in the background — thousands of calls for rides the prompt never shows.
- Minutes per power or heart-rate zone — needs downloading and storing second-by-second data again.
- Load history in Evaluation set situations (rest of B-47) — only the future Chat model tools need it.
- A command that reads averages from Phoenix — results files and grading already give repeatable averages.
