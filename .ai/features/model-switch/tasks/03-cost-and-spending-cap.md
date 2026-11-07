# Task 03: cost-and-spending-cap

## Objective

Each cloud answer shows its cost on the Coach screen; the **Coach service** keeps a running total that survives restarts and refuses cloud requests once the **Spending cap** is reached; Ollama answers cost nothing.

## Context

**Satisfies**: REQ-22, REQ-23, REQ-24, REQ-25, REQ-27

Cloud models are billed per token, and spending must be visible and capped before the first real cloud call. The total lives in the Coach's data folder, which the **Live check** (Task 05) shares, so the cap holds for both.

## Depends on

- Task 02

## Expected Behavior

- With a cloud provider, `.env` holds the price per million input tokens, the price per million output tokens, and a spending limit in dollars.
- A cloud result shows its cost in dollars with 4 decimals, computed from its token counts and the `.env` prices.
- Each cloud answer's cost is added to a running total kept in the Coach's data folder. The total survives restarts and "Disconnetti da Strava".
- Once the total reaches the limit, a cloud request is refused before any call, with a message naming the total and the limit.
- An answer that ends without token counts (Stop, silence limit, dropped connection, or a provider that omits them) adds the ceiling cost: 8,000 input and 4,000 output tokens.
- Ollama answers show no cost, add nothing to the total and are never refused by the cap.

## Acceptance Criteria

- [ ] A cloud result shows its cost, for example "$0.0004", computed from its tokens and the `.env` prices (REQ-22, REQ-23)
- [ ] The total survives a Coach restart and "Disconnetti da Strava" (REQ-24)
- [ ] With the total at or above the limit, a cloud request is refused naming total and limit, and no call is made (REQ-25)
- [ ] An answer stopped or cut before its token counts arrive adds the ceiling cost to the total (REQ-25)
- [ ] Ollama answers show no cost, leave the total unchanged and are never refused (REQ-27)
- [ ] A missing, negative or non-numeric price or limit refuses every cloud request, naming the value (REQ-22)

## Edge Cases

- Cloud provider chosen, a price or the limit missing → every cloud request refuses, naming the missing value; no call is made (REQ-22)
- Price or limit negative or not a number → same refusal, naming the wrong value (REQ-22)
- Limit set to 0 → every cloud request is refused (REQ-22)
- Provider reports no token counts → cost shown as "—"; the total adds the ceiling: 8,000 input and 4,000 output tokens (REQ-23)
- Very small cost → shown in dollars with 4 decimals, for example "$0.0004" (REQ-23)
- Coach restarted, or "Disconnetti da Strava" → the total stays; only `docker compose down -v` erases it (REQ-24)
- **Live check** and the app spend at the same moment → both add to the same total; neither amount is lost (REQ-24)
- Total file unreadable → cloud requests are refused with a message; the total is never silently reset to zero (REQ-24)
- Request started under the limit ends above it → it finishes, and the next request is refused; the total passes the limit by at most one answer (REQ-25)
- Two requests start just under the limit → both may run; the total passes the limit by at most two answers (REQ-25)
- Stop, silence limit or dropped connection before the token counts arrive → the total adds the ceiling cost of one answer (REQ-25)
- Ollama chosen while `.env` still holds cloud prices → prices are ignored; no cost shown (REQ-27)
- Switch from cloud to Ollama and back → the total is kept, and continues when cloud is chosen again (REQ-27)
