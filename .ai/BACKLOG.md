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

### B-8 · open
- **What**: Add minimal automated tests for the metric formulas (NP, TSS, CTL/ATL/TSB, FTP estimate) and for retrieval.
- **From**: docker-setup (interview, 2026-11-05)

### B-9 · open
- **What**: Escape Strava segment names in the segment-predictions error list, which today are inserted into the page as raw HTML.
- **From**: docker-setup (interview, 2026-11-05)

### B-10 · open
- **What**: Split the largest modules (training, analysis), break the circular imports between training, analysis, predictions and training v2, and remove duplicated helpers.
- **From**: docker-setup (interview, 2026-11-05)

### B-11 · open
- **What**: Store activities and settings on the server so data survives a browser change and only new activities are downloaded from Strava.
- **From**: docker-setup (interview, 2026-11-05)
