# Task 02: fallback-warning

## Objective

When the Coach used the fallback rules, the workout card says why: the answer was cut off, unreadable, named no catalog protocol, or picked one too long for the minutes.

## Context

**Satisfies**: REQ-4, REQ-5, REQ-6

Today the card always blames invalid JSON. After Task 01 every case reaches the fallback rules, so the service can name one of four causes for each workout. The warning texts are fixed in the spec's warning table, word for word.

## Depends on

- Task 01

## Expected Behavior

- Every workout from the Coach service says which cause, if any, made it use the fallback rules.
- The card shows the warning for that cause, word for word as in the spec's warning table, and no warning when the model's choice was used.
- The too-long warning names the protocol as the catalog writes it, its minimum minutes and the minutes requested.
- When several causes could apply, a cut-off answer wins: it is never read for a protocol.
- The warning holds only text from the code (catalog names, numbers), never text the model wrote, and the card shows it as text.

## Acceptance Criteria

- [ ] An answer stopped at the token limit shows the cut-off warning (REQ-4, REQ-5)
- [ ] An answer that is not a JSON object shows the unreadable warning (REQ-4, REQ-5)
- [ ] A JSON object with no catalog `protocolId` shows the not-in-the-catalog warning (REQ-4, REQ-5)
- [ ] Over-Under with 45 minutes shows "Il modello ha scelto Over-Under, che richiede almeno 64 minuti: con 45 minuti…" (REQ-6)
- [ ] A workout that used the model's choice shows no warning (REQ-5)
- [ ] The old "JSON non valido" text no longer appears anywhere in the app (REQ-5)

## Edge Cases

- `protocolId` with different case or spaces (`Over_Under`, `" over_under"`) → not in the catalog (exact match, as today) (REQ-3, REQ-4 from the spec edge-case table)
- Answer cut off at the token limit, yet holding a complete JSON with a fitting protocol → cut-off warning (REQ-4)
- Empty answer → unreadable warning (REQ-4)
- The stream breaks before the end (model stopped, connection lost) → no workout and no warning: the existing error message (REQ-4)
- A new click or Stop aborts the old request before any card is drawn → a warning always belongs to the workout above it (REQ-4, N/A — concurrent)
- Valid JSON that is not an object (a list, a number, a string) → unreadable warning (REQ-5)
- JSON object with `protocolId` missing, empty or `null` → not-in-the-catalog warning (REQ-5)
- No accounts or roles → everyone sees the same warnings (REQ-5, N/A — permission)
- 30 minutes and the model picks Over-Under → "…Over-Under, che richiede almeno 64 minuti: con 30 minuti…" (REQ-6)
- Catalog names with special characters (Rønnestad 30/15, Tempo 2×20') → shown exactly as the catalog writes them (REQ-6)
- A workout from a Coach service started before the update carries no warning text → the card shows no warning (REQ-5 · from code)
