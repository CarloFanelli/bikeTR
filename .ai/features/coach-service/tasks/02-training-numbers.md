# Task 02: training-numbers

## Objective

The Coach service computes each ride's training load and your fitness, fatigue, form, intensity split and capacity tier exactly as the browser does, proven by tests that run with one command.

## Context

**Satisfies**: REQ-8, REQ-9, REQ-16, REQ-19

These numbers are the Coach's foundation and the riskiest part of the move: a formula ported from JavaScript to Python can drift silently. Building them alone, against made-up rides and the browser code's own results, isolates that risk before the downloads (Task 03) and the workout (Task 04) depend on them.

## Depends on

- Task 01

## Expected Behavior

- Given rides, **ride details** and an **athlete profile**, the service computes each ride's training load with today's rules: ride details when present, otherwise summary power, heart rate, Strava's suffer score or duration, weighted by activity type.
- From those loads it computes fitness, fatigue and form over 90 days, the intensity split of the last 28 days, the rides of the last 7 days and the capacity tier, as the browser does.
- Ride details hold only figures that don't depend on FTP or threshold heart rate, so a new FTP changes the training load without new data.
- One command documented in the README runs all tests, with no Ollama and no Strava connection.

## Acceptance Criteria

- [ ] On made-up rides, NP, TSS, fitness, fatigue, form, intensity split and capacity tier equal the browser code's values (REQ-16)
- [ ] The made-up rides cover power, heart rate only, neither, hikes with climbing, runs, and rides with and without details (REQ-16)
- [ ] The same ride details with a different FTP give the new TSS, matching the browser code at that FTP (REQ-9)
- [ ] Non-ride activities keep today's type weights and load rules (REQ-8)
- [ ] One README command runs the tests on Mac, Windows and WSL without Ollama or Strava (REQ-19)

## Edge Cases

- Non-ride activities (runs, hikes, gym) → today's type weights and rules (REQ-8 from the spec edge-case table)
- Threshold heart rate empty → heart-rate-based load skipped, as today (REQ-9)
- No activities at all → fitness, fatigue and form are 0 (REQ-6)
- Python and JavaScript differ only in the last decimals → compared after the rounding the app displays (REQ-16)
- Docker not running when the tests are launched → the command fails with Docker's own message (REQ-19)
- Tests launched while BikeTR is running → they run alongside without touching its saved rides or Strava connection (REQ-19)
- Browser and service in different time zones → each ride's day and "today" follow the browser's time zone, sent with the request, so a ride at 23:30 counts on the same day as in the Training tab (REQ-16 · from code)
