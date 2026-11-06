# Backlog

### B-1 · open
- **What**: Build RAG over sports-science PDFs: ingestion, chunking, embeddings, a local vector store (Chroma, LanceDB or sqlite-vec), and retrieval citing paper and passage in every recommendation.
- **From**: docker-setup (interview, 2026-11-05)

### B-2 · open
- **What**: Model coaching as a LangGraph graph: Strava fetch, metrics, evidence retrieval, draft plan, constraint check (load ramp, recovery) looping back on failure, delivery, with at least one conditional branch.
- **From**: docker-setup (interview, 2026-11-05)

### B-3 · open
- **What**: Expose Strava, the metrics calculator and the retriever as tools the model calls.
- **From**: docker-setup (interview, 2026-11-05)

### B-4 · open
- **What**: Classify rides as recovery, endurance, intervals or race with a small model, used as input to the graph.
- **From**: docker-setup (interview, 2026-11-05)

### B-5 · open
- **What**: Trace every run with Langfuse: prompt, tools called, latency, tokens and cost.
- **From**: docker-setup (interview, 2026-11-05)

### B-6 · open
- **What**: Create 20–30 questions with expected answer and papers to cite, plus a script measuring correctness and groundedness, with a before/after results table in the README.
- **From**: docker-setup (interview, 2026-11-05)

### B-7 · open
- **What**: Rewrite the README with the graph diagram, evaluation table with latency and cost, a decisions section (chunk size, model choice, what was tried and discarded) and run instructions; fix the feature list that mentions a Training v2 tab the UI lacks.
- **From**: docker-setup (interview, 2026-11-05)

### B-8 · picked-up
- **What**: Add minimal automated tests for the metric formulas (NP, TSS, CTL/ATL/TSB, FTP estimate) and for retrieval.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: coach-service (2026-11-06)

### B-9 · picked-up
- **What**: Escape Strava segment names in the segment-predictions error list, which today are inserted into the page as raw HTML.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-10 · picked-up
- **What**: Split the largest modules (training, analysis), break the circular imports between training, analysis, predictions and training v2, and remove duplicated helpers.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-11 · open
- **What**: Store activities and settings on the server so data survives a browser change and only new activities are downloaded from Strava.
- **From**: docker-setup (interview, 2026-11-05)

### B-12 · picked-up
- **What**: The Coach shows the model's answer while it is being written instead of waiting in silence for the whole reply, so a slow computer shows progress and a long answer does not hit the time limit only because it arrives at the end.
- **From**: docker-setup (dev task 03, 2026-11-05)
- **Picked up by**: coach-service (2026-11-06)

### B-13 · picked-up
- **What**: When the Coach gives up on a request (time limit, or a new request), Ollama also stops computing that answer instead of keeping the processor busy for several minutes.
- **From**: docker-setup (dev task 03, 2026-11-05)
- **Picked up by**: coach-service (2026-11-06)

### B-14 · picked-up
- **What**: Buttons used long after the page loaded ("Refresh with streams", completing segments from activity details) ask for a fresh Strava access token each time, so a tab left open for more than 6 hours keeps working without a reload.
- **From**: docker-setup (dev task 04, 2026-11-05)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-15 · picked-up
- **What**: The README's feature list and the app's top navigation agree: the README describes a "🧪 Training v2" tab that the navigation does not show.
- **From**: docker-setup (dev task 05, 2026-11-05)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-16 · open
- **What**: The other tabs read fitness, fatigue, form and training load from the Coach service, so the formulas live in one place.
- **From**: coach-service (interview, 2026-11-06)

### B-17 · picked-up
- **What**: The Coach tab gets a Stop button that ends the current request and stops Ollama.
- **From**: coach-service (interview, 2026-11-06)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-18 · picked-up
- **What**: Add automated tests for the Coach tab's browser code: reading the streamed answer (lines and characters split between network chunks) and cancelling an older request when the user asks again (no late events drawn). Both were checked only by hand in Node during coach-service.
- **From**: coach-service (dev task 05, 2026-11-06)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-19 · open
- **What**: Light and dark themes: follows the computer's setting by default, with a switch that is remembered.
- **From**: vue-ts-restructure (interview, 2026-11-06)

### B-20 · open
- **What**: Build optimized files for the browser app and serve them with nginx, for a possible cloud deployment (the optional Cloud Run step of the roadmap).
- **From**: vue-ts-restructure (interview, 2026-11-06)

### B-21 · open
- **What**: Save the mesocycle week when the Training tab opens. Today it is saved only on the first opening and at the end of a block, so the plan and its banner always treat the current week as week 1 of the block.
- **From**: vue-ts-restructure (dev task 05, 2026-11-06)

### B-22 · open
- **What**: Stop the daily recommendation from crashing when the FTP history is on a plateau and the power profile shows no deficit. Today it reads a label that does not exist, and the Training tab stops drawing.
- **From**: vue-ts-restructure (dev task 05, 2026-11-06)

### B-23 · open
- **What**: Remove or make reachable the "no ride history: start with pure aerobic work" advice. With no bike rides, the "Reactivation" advice always wins first, so this branch never runs.
- **From**: vue-ts-restructure (dev task 05, 2026-11-06)
