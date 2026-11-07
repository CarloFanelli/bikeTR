# Task 02: chat-model-from-env

## Objective

`.env` picks the Coach's **Chat model** (an Ollama model, or a cloud model through an OpenAI-compatible endpoint); the browser stops sending a model, cloud answers stream like Ollama's, and the result shows local or cloud, model, seconds and tokens.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7

Until now the browser chose the model. Moving the choice to `.env` lets anyone pick any Ollama model or Claude, and keeps the key inside the **Coach service**. No real cloud call is made before cost tracking exists (Task 03): this task's cloud behavior is proven against a fake provider in the tests.

## Depends on

- Task 01

## Expected Behavior

- `.env` names the provider (Ollama or cloud) and the model, plus the endpoint address and key for cloud. With no provider set, the Coach uses Ollama with `OLLAMA_CHAT_MODEL`, or `qwen2.5:7b` when that is empty too.
- Every request uses the `.env` model; a model name sent by the browser is ignored.
- With a cloud provider, the Coach screen shows the text as it arrives. Stop, a new request, a closed tab or 3 minutes of silence closes the connection to the provider.
- Cloud requests send no temperature and allow 4,000 output tokens; Ollama requests keep temperature 0.2 and 1,000 tokens.
- The result line shows local or cloud, the model name, seconds, and input and output tokens.
- A wrong `.env` refuses the request with an Italian message naming the value, before any call.

## Acceptance Criteria

- [ ] With no provider in `.env`, requests use Ollama with `OLLAMA_CHAT_MODEL`, else `qwen2.5:7b` (REQ-2)
- [ ] A cloud provider receives the `.env` model and key, no temperature, and a 4,000-token limit; its text streams to the screen (REQ-1, REQ-4, REQ-6)
- [ ] The browser sends no model, and a model name sent by an old tab is ignored (REQ-3)
- [ ] Stop, a new request, a closed tab or 3 minutes of silence closes the cloud connection (REQ-5)
- [ ] The result shows local or cloud, model, seconds, and input and output tokens (REQ-7)
- [ ] A missing key or address, an unknown provider, or a model name over 100 characters refuses the request, with no call made (REQ-1)

## Edge Cases

- Cloud provider chosen, key or address empty → requests fail naming the missing `.env` value; no call is made (REQ-1)
- Provider value misspelled → requests fail with a message listing the two allowed values (REQ-1)
- Model name over 100 characters → refused with today's length message (REQ-1)
- No `.env` file at all → Ollama in Docker with `qwen2.5:7b` (REQ-2)
- Older `.env` with only `OLLAMA_CHAT_MODEL` set → that Ollama model is used; no new setting needed (REQ-2)
- Tab opened before the update still sends a model name → the service ignores it and uses the `.env` model (REQ-3)
- `.env` changed and the Coach restarted during a request → that request ends with "Connessione col Coach interrotta"; the next uses the new model (REQ-3)
- Cloud stream drops mid-answer → the text so far stays, followed by the model error, as with Ollama (REQ-4)
- Key rejected by the provider → error saying the key was rejected, with the provider's status; no switch to Ollama (REQ-4)
- Provider refuses for rate limit or missing credit → error saying so, with the provider's message (REQ-4)
- Provider ends the stream with no text → the backup rule picks the protocol, as for today's empty answer (REQ-4)
- Two tabs ask at once → two independent provider requests; stopping one leaves the other running (REQ-5)
- Provider silent for 3 minutes (long hidden reasoning) → the request ends with today's silence message (REQ-5)
- Answer reaches 4,000 tokens → treated as cut: the backup rule picks the protocol (REQ-6)
- Provider reports no token counts → tokens shown as "—" (REQ-7)
- Stop before the answer ends → no result line; the text so far is marked "Richiesta interrotta", as today (REQ-7)
- Coach screen line naming the model saved in the browser → removed, since that name no longer decides anything; Task 04 shows the **Coach service**'s model there (REQ-3 · from code)
