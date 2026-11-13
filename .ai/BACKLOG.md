# Backlog

### B-1 · picked-up
- **What**: Build RAG over sports-science PDFs: ingestion, chunking, embeddings, a local vector store (Chroma, LanceDB or sqlite-vec), and retrieval citing paper and passage in every recommendation.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: passage-search (2026-11-09)

### B-2 · picked-up
- **What**: Model coaching as a LangGraph graph: Strava fetch, metrics, evidence retrieval, draft plan, constraint check (load ramp, recovery) looping back on failure, delivery, with at least one conditional branch.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: coach-graph (2026-11-10)

### B-3 · open
- **What**: Expose Strava, the metrics calculator and the retriever as tools the model calls.
- **From**: docker-setup (interview, 2026-11-05)

### B-4 · open
- **What**: Classify rides as recovery, endurance, intervals or race with a small model, used as input to the graph.
- **From**: docker-setup (interview, 2026-11-05)

### B-5 · picked-up
- **What**: Trace every run with Langfuse: prompt, tools called, latency, tokens and cost.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: tracing (2026-11-08)

### B-6 · picked-up
- **What**: Create 20–30 questions with expected answer and papers to cite, plus a script measuring correctness and groundedness, with a before/after results table in the README.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: eval-set (2026-11-07)

### B-7 · picked-up
- **What**: Rewrite the README with the graph diagram, evaluation table with latency and cost, a decisions section (chunk size, model choice, what was tried and discarded) and run instructions; fix the feature list that mentions a Training v2 tab the UI lacks.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: eval-set (2026-11-07)

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

### B-11 · picked-up
- **What**: Store activities and settings on the server so data survives a browser change and only new activities are downloaded from Strava.
- **From**: docker-setup (interview, 2026-11-05)
- **Picked up by**: data-backend (2026-11-13)

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

### B-16 · picked-up
- **What**: The other tabs read fitness, fatigue, form and training load from the Coach service, so the formulas live in one place.
- **From**: coach-service (interview, 2026-11-06)
- **Picked up by**: data-backend (2026-11-13)

### B-17 · picked-up
- **What**: The Coach tab gets a Stop button that ends the current request and stops Ollama.
- **From**: coach-service (interview, 2026-11-06)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-18 · picked-up
- **What**: Add automated tests for the Coach tab's browser code: reading the streamed answer (lines and characters split between network chunks) and cancelling an older request when the user asks again (no late events drawn). Both were checked only by hand in Node during coach-service.
- **From**: coach-service (dev task 05, 2026-11-06)
- **Picked up by**: vue-ts-restructure (2026-11-06)

### B-19 · picked-up
- **What**: Light and dark themes: follows the computer's setting by default, with a switch that is remembered.
- **From**: vue-ts-restructure (interview, 2026-11-06)
- **Picked up by**: ui-redesign (2026-11-10)

### B-20 · open
- **What**: Build optimized files for the browser app and serve them with nginx, for a possible cloud deployment (the optional Cloud Run step of the roadmap).
- **From**: vue-ts-restructure (interview, 2026-11-06)

### B-21 · picked-up
- **What**: Save the mesocycle week when the Training tab opens. Today it is saved only on the first opening and at the end of a block, so the plan and its banner always treat the current week as week 1 of the block.
- **From**: vue-ts-restructure (dev task 05, 2026-11-06)
- **Picked up by**: data-backend (2026-11-13)

### B-22 · open
- **What**: Stop the daily recommendation from crashing when the FTP history is on a plateau and the power profile shows no deficit. Today it reads a label that does not exist, and the Training tab stops drawing.
- **From**: vue-ts-restructure (dev task 05, 2026-11-06)

### B-23 · open
- **What**: Remove or make reachable the "no ride history: start with pure aerobic work" advice. With no bike rides, the "Reactivation" advice always wins first, so this branch never runs.
- **From**: vue-ts-restructure (dev task 05, 2026-11-06)

### B-24 · open
- **What**: The Coach can use two chat models at the same time, a small cheap one for simple jobs and a bigger one for writing the plan, which needs .env to name more than one model (model routing).
- **From**: model-switch (interview, 2026-11-07)

### B-25 · picked-up
- **What**: A paper library screen in the app: see and open the papers the Coach searches, upload new ones and remove old ones. Each uploaded paper is indexed into the RAG search. The cost of adding a paper is shown before adding it (an estimate the user confirms) and after (the actual cost).
- **From**: model-switch (user request after prep, 2026-11-07)
- **Picked up by**: paper-library (2026-11-10)

### B-26 · open
- **What**: After each workout the athlete taps "too easy", "right" or "too hard", and the Coach checks Strava for a ride that day; the last 7 days reach the model, with a selection rule (paper or practice) saying how to adjust, measured with the evaluation set. Where suggestions and taps are kept is still to decide.
- **From**: eval-set (interview, 2026-11-07)

