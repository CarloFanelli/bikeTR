---
feature: fallback-reason
version: 1.0
status: approved
completed: true
base: 6db4e5dac9f89ecdf1dd298600adb6db9c876c9b
---

# Fallback reason

## Overview

When the Coach cannot use the chat model's choice, it picks the workout itself and the workout card shows a warning. Today the warning always says the model returned invalid JSON, even when the answer was readable and the chosen protocol only did not fit the minutes. In that case the Coach also swaps in a Z2 ride that the athlete's selection rule may not allow. This feature makes the Coach use the fallback rules for a too-long protocol too, and makes the card name the real cause: cut off, unreadable, not in the catalog, or too long.

## Project Context

- The fallback rules already choose for cut-off, unreadable and not-in-the-catalog answers; only the too-long case changes behavior.
- The warnings are in Italian, like the rest of the app.
- The "fallback used" flag keeps its name and meaning in the workout, the live checks and the evaluation results; grading counts it as today.
- A protocol's minimum minutes come from the same code as the prompt's "Durata minima" line.
- The comparison with the old browser Coach keeps passing for every case except the too-long ones, whose expected result changes.
- No new dependencies.

## Functional Requirements

### Coach choice

- REQ-1: When the chat model picks a catalog protocol that does not fit the available minutes, the Coach gives the protocol the fallback rules choose.
- REQ-2: In that case the workout carries what an unreadable answer gets: the fallback rationale and, if it has one, the given protocol's supporting paper.
- REQ-3: A catalog protocol that fits the minutes is used as chosen, with no warning, even when the selection rules do not allow it.

### Warning

- REQ-4: The Coach service's workout names the cause that made it use the fallback rules: cut off, unreadable, not in the catalog, or too long.
- REQ-5: The workout card shows the warning for that cause, word for word as in the warning table.
- REQ-6: The too-long warning names the protocol as the catalog shows it, its minimum minutes and the minutes requested.

**Warning table**

| Cause | When | Warning on the card |
|---|---|---|
| Cut off | the answer stopped at the token limit | ⚠️ La risposta del modello si è interrotta prima della fine: il Coach ha scelto con le regole di selezione. |
| Unreadable | the answer is not a JSON object | ⚠️ La risposta del modello non era leggibile: il Coach ha scelto con le regole di selezione. |
| Not in the catalog | a JSON object whose `protocolId` is missing or not a catalog protocol | ⚠️ Il modello non ha indicato un protocollo del catalogo: il Coach ha scelto con le regole di selezione. |
| Too long | a catalog protocol that does not fit the minutes | ⚠️ Il modello ha scelto {protocollo}, che richiede almeno {minimo} minuti: con {minuti} minuti il Coach ha scelto con le regole di selezione. |

## Non-Functional Requirements

- **Security** — the warning contains only text from the code (catalog name, numbers), never text the model wrote, and the card shows it as text.

## Edge Cases & Error Handling

| Edge Case | Expected Behavior | Relates to |
|-----------|-------------------|------------|
| Minutes exactly at the protocol's minimum (Over-Under with 64) | fits: used as chosen, no warning | REQ-1, REQ-3 |
| One minute below the minimum (Over-Under with 63) | fallback rules choose, too-long warning | REQ-1 |
| Fallback rules for the athlete's minutes | always give a protocol that fits, from 30 to 240 minutes | REQ-1 |
| Results files already in `eval-runs/` and `live-checks/` | graded as before: grading reads the model's own choice, not the protocol given | REQ-1 |
| The fallback protocol has no supporting paper (Riposo, Recupero attivo Z1) | no cited paper, as for an unreadable answer today | REQ-2 |
| The model cited real papers or wrote a rationale for its too-long protocol | both are dropped: they explain a workout the athlete does not get | REQ-2 |
| The model picks a protocol that fits but its selection rule does not allow | used as chosen, no warning | REQ-3 |
| `protocolId` with different case or spaces (`Over_Under`, `" over_under"`) | not in the catalog (exact match, as today) | REQ-3, REQ-4 |
| Answer cut off at the token limit, yet holding a complete JSON with a fitting protocol | cause is cut off: a cut-off answer is never used | REQ-4 |
| Empty answer | unreadable | REQ-4 |
| The stream breaks before the end (model stopped, connection lost) | no workout and no warning: the existing error message | REQ-4 |
| N/A — concurrent: a new click or Stop aborts the old request before any card is drawn, so a warning always belongs to the workout above it | — | REQ-4 |
| Valid JSON that is not an object (a list, a number, a string) | unreadable | REQ-5 |
| JSON object with `protocolId` missing, empty or `null` | not in the catalog | REQ-5 |
| N/A — permission: no accounts or roles; everyone sees the same warnings | — | REQ-5 |
| 30 minutes and the model picks Over-Under | "…Over-Under, che richiede almeno 64 minuti: con 30 minuti…" | REQ-6 |
| Catalog names with special characters (Rønnestad 30/15, Tempo 2×20') | shown exactly as the catalog writes them | REQ-6 |

## Out of Scope

- **The cause in live-check and evaluation results files** — grading reads the model's own choice from the saved answer, and "fallback used" counts every cause alike; a count per cause would change two file formats for a need nobody has yet.
- **Checking that the model's protocol is allowed by the selection rules** — already a separate backlog item (the code works out the allowed protocols and the model chooses among them).
- **Showing the unknown protocol name the model wrote** — it is model text; the generic sentence is enough (decided in this interview).
