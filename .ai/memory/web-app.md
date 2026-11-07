# Web App

The browser app: its screens, navigation and the values saved in the browser.

## Terms

### Impostazioni
The screen that gathers what the athlete sets: FTP, heart-rate and weight values, training volume, race, recovery tools, the Coach model with its Ollama check, and Strava disconnect. The **Athlete profile** is only the subset of these values sent with each Coach request.
_Avoid_: "settings" alone for the screen (also means the saved values), "Coach settings" (the Coach model lives in Impostazioni, not in the Coach screen).

## Decisions

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
- **Vue drops the space between elements on separate lines**: `<span>250 W</span>` on one line and `<span>(dichiarata)</span>` on the next render as "250 W(dichiarata)". Write the space explicitly (`{{ ' ' }}`), and compare screens with the rendered text (`innerText`), not `textContent` with spaces removed, which hides the missing space.
