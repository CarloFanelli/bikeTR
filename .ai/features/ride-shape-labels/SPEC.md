---
feature: ride-shape-labels
version: 1.0
status: approved
completed: true
base: a4cadabc17e5970236377a0bf422bcd8c3562401
---

# Ride Shape Labels

## Overview

Ride labels read only a ride's averages, which cannot tell intervals from endurance: on the Check
set the Label rule scored 55%, missing 17 of 20 ripetute. The Coach already downloads each ride's
second-by-second data and throws it away after four numbers. This feature keeps a compact copy, finds
each ride's Hard blocks and their pattern, and gives that Ride shape to the Label rule and the Label
model, so a ride is labelled from how it was ridden. The user's relabelled Tuning set replaces the
old one; the Check set judges the result.

## Project Context

- Ride details keep np, watts_n, hr_mean, hr_n; the streams are discarded after download.
- A new FTP or LTHR must not require downloading again (existing Ride details decision).
- Background download already respects Strava's 100-requests-per-15-minutes budget.
- About 190 saved bike rides have power or heart rate; 13 have a power meter.
- Labeled rides are anonymized; the local record maps each to its Strava ride, outside git.
- Ride labels stay off by default; with labels off the Coach must not change.

## Functional Requirements

### Ride shape

- REQ-1: For every ride with power or heart rate, the Coach keeps a compact series of its power and heart rate.
- REQ-2: A Hard block is at least 1 minute above Z2: heart rate from 85% of LTHR, or measured power from 76% of FTP.
- REQ-3: A ride's Ride shape lists its Hard blocks (duration, zone) and recoveries, plus minutes per zone.
- REQ-4: A changed FTP or LTHR changes Ride shapes without downloading anything again.
- REQ-5: Rides saved before this feature get their series by downloading again in background, within Strava's budget.

### Labels

- REQ-6: The Label rule calls a ride ripetute when it has 2+ Hard blocks of similar length, each followed by a recovery.
- REQ-7: A single Hard block, or irregular blocks on a long ride, keep the ride fondo.
- REQ-8: The Label model receives each ride's Ride shape beside its averages.
- REQ-9: A ride without a series is labelled from its averages, as today.

### Labeled rides

- REQ-10: Every Labeled ride carries its Ride shape, still without Strava id, real date, route or real name.
- REQ-11: The Tuning set takes the user's labels given on 2026-11-19 without proposals; thresholds and pattern are tuned on it only.

## Data & Dependencies

### Information the feature must retain

- Compact power and heart-rate series per ride, kept across restarts, deleted with the ride.
- The Tuning set's and Check set's Ride shapes, in the repository, anonymized.

### External capabilities relied on

- Strava's ride streams, already used.

## Non-Functional Requirements

- **Performance** — the series of a 4-hour ride stays under 1,000 points per signal; labelling 40 rides adds no Strava call.
- **Security** — Labeled rides gain no field that identifies the real ride (no GPS, no timestamps).
- **Validation** — a Labeled ride without a label still stops the measurement naming it.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|---|---|---|
| Ride with power meter and heart rate | Blocks from power; heart rate only where power is missing | REQ-2 |
| Ride with only Strava-estimated power | Blocks from heart rate only | REQ-2 |
| Heart rate dropouts or zeros | Ignored, not counted as recovery | REQ-1, REQ-3 |
| Effort of 50 seconds | Not a Hard block | REQ-2 |
| Two blocks joined by a 20-second dip | One block | REQ-2, REQ-3 |
| No LTHR saved | Heart-rate blocks cannot be found: labelled from averages | REQ-2, REQ-9 |
| No FTP saved | Power blocks cannot be found: heart rate used | REQ-2 |
| FTP changed since the ride | Shape recomputed with today's FTP, no download | REQ-4 |
| Strava limit reached while downloading again | Stops and resumes in the next quarter hour, as today | REQ-5 |
| Ride deleted on Strava or download refused | Keeps its old Ride details; labelled from averages | REQ-5, REQ-9 |
| Downloading again while the user syncs | Shares the same budget; nothing downloaded twice | REQ-5 |
| Z2 ride with one Z3 activation | fondo | REQ-7 |
| 4-hour ride with five climbs of different lengths | fondo | REQ-7 |
| 2x20 at threshold, 3x10 in Z3 | ripetute | REQ-6 |
| Race flag set | gara, whatever the shape | REQ-6 |
| Label model ignores the shape and answers anyway | Measured as today: wrong labels count wrong | REQ-8 |
| Labeled ride whose Strava ride is no longer saved | Command stops naming it; no shape invented | REQ-10 |
| Tuning set ride without a label (r37) | Measurement stops naming it until labelled | REQ-11 |
| N/A — permission: single local user, no roles | — | REQ-1, REQ-10 |

## Out of Scope

- A fifth label for fondo with activations — the user keeps four types; rules treat both the same.
- Showing Hard blocks on Attività's ride chart — labels must pass the Check set first.
- Tuning on the Check set — it would stop measuring unseen rides.
- Turning Ride labels on by default — only after the Check set passes the bar.
