# Task 01: model-search-mode

## Objective

With the Search mode set to model in `.env`, the Coach's Drafts start without papers and the Chat model, on Ollama, searches the papers itself up to 3 times per Draft; fixed mode stays exactly as today.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-13

The core of the feature: the setting, the model-mode prompt, the Model search loop inside a Draft and the Check over the passages it found. Ollama comes first because it is the default Chat model and costs nothing; the cloud provider, with its cost, follows in Task 02.

## Depends on

None

## Expected Behavior

- A `.env` setting reads fixed or model, trimmed and case-insensitive; missing or empty is fixed.
- Any other value makes every Coach request fail with a message naming the setting and both values; the service still starts.
- In fixed mode, prompt, search text, papers and result are those of today.
- In model mode the prompt has no papers section, keeps athlete numbers, recent rides, Selection rules and allowed protocols, and offers one paper-search tool taking a search text.
- Each Model search returns what the fixed search returns for that text; search texts are trimmed and cut to 300 characters.
- A Draft gets at most 3 Model searches; further asks are answered "limit reached, answer now".
- A Draft sent back keeps the earlier conversation, searches included; the Check accepts citations of any passage returned in the request.
- The mode applies to the Coach screen, the Live check and the Evaluation set; a request keeps the mode it started with.

## Acceptance Criteria

- [ ] Fixed mode, and a missing or empty setting, give today's prompt and result byte for byte (REQ-1, REQ-4)
- [ ] An unknown value fails every Coach request with a message naming the setting and "fixed" / "model" (REQ-2)
- [ ] In model mode the first Draft's prompt has no papers and the request offers the paper-search tool (REQ-5, REQ-8)
- [ ] A Model search returns the fixed search's papers and passages for the same text (REQ-6)
- [ ] The 4th search ask in a Draft gets "limit reached" and runs no search (REQ-7)
- [ ] A retry Draft can cite passages found in an earlier Draft; the Check accepts them (REQ-9, REQ-10)
- [ ] An Ollama model without tool support stops the request with a message naming the model and the fixed-mode setting (REQ-13)

## Edge Cases

- Setting "Model " → model mode (REQ-1)
- Setting empty → fixed mode (REQ-1)
- Setting "tools" → every Coach request fails with the message; the service still starts (REQ-2)
- Mode changed in `.env` mid-run → the running request keeps its mode; the change applies after a restart (REQ-3)
- Fixed mode with an unreadable index → today's error (REQ-4)
- The model answers without searching → accepted if it cites nothing; a citation fails the Check as outside the passages given (REQ-5)
- Unknown tool or broken arguments → answered "unknown tool" or "bad search", counted toward the 3 (REQ-5)
- Empty search text → "empty search", counted toward the 3 (REQ-5)
- Search finds no paper → "no papers found", counted (REQ-6)
- Index unreadable during a Model search → the request stops with today's index error (REQ-6)
- Two searches asked in one turn → both run in order and count; a 4th gets "limit reached" (REQ-7)
- Exactly the 3rd search → runs normally (REQ-7)
- Still asking after "limit reached" → "limit reached" again; after 3 refusals in a row the Draft ends as unusable and the Check sends it back (REQ-7)
- No recent rides → the prompt says no bike activity in the last 7 days (REQ-8)
- Third Draft rejected → Fallback rules, as today (REQ-9)
- A retry Draft searches again → it gets its own 3 searches; earlier passages stay citable (REQ-9)
- Citation of a passage of a found paper that was not returned → rejected as outside the passages given (REQ-10)
- Same paper returned by two searches → one paper, its passages merged (REQ-10)
