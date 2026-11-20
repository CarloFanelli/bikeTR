# Label runs

Each file here is one measurement of the ride labels: the Label rule and the Label model chosen in `.env` give a Ride label (recupero, fondo, ripetute or gara) to every ride of one set of Labeled rides, and the file records the set, every ride's correct label, the rule's and the model's.

There are two sets. The **Tuning set** (`docker/coach/evaluation/labeled_rides.json`) is where the rule's thresholds and the model's prompt are adjusted: its score shows progress, never reliability. The **Check set** (`docker/coach/evaluation/labeled_rides_check.json`) holds about 40 other rides, labelled by hand and never used to adjust anything: only its score says whether Ride labels are **reliable**, which takes at least 80% right overall and at least half right of each label present in the set. Turn Ride labels on in the Coach (`COACH_RIDE_LABELS`) only once the Check set says so. The rides are made-up copies of real ones: invented dates, numbers moved by a few percent, names reduced to training words.

## Running it

From the project folder, with BikeTR started (`docker compose up -d`), and `LABEL_MODEL` set in `.env` (for example `LABEL_MODEL=qwen2.5:3b`):

```bash
docker compose run --rm coach-tools python -m app.label_check              # Tuning set
docker compose run --rm coach-tools python -m app.label_check --set check  # Check set
```

The model gets the rides in groups of 10, about as many as a Coach request labels. The command prints the accuracy of the rule and of the model, overall and per label (right out of how many rides carry that label), the model's seconds and its cost, on the Check set whether the rule's and the model's labels are reliable, then the row for the table below and the file name. Commit the new file in `label-runs/` and add its row.

With a cloud Label model (`LABEL_PROVIDER=cloud`), the command first prints the worst case: every group at the high estimate. If that exceeds what is left under `CLOUD_SPENDING_LIMIT`, the measurement does not start. It stops with code 2, writing no file, when the labeled rides file is missing or holds a label that is not one of the four, and with code 1 when the model cannot be reached.

## Preparing the labeled rides

```bash
docker compose run --rm coach-tools python -m app.labeled_rides              # Tuning set
docker compose run --rm coach-tools python -m app.labeled_rides --set check  # Check set
```

It copies about 40 of your saved bike rides, anonymized, into `labeled-rides-draft.json` (or `labeled-rides-check-draft.json`) at the project root, which git ignores, with an empty `label` on every ride. Write the right label on each ride yourself, with no proposal from the rule or a model, check that no name says a place or a person, then move the file to `docker/coach/evaluation/labeled_rides.json` (or `labeled_rides_check.json`).

The Check set never repeats a Tuning set ride. Which saved rides went into each set is kept in `labeled-rides-sources.json` at the project root, which git ignores because it holds Strava ids. When that file has no Tuning set yet, the command finds its rides again among today's picks, one by one, and stops if any of them no longer matches, rather than risk a repeat.

## Results

Rule and model are the share of rides labeled right; seconds and cost are the model's (— with Ollama, which costs nothing).

| File | Set | Label model | Rule | Model | Seconds | Cost |
|------|-----|-------------|------|-------|---------|------|
| [2026-11-19_13-29-57_qwen2.5-3b.json](2026-11-19_13-29-57_qwen2.5-3b.json) | tuning | qwen2.5:3b | 23% (9/40) | 33% (13/40) | 15.4 | — |
| [2026-11-20_14-02-30_qwen2.5-3b_tuning.json](2026-11-20_14-02-30_qwen2.5-3b_tuning.json) | tuning (labels of 2026-11-19, ride shape) | qwen2.5:3b | 59% (23/39) | 33% (13/39) | 30.1 | — |
| [2026-11-20_14-03-10_qwen2.5-7b_tuning.json](2026-11-20_14-03-10_qwen2.5-7b_tuning.json) | tuning (labels of 2026-11-19, ride shape) | qwen2.5:7b | 59% (23/39) | 46% (18/39) | 68.5 | — |
| [2026-11-20_14-13-38_qwen2.5-3b_tuning.json](2026-11-20_14-13-38_qwen2.5-3b_tuning.json) | tuning (load per hour) | qwen2.5:3b | 79% (31/39) | 18% (7/39) | 28.7 | — |
| [2026-11-20_14-12-52_qwen2.5-3b_check.json](2026-11-20_14-12-52_qwen2.5-3b_check.json) | check (load per hour) | qwen2.5:3b | 70% (28/40) | 28% (11/40) | 33.2 | — |

First run, on a Mac with Ollama. Neither labels well. The rule calls 26 of the 30 `fondo` rides `ripetute`: without a power meter it reads Strava's estimated power or heart rate against threshold, and an endurance ride averages 0.85 to 0.95 of threshold heart rate, above the 0.85 cut-off that suits power. The model gets every `recupero` right but calls 17 other rides `recupero`, no `ripetute` right, and leaves 7 rides without a label.

From the next run on, the Label rule reads power only from a power meter and judges other rides by heart rate, with thresholds of its own, and the Label model receives each ride's share of FTP and of threshold heart rate already computed. The rule alone, scored on the Tuning set with that code, gives 95% (38/40).

Ride shape runs (2026-11-20). Every Labeled ride now carries its compact series, and the Tuning set holds the labels of 2026-11-19 (39 rides: the 6-minute one was dropped). Hard blocks repeated with recoveries, the pattern first planned, gave the rule 59% on the Tuning set: most rides labeled `ripetute` are long stretches in Z4 rather than separate blocks. The rule now calls a ride `ripetute` from its load per hour on heart rate (hrTSS per hour, 100 for an hour at threshold) from 87.5 up, tuned on the Tuning set only; a long Z2 ride with a couple of hard blocks inside stays `fondo`, as the athlete labels it. Measured once on the Check set: 70%, not reliable (the bar is 80%), up from 55%. Neither local model reaches the rule, with the ride shape in its message or without.