### B-27 · open
- **What**: A command that tries small prompt changes and keeps the ones that score better on the evaluation set, as a proposal the user approves. Every try calls the chat model, so it needs a cost guard.
- **From**: eval-set (interview, 2026-11-07)

### B-28 · picked-up
- **What**: The code works out the protocols the athlete's selection rule allows today and the prompt shows the model only those; the model chooses one and explains why. Measured with the evaluation set against the after rows (qwen2.5:3b 9 of 27, qwen2.5:7b 12 of 27).
- **From**: eval-set (dev task 09, 2026-11-08)
- **Picked up by**: coach-graph (2026-11-10)

### B-29 · picked-up
- **What**: Live-check and evaluation results files record why the Coach used the fallback rules (cut off, unreadable, not in the catalog, too long), and grading counts each cause. Deferred because grading reads the model's own choice and nobody needs a count per cause yet.
- **From**: fallback-reason (interview, 2026-11-08)
- **Picked up by**: coach-graph (2026-11-10)

### B-30 · open
- **What**: Describe each protocol in English in the paper search text: the protocol names are Italian while the search model and the papers are English. Measured with the search-only run of the evaluation set.
- **From**: passage-search (interview, 2026-11-09)

### B-31 · open
- **What**: Find open-license (CC BY, CC BY-SA, CC0) studies behind the same workouts, so more papers are searched by their full text: today only 2 of the 17 qualify. Measured with the search-only run of the evaluation set.
- **From**: passage-search (dev task 03, 2026-11-09)

### B-32 · picked-up
- **What**: In the paper library, search PubMed by title or author and pick the paper from the results, instead of having to know its PMID.
- **From**: paper-library (interview, 2026-11-10)
- **Picked up by**: library-reader (2026-11-11)

### B-33 · open
- **What**: A Coach check that rules out hard work when fitness (CTL) rises too fast in a week, with a source (paper or declared practice) to find first, measured with the evaluation set.
- **From**: coach-graph (interview, 2026-11-10)

### B-34 · picked-up
- **What**: Redesign Analisi in direction B, with Info popovers and panels replacing its on-page explanations, reusing the ui-redesign foundation.
- **From**: ui-redesign (interview, 2026-11-10)
- **Picked up by**: screens-redesign (2026-11-11)

### B-35 · picked-up
- **What**: Redesign the Attività list and the Dettaglio attività screen in direction B, reusing the ui-redesign foundation.
- **From**: ui-redesign (interview, 2026-11-10)
- **Picked up by**: screens-redesign (2026-11-11)

### B-36 · picked-up
- **What**: Redesign Coach AI in direction B, with the workout's reasoning and supporting papers in Info panels, reusing the ui-redesign foundation.
- **From**: ui-redesign (interview, 2026-11-10)
- **Picked up by**: screens-redesign (2026-11-11)

### B-37 · picked-up
- **What**: Redesign Libreria in direction B, reusing the ui-redesign foundation.
- **From**: ui-redesign (interview, 2026-11-10)
- **Picked up by**: screens-redesign (2026-11-11)

### B-38 · picked-up
- **What**: Redesign Impostazioni and the Collega Strava screen in direction B, reusing the ui-redesign foundation.
- **From**: ui-redesign (interview, 2026-11-10)
- **Picked up by**: screens-redesign (2026-11-11)

### B-39 · open
- **What**: Show today's workout as a chart of its blocks (warm-up, intervals, recoveries) on Allenamento; needs the advice to provide durations and target power for each block.
- **From**: ui-redesign (interview, 2026-11-10)

### B-40 · picked-up
- **What**: Overall design changes across the whole app, decided once every screen is in direction B (the user's request that follows the screens' redesign).
- **From**: screens-redesign (interview, 2026-11-11)
- **Picked up by**: design-refresh (2026-11-11)

### B-41 · open
- **What**: The power curve, records and estimated level in Profilo e dati use every saved activity instead of the last ~60, so old records appear too.
- **From**: data-backend (interview, 2026-11-13)

### B-42 · open
- **What**: A command that saves a copy of the database to a file and restores it, so a damaged Docker volume does not lose the history and settings.
- **From**: data-backend (interview, 2026-11-13)

### B-43 · open
- **What**: The Coach service downloads starred segments and their efforts instead of the browser, within the same Strava request budget as the activities.
- **From**: data-backend (interview, 2026-11-13)

### B-44 · open
- **What**: The Coach service estimates FTP and LTHR from activities and segments, so the browser stops sending the athlete profile with every request.
- **From**: data-backend (interview, 2026-11-13)

### B-45 · open
- **What**: The four-week plan asks the Coach service for the load of its simulated workouts, so the load formula lives only on the server; today the plan keeps a copy checked by a test.
- **From**: data-backend (prep, 2026-11-13)

### B-46 · open
- **What**: The automatic saves made at opening (mesocycle, today's FTP point) wait until the browser's old data has been moved to the server, or a server holding only those saves counts as empty, so a browser without old data opened first cannot cause the real data to be deleted.
- **From**: data-backend (dev task 05, 2026-11-13)
