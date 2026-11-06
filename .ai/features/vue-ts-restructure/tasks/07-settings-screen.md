# Task 07: settings-screen

## Objective

In the new app, **Impostazioni** holds every setting that today sits in the Training tab, the Coach model with "Ping Ollama" and the instructions for using the computer's own Ollama, and Strava disconnect.

## Context

**Satisfies**: REQ-11, REQ-12, REQ-17, REQ-25

Settings come before the other screens because every screen reads them. They are saved with today's names and formats, so today's app and the new one see the same values while both exist.

## Depends on

- Task 04
- Task 06

## Expected Behavior

- Impostazioni shows and saves the heart-rate, FTP and source choices, weekly hours and days, long rides, weight, strength level, long-ride limit, race, and recovery tools, with today's limits and defaults.
- The estimated FTP and threshold heart rate show read-only, with today's values.
- The Coach model is set here, "Ping Ollama" reports as today, and the host-Ollama instructions sit beside them.
- "Disconnetti da Strava" ends the connection and shows the "Collega Strava" screen.
- Leaving Impostazioni with unsaved changes asks for confirmation.

## Acceptance Criteria

- [ ] Impostazioni shows and saves every setting today's Training tab has, and today's app reads the saved values (REQ-17, REQ-25)
- [ ] The estimated FTP and threshold heart rate show today's values, read-only (REQ-11)
- [ ] The Coach model is saved there and "Ping Ollama" reports as today (REQ-17)
- [ ] Values outside today's limits are refused, naming the field (REQ-17)
- [ ] Disconnect from Strava ends the connection and shows the "Collega Strava" screen (REQ-12)

## Edge Cases

- A value outside today's limits → refused as today, naming the field (REQ-17 from the spec edge-case table)
- Today the limits are only hints on the fields and "Salva impostazioni" saves any value → the new screen refuses out-of-range values, naming the field (REQ-17 · from code)
- Fields left empty → today's defaults and estimates (REQ-17)
- Leaving Impostazioni with unsaved changes → "Modifiche non salvate: uscire comunque?"; staying keeps them (REQ-17)
- Settings saved in another tab → picked up at the next reload, as today (REQ-17)
- The instructions for using the Ollama installed on the computer → move with the Coach model to Impostazioni (REQ-17)
- Disconnect from Impostazioni → returns to the "Collega Strava" screen (REQ-13)
