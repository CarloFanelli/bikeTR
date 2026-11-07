# Task 04: impostazioni-model-check

## Objective

**Impostazioni** shows the **Chat model** the **Coach service** uses (provider and model, plus total spent and limit for a cloud model), and a connection check that spends no tokens replaces "Ping Ollama"; the model text field is gone.

## Context

**Satisfies**: REQ-8, REQ-9, REQ-26

With the model chosen in `.env` (Task 02), the browser can only show what the service uses. The total and the limit come from the spending record built in Task 03.

## Depends on

- Task 02
- Task 03

## Expected Behavior

- The Coach card in **Impostazioni** shows the provider and model read from the **Coach service**; the model text field is gone.
- With a cloud model, the card also shows the total spent and the limit.
- A connection check asks the **Coach service** whether the provider answers, accepts the key and has the model, spending no tokens.
- With Ollama, a missing chat model shows the command that downloads it, as today.
- A model name saved in the browser by an older version is ignored and never shown.

## Acceptance Criteria

- [ ] **Impostazioni** shows the provider and model the **Coach service** uses; the model text field is gone (REQ-8)
- [ ] The connection check reports whether the provider answers, accepts the key and has the model, sending no chat request (REQ-9)
- [ ] With Ollama, a missing chat model shows the command that downloads it (REQ-9)
- [ ] With a cloud model, the total spent and the limit show next to it; with Ollama, neither shows (REQ-26)
- [ ] A model name saved by an older version is ignored and not shown (REQ-8)

## Edge Cases

- **Coach service** unreachable when **Impostazioni** opens → the model line reads "Coach non raggiungibile" (REQ-8)
- Model name saved in the browser by an older version → ignored and not shown (REQ-8)
- Provider address unreachable → the check says the provider can't be reached at that address (REQ-9)
- Key rejected → the check says the provider rejected the key (REQ-9)
- Model not downloaded in Ollama → the check shows the command that downloads it, as today (REQ-9)
- Cloud provider doesn't list the model → the check warns the model isn't in the provider's list (REQ-9)
- Cloud provider chosen, key or address empty, or provider misspelled → the check fails naming the `.env` value; no call is made (REQ-1)
- Cloud provider chosen, a price or the limit missing or wrong → the check refuses, naming the value; no call is made (REQ-22)
- No cloud request made yet → the total shows "$0.00" (REQ-26)
- Provider is Ollama → no total or limit shown (REQ-26)
- Coach screen with a cloud provider → it names the provider and model the **Coach service** uses, and says no data leaves the computer only when the provider is Ollama (REQ-8 · from code)
