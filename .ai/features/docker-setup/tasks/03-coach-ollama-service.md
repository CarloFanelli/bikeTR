# Task 03: coach-ollama-service

## Objective

The start command also runs Ollama and downloads the chat and embedding models on first start, so the Coach tab generates a workout with no Ollama, CORS or address setup; a `.env` option switches to an Ollama installed on the host instead.

## Context

**Satisfies**: REQ-1, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-17

Builds on the start command from Task 02. The browser reaches Ollama through the app's own address, which removes the CORS setup. Browsers that saved the old default Coach address are moved to the new one. In-app help texts stop referring to macOS `launchctl`/`brew` and to the `node` rebuild script.

## Depends on

- Task 02

## Expected Behavior

- The start command also starts an Ollama service that is reachable only through the app address, never on its own host port.
- On first start, the chat model (default `qwen2.5:7b`) and the embedding model (`nomic-embed-text`) download automatically; later starts skip models already present.
- Downloaded models survive stop and restart; only the full-cleanup command removes them.
- Model names are settable in `.env`.
- With default settings, the Coach tab generates a workout without any Ollama, CORS or address configuration.
- A browser whose saved Coach address equals the old default `http://localhost:11434` uses the new default; any other saved address is kept.
- A `.env` option points the app to an Ollama on the host; then no Ollama container starts and no model is downloaded by Docker.
- The committed paper index is served unchanged; no command modifies it.
- Coach help and error texts mention the Docker setup and host-Ollama option; none mentions `launchctl`, `brew` or `node build_papers_index.mjs`.

## Acceptance Criteria

- [ ] On a clean machine, one start command downloads both models with no user action (REQ-1, REQ-6)
- [ ] A second start does not download models again (REQ-7)
- [ ] Changing a model name in `.env` downloads that model on next start (REQ-8)
- [ ] With defaults, the Coach tab returns a workout; no Ollama port is published on the host (REQ-9)
- [ ] On the user's WSL machine, one default-model generation completes within the 3-minute Coach timeout (REQ-9)
- [ ] With the host-Ollama option set, no Ollama container runs and the Coach uses the host Ollama (REQ-10)
- [ ] A saved Coach address of `http://localhost:11434` is replaced by the new default on load (REQ-11)

## Edge Cases

- No internet on first start → web app still starts; Coach shows its model-missing error; next start retries the download (REQ-6)
- Not enough disk space for the models (about 5 GB) → download fails with an error in the logs; web app works; Coach shows model-missing error (REQ-6)
- User opens the Coach tab before the first download finishes → Coach shows its model-missing error (REQ-6)
- Everything stopped in the middle of a model download → next start completes the missing model (REQ-7)
- A different model name set in `.env` → next start downloads only that model (REQ-7)
- Chat model changed in `.env` but not in the Coach settings panel → Coach requests the panel's model and shows the model-missing error (REQ-8)
- Model name in `.env` that does not exist in the registry → download fails with the error in logs; web app works; the other model still downloads (REQ-8)
- Ollama container not ready yet, or crashed → Coach shows its existing connection error; rest of the app works (REQ-9)
- Generation exceeds the 3-minute timeout on a slow CPU → Coach shows its existing timeout error (REQ-9)
- Two Coach generations started in quick succession → the first is cancelled, the second runs (REQ-9)
- Host mode selected but no Ollama running on the host → Coach shows its existing connection error; web app works (REQ-10)
- Host Ollama listens only on its own loopback → unreachable from the container; README documents the fix (REQ-10)
- Host mode, models not downloaded on the host → Coach shows its model-missing error (REQ-10)
- Browser saved a custom, non-default Coach address → kept and used unchanged (REQ-11)
- No saved Coach settings in the browser → new default address used (REQ-11)
- Paper index file missing or deleted → Coach error tells the user to restore the file from git (REQ-12)
- Full-cleanup command run → downloaded models removed; next start downloads about 5 GB again (REQ-5)
- Apple Silicon Mac → the Ollama image runs on ARM (REQ-14)
- Coach "CORS error?" help panel → replaced by guidance for the host-Ollama option (REQ-17)
- Coach error when the paper index is missing → no longer suggests `node build_papers_index.mjs` (REQ-17)
