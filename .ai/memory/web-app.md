# Web App

The browser app: its screens, navigation and the values saved in the browser.

## Terms

### Impostazioni
The screen that gathers what the athlete sets: FTP, heart-rate and weight values, training volume, race, recovery tools, the Coach's **Chat model** with its connection check, and Strava disconnect. The **Athlete profile** is only the subset of these values sent with each Coach request.
_Avoid_: "settings" alone for the screen (also means the saved values), "Coach settings" (the Coach's chat model shows in Impostazioni, not in the Coach screen).

### Info popover
A short explanation, at most two sentences, that opens beside a dotted-underlined label when the athlete clicks, taps or presses Enter on it. When the topic has more to say it ends with "Approfondisci", which opens the **Info panel**.
_Avoid_: "tooltip" (opens on hover only, which phones don't have), "hint".

### Info panel
The panel that slides in from the right (full screen on a phone) with a longer explanation: up to three plain sentences, then an optional collapsed "Dettagli tecnici" part. One panel is open at a time, and the screen stays visible behind it on a computer.
_Avoid_: "dialog" or "modal" (a centred window that covers the numbers being explained), "drawer" (also Vuetify's name for the old sidebar).

### Mini map
The route line of an activity drawn alone, without map tiles, in each row of Attività's table view. The street map with tiles is the "map": in the activity detail and in Attività's card view.
_Avoid_: "thumbnail" (suggests an image of a real map), "mini mappa" for the card view's map (that one has streets).

### Daily overview
What Home shows: today's workout with a link to Allenamento, form, readiness, the three week tiles (km, hours, load) and the last ride. Level, totals, records and data precision live in Analisi's **Profilo e dati** tab.
_Avoid_: "dashboard" (suggests Analisi's charts).

### Profilo e dati
The Analisi tab with the athlete's level, totals, records and data precision with "Aggiorna con streams", moved there from Home to keep the **Daily overview** short.
_Avoid_: "Profilo" alone (clashes with **Athlete profile**, the values sent to the Coach), "Il tuo profilo" (the card's old title on Home).

### Bottom bar
The section bar fixed at the bottom of the screen below 768 px: Home, Allenamento, Analisi, Attività, Coach AI. Libreria and Impostazioni sit in the account menu.
_Avoid_: "tab bar" (Analisi's tabs are also tabs), "menu" (the account menu in the top bar).

### Dietro le quinte
The closed section at the bottom of Coach AI with what is meant for whoever builds the Coach: the context sent to the model, its raw output, the papers the search found with their scores, model and timings. The athlete sees only the workout above it.
_Avoid_: "debug" (sounds like an error state), "per sviluppatori" (the user studies these parts, they are not hidden from them).

## Decisions

- **Direction B, light editorial, for the whole app**: Space Grotesk headings, Inter text, thin dividers, one accent for controls, line icons, a top bar instead of the sidebar, plus a matching dark theme. Why: picked by the user on 2026-11-10 from three directions on the canvas "BikeTR design directions", to fix crowded, text-heavy screens.
- **Explanations leave the page**: a short **Info popover** beside the label, "Approfondisci" for an **Info panel**; never a centred dialog. Why: a dialog hides the numbers it explains, and a panel for a one-line definition is heavy (user's choice on 2026-11-10).
- **Vuetify, not PrimeVue**: the app's components come from Vuetify (MIT), with icons from `@mdi/js`. Why: PrimeVue 5 needs a licence key renewed every year, and without one it shows a red notice on every page, so anyone running the project without their own key would see it.
- **Segment predictions load when the app opens, not when Analisi opens**: `main.ts` starts the segment job once the session is ready, and Home and Analisi recompute when it ends. Why: the old JavaScript app did the same at every load, and the downloaded segments change the FTP and threshold estimates that the data precision card (Analisi, **Profilo e dati**) shows; starting it from `startSession` would create an import loop (`jobs.ts` imports `session.ts`).
- **Home's "Forma" is the freshness number (TSB), with its sign**: the old profile word ("buona", "in costruzione"), which compares recent weekly hours with the level, moved into the level's **Info panel** as "Volume recente". Why: the spec asks for form shown with its sign and coloured when zero or negative; two different values both called "Forma" would confuse the athlete.
- **Chart series take their colour from the theme**: every chart line, bar and legend swatch names a theme colour (`series-…`, `load-…` in `web/src/app/theme.ts`) with its own shade per theme, at least 3:1 on the card (checked by `tests/app/theme.test.ts`); hard and long days in the load chart also carry stripes and dots. Why: WCAG 1.4.11 and 1.4.1, adopted with the ux-guidelines feature (2026-11-11); the fixed bright hues fell below 3:1 on the light card.

- **Coach AI keeps only the workout on the page**: title, target power, steps and the start of the reasoning; the full reasoning and cited papers open in the **Info panel**, and context, raw output, found papers and timings sit in **Dietro le quinte**. Why: the athlete needs the workout, the rest is for whoever builds the Coach (user's choice, 2026-11-11).
- **Impostazioni saves with a bar, not per field**: any change shows "Salva" / "Annulla" at the bottom, and leaving, disconnecting or reloading with unsaved changes asks first. Why: one explicit save matches how the values are stored (one object), and a silent loss of edits was the risk (user's choice, 2026-11-11).
- **Each section has its own colour**: the screen title, card titles and the icon square beside each card title take the open section's colour (`section-…` in `web/src/app/theme.ts`, through `--section`), and so does its entry in the top bar; buttons keep the blue accent. Why: the user asked for more colour on 2026-11-11 and chose section colours, coloured card titles and icon squares over colouring numbers.
- **Allenamento puts the plan before the tools**: today's and tomorrow's workouts (always both; a skipped day shows its planned rest), then the plan with the 28-day calendar beside it on wide screens, then the load chart; each plan day carries the load chart's colour and pattern for its type (easy, hard, long, cross-training, rest). Why: the user asked for a shorter page that reads at a glance (2026-11-11), and one colour code across chart and plan avoids learning two. The cycle-phase and training-model labels open the side panel: their explanations are too long for a popover.
- **Errors speak plainly, and only downloads offer "Riprova"**: every error notice (`ErrorNotice.vue`) opens with one sentence on what failed and what still works, with the technical message under a closed "Dettagli tecnici"; "Riprova" appears only on Strava downloads (first load, streams, segments, export, activity detail). Why: retrying a calculation (advice, plan) gives the same error, and the user chose to add the activity detail to the retry list (2026-11-11).
- **Vuetify stays, no Tailwind**: the design refresh kept Vuetify components and styling, with corners and page columns done in global CSS. Why: the user asked for Tailwind, then chose to keep Vuetify on 2026-11-11 rather than rewrite every screen.
- **Libreria is a list and a reading area, with the open paper in the address**: from 1280 px the list takes the left 25% and the paper the right 75%, each scrolling on its own; narrower, they take turns. One route record, `/libreria/:pmid?`, serves the list, every paper and the add page (`/libreria/aggiungi`). Why: the user asked for the 25/75 split and a shareable address (2026-11-11); one record keeps the screen mounted, so the loaded library and passages survive switching papers.

## Gotchas

- **Loading placeholders copy each screen's layout**: the grey shapes shown while Strava data loads are drawn by hand per screen, so a screen whose card layout changes must have its placeholder changed with it, or the page jumps when the data arrives.
- **A sticky card needs its own block**: a sticky card stays in view only inside its parent, so it must sit in a block that holds just the cards beside it. Placed directly in the page grid, Allenamento's calendar slid over the load chart while scrolling.
- **Node scripts should not import the `typescript` package**: loading it takes 4–10 seconds per run on the WSL laptop, so a check script that spawns Node several times in tests hits Vitest's 5-second limit. `web/scripts/check-structure.ts` finds imports with a regular expression instead.
- **Check the licence before upgrading a UI package**: PrimeVue moved from MIT to a key-based licence in version 5 (July 2026), and `npm install` gave no warning. Read the package's `LICENSE.md` when adding or upgrading one.
- **Tests cannot load Vuetify screens**: Node can't import the `.css` files that Vuetify components import, and processing all of Vuetify through Vite takes more than Vitest's 5 seconds on the WSL laptop. Tests that only need routing replace the screens with empty components (`vi.mock` of the `.vue` file, as in `tests/app/router.test.ts`); screen behavior is checked in a browser.
- **Day counts depend on the time zone**: Strava's `start_date_local` is local time written with a trailing `Z`, so the calculations parse it as UTC and then cut it to local midnight. The same ride can land on a different day, and loads and form change with the browser's time zone. The calculation tests run in the time zone of `web/tests/fixtures/rides.json` (`tests/core/reference.ts` sets it), so a new date test must import that file, or its days will not match the recorded ones.
- **The router ignores address changes until the first screen has loaded**: vue-router starts listening for address changes only after its first navigation finishes, which includes downloading that screen's code. A script or browser test that changes the address right after opening the page stays on Home: wait for the first screen to appear first.
- **TypeScript 6 checks CSS imports too**: `import 'leaflet/dist/leaflet.css'` fails `vue-tsc` unless `web/tsconfig.json` lists `vite/client` in `types`, which declares `.css` files.
- **Chart.js orders the tooltip by drawing order**: a dataset's `order` (used to draw the average line above the bars) also decides the order of the tooltip lines, so the average came before the day's load. `LineChart.vue` sets `itemSort` by dataset index, so the lines follow the order the screen gives the series.
- **A long Strava job must save its cache in `finally`**: when the token renewal fails mid-run (Auth server down, Strava disconnected in another tab), the `AuthError` leaves the download queue at once, and a save placed after the queue never runs, so every ride detail downloaded so far is lost. Wrap the queue in `try { … } finally { save… }`, as `web/src/data/streams.ts` and `export.ts` do.
- **Detect Strava's rate limit by status, not by message text**: check `e instanceof StravaError && e.status === 429`. The error message carries the request path, so an activity id containing "429" matched a text search and caused a needless 60-second wait.
- **Tests that mock `strava.ts` must keep its other exports**: `sleep` and `StravaError` come from that module, so a bare `vi.mock` factory leaves them undefined. Spread the real module: `vi.mock(path, async original => ({ ...(await original<typeof import(path)>()), fetchX: vi.fn() }))`, as in `web/tests/data/export.test.ts`.
- **Vue drops the space between elements on separate lines**: `<span>250 W</span>` on one line and `<span>(dichiarata)</span>` on the next render as "250 W(dichiarata)". Write the space explicitly (`{{ ' ' }}`), and compare screens with the rendered text (`innerText`), not `textContent` with spaces removed, which hides the missing space.
- **Strava's segment effort list leaves out followers-only rides**: `/segments/{id}/all_efforts` (and `/segment_efforts`) returned 5 of 8 efforts on a starred segment, missing every recent ride visible only to followers, so the PR and trend were stale. The starred segment's `athlete_pr_effort` still carries the real PR, and activity details still list those efforts: never replace saved efforts with a fresh list, merge them by id.
- **Calculated texts carry emoji; screens must strip them**: titles, plan rows, advice rows and progress messages from `web/src/core` start with emoji, and tests pin them. Progress and result messages of the background jobs in `web/src/app/jobs.ts` ("✅ Scaricate…", "❌ …") and of the Coach run carry them too. Every place that shows such a text, Info panel rows included, goes through `splitEmoji` (icon via `LineIcon`, or dropped) or `withoutEmoji` for emoji in the middle, as `MonthPlan.vue` does; the advice's "Freschezza" row and Analisi's segment completion message slipped through until review.
- **Every value in `biketr_ui` is saved by merging**: the theme and the last Analisi tab share that one browser entry, so a saver that writes only its own key erases the others. Add new UI values through `saveUi` in `web/src/data/storage.ts`, which merges with what is there.
- **Only the last 60 activities are loaded**: a list of 60 runs or swims has no bike ride though older rides exist, so a message about rides must say "tra le ultime 60 attività", never "nessuna uscita".
- **Reduced motion must spare the loading spinners**: the global `prefers-reduced-motion` rule in `web/src/app/fonts.css` sets `animation: none` on every element, which also freezes Vuetify's indeterminate spinner inside loading buttons, so a running retry looks stuck. Keep the exception that gives `.v-progress-circular--indeterminate` its animation back (`revert-layer`), and add one for any new indeterminate indicator.
- **A superseded request must release the busy flag**: a counter that drops stale answers (as Libreria's word search does) also skips the line that clears `busy`, so a request abandoned for one that never reaches the network (a PMID refused in the browser) left "Cerca" disabled for good. Whatever abandons a request clears the flag it held.
- **Vuetify's corners and widths are changed in `web/src/app/fonts.css`, not with props**: Vuetify's CSS sits inside `@layer` blocks, so plain rules there win without `!important`, and its `rounded` prop only knows 2, 4, 8 and 24 px. New corners use `var(--radius-panel)` (16 px) or `var(--radius-control)` (12 px); card screens use `page-wide` and `card-grid`, whose children need `min-width: 0` so a chart or table can't widen the page.
