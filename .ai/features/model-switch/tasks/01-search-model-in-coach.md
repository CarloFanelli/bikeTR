# Task 01: search-model-in-coach

## Objective

The Coach finds its 4 papers with a **Search model** inside the **Coach service**, which works offline once installed; the paper index is re-encoded with it and rebuilds without Ollama, and Ollama downloads only the **Chat model**.

## Context

**Satisfies**: REQ-10, REQ-11, REQ-12, REQ-13, REQ-14

Today Ollama's `nomic-embed-text` encodes the search text, so even a cloud **Chat model** would still need Ollama. Moving the search first gives every later task one search path, the same for every chat model, so their papers compare.

## Depends on

None

## Expected Behavior

- Each Coach request encodes its search text with the **Search model** inside the **Coach service**; neither Ollama nor a cloud provider is asked to encode anything.
- The **Search model** is downloaded once, when the Coach service is installed; afterwards the search works with no internet connection.
- `papers_index.json` holds the same 10 papers, re-encoded with the **Search model**, and records that model's name.
- One command re-encodes the existing papers without PubMed; another rebuilds the paper list from PubMed. Both use the **Search model** and need no Ollama.
- Ollama's start-up download fetches only the chat model.

## Acceptance Criteria

- [ ] A Coach request finds its 4 papers without sending Ollama any encoding request (REQ-10)
- [ ] With the network cut, the **Search model** encodes a query in under 1 second; the image grows by at most 500 MB (REQ-11)
- [ ] `papers_index.json` keeps the same 10 PMIDs, titles and abstracts, with new embeddings and the **Search model**'s name (REQ-12)
- [ ] Re-encoding and the full rebuild both run with Ollama stopped (REQ-13)
- [ ] Ollama's start-up download no longer fetches `nomic-embed-text` (REQ-14)

## Edge Cases

- Index encoded by another search model → search refused with a message giving the rebuild command (REQ-10)
- Index with zero papers → search refused with today's restore message (REQ-10)
- Two requests search at once → both get their papers without loading the **Search model** twice (REQ-10)
- No internet during installation → the build stops with the download error; running it again retries (REQ-11)
- No internet later, provider Ollama → the whole Coach works (REQ-11)
- Re-encoding the index → same 10 papers, PMIDs, titles and abstracts; only embeddings and model name change (REQ-12)
- Abstract longer than the **Search model**'s input limit → encoded from its start; the rebuild prints how many were cut (REQ-12)
- PubMed unreachable during a full rebuild → the rebuild stops; the existing index is unchanged (REQ-13)
- Rebuild interrupted midway → the existing index is unchanged: the file is replaced only when complete (REQ-13)
- `nomic-embed-text` already downloaded → it stays in the Ollama volume; nothing deletes it (REQ-14)
