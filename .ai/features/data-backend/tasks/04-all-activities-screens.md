# Task 04: all-activities-screens

## Objective

Attività lists the athlete's whole history, 60 at a time, with search and filters over everything; Home's "Ultima uscita" finds the last bike ride anywhere in the history, while every other number keeps today's window.

## Context

**Satisfies**: REQ-14, REQ-15, REQ-16, REQ-17

The whole history is the visible gain of the feature. The power curve, records, level and charts keep their windows (user decision), so the values the athlete knows do not move.

## Depends on

03-app-reads-server

## Expected Behavior

- Attività shows the newest 60 activities and adds the next 60 when the list reaches its end.
- The name search and the sport filters look through every saved activity.
- Attività's subtitle no longer says "Le ultime 60".
- Home's "Ultima uscita" shows the most recent bike ride in the whole history.
- Analisi, Allenamento and Home's other cards show the same values as before for the same activities.

## Acceptance Criteria

- [ ] Attività shows 60 activities, and 60 more each time the list reaches its end, until all are shown (REQ-14)
- [ ] A search or filter finds a matching activity older than the 60 shown (REQ-15)
- [ ] With no bike ride among the latest 60, "Ultima uscita" shows the most recent older bike ride (REQ-16)
- [ ] Power curve, records, estimated level and charts show the same values as before for the same activities (REQ-17)

## Edge Cases

- Fewer than 60 activities → Attività shows them all, with no loading at the end (REQ-14)
- Search with no match across all activities → Attività shows its existing "nessuna attività" text (REQ-15)
- No bike ride in the whole history → "Ultima uscita" shows its existing empty text (REQ-16)

## Notes from implementation

- **Pages are whole weeks**: Attività shows the first weeks that hold at least 60 activities, then adds weeks until 60 more are shown, so a week split between two pages never shows partial totals. A page can hold a few more than 60.
- **Empty texts drop the count**: with the whole history the search and filter messages no longer say "tra le ultime N"; Home's empty last-ride text says "tra le tue N attività".
