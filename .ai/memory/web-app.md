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

### Daily overview
What Home shows since `ui-redesign`: today's workout with a link to Allenamento, form and readiness, the last ride, then level, totals, records and data precision.
_Avoid_: "dashboard" (suggests Analisi's charts).

## Decisions

- **Direction B, light editorial, for the whole app**: Space Grotesk headings, Inter text, thin dividers, one accent, line icons, a top bar instead of the sidebar, plus a matching dark theme. Why: picked by the user on 2026-11-10 from three directions on the canvas "BikeTR design directions", to fix crowded, text-heavy screens.
- **Explanations leave the page**: a short **Info popover** beside the label, "Approfondisci" for an **Info panel**; never a centred dialog. Why: a dialog hides the numbers it explains, and a panel for a one-line definition is heavy (user's choice on 2026-11-10).
- **Vuetify, not PrimeVue**: the app's components come from Vuetify (MIT), with icons from `@mdi/js`. Why: PrimeVue 5 needs a licence key renewed every year, and without one it shows a red notice on every page, so anyone running the project without their own key would see it.
- **Segment predictions load when the app opens, not when Analisi opens**: `main.ts` starts the segment job once the session is ready, and Home and Analisi recompute when it ends. Why: the old JavaScript app did the same at every load, and the downloaded segments change the FTP and threshold estimates that Home's precision card shows; starting it from `startSession` would create an import loop (`jobs.ts` imports `session.ts`).

## Gotchas

- **Node scripts should not import the `typescript` package**: loading it takes 4–10 seconds per run on the WSL laptop, so a check script that spawns Node several times in tests hits Vitest's 5-second limit. `web/scripts/check-structure.ts` finds imports with a regular expression instead.
- **Check the licence before upgrading a UI package**: PrimeVue moved from MIT to a key-based licence in version 5 (July 2026), and `npm install` gave no warning. Read the package's `LICENSE.md` when adding or upgrading one.
- **Tests cannot load Vuetify screens**: Node can't import the `.css` files that Vuetify components import, and processing all of Vuetify through Vite takes more than Vitest's 5 seconds on the WSL laptop. Tests that only need routing replace the screens with empty components (`vi.mock` of the `.vue` file, as in `tests/app/router.test.ts`); screen behavior is checked in a browser.
- **Day counts depend on the time zone**: Strava's `start_date_local` is local time written with a trailing `Z`, so the calculations parse it as UTC and then cut it to local midnight. The same ride can land on a different day, and loads and form change with the browser's time zone. The calculation tests run in the time zone of `web/tests/fixtures/rides.json` (`tests/core/reference.ts` sets it), so a new date test must import that file, or its days will not match the recorded ones.
- **The router ignores address changes until the first screen has loaded**: vue-router starts listening for `#/…` changes only after its first navigation finishes, which includes downloading that screen's code. A script or browser test that changes the address right after opening the page stays on Home: wait for the first screen to appear first.
- **TypeScript 6 checks CSS imports too**: `import 'leaflet/dist/leaflet.css'` fails `vue-tsc` unless `web/tsconfig.json` lists `vite/client` in `types`, which declares `.css` files.
- **Chart.js orders the tooltip by drawing order**: a dataset's `order` (used to draw the average line above the bars) also decides the order of the tooltip lines, so the average came before the day's load. `LineChart.vue` sets `itemSort` by dataset index, so the lines follow the order the screen gives the series.
- **A long Strava job must save its cache in `finally`**: when the token renewal fails mid-run (Auth server down, Strava disconnected in another tab), the `AuthError` leaves the download queue at once, and a save placed after the queue never runs, so every ride detail downloaded so far is lost. Wrap the queue in `try { … } finally { save… }`, as `web/src/data/streams.ts` and `export.ts` do.
- **Detect Strava's rate limit by status, not by message text**: check `e instanceof StravaError && e.status === 429`. The error message carries the request path, so an activity id containing "429" matched a text search and caused a needless 60-second wait.
- **Tests that mock `strava.ts` must keep its other exports**: `sleep` and `StravaError` come from that module, so a bare `vi.mock` factory leaves them undefined. Spread the real module: `vi.mock(path, async original => ({ ...(await original<typeof import(path)>()), fetchX: vi.fn() }))`, as in `web/tests/data/export.test.ts`.
- **Vue drops the space between elements on separate lines**: `<span>250 W</span>` on one line and `<span>(dichiarata)</span>` on the next render as "250 W(dichiarata)". Write the space explicitly (`{{ ' ' }}`), and compare screens with the rendered text (`innerText`), not `textContent` with spaces removed, which hides the missing space.
- **Strava's segment effort list leaves out followers-only rides**: `/segments/{id}/all_efforts` (and `/segment_efforts`) returned 5 of 8 efforts on a starred segment, missing every recent ride visible only to followers, so the PR and trend were stale. The starred segment's `athlete_pr_effort` still carries the real PR, and activity details still list those efforts: never replace saved efforts with a fresh list, merge them by id.
