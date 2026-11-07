# Web App

The browser app: its screens, navigation and the values saved in the browser.

## Terms

### Impostazioni
The screen that gathers what the athlete sets: FTP, heart-rate and weight values, training volume, race, recovery tools, the Coach model with its Ollama check, and Strava disconnect. The **Athlete profile** is only the subset of these values sent with each Coach request.
_Avoid_: "settings" alone for the screen (also means the saved values), "Coach settings" (the Coach model lives in Impostazioni, not in the Coach screen).

## Decisions

- **Vuetify, not PrimeVue**: the new app's components come from Vuetify (MIT), with icons from `@mdi/js`. Why: PrimeVue 5 needs a licence key renewed every year, and without one it shows a red notice on every page, so anyone running the project without their own key would see it.

## Gotchas

- **Node scripts should not import the `typescript` package**: loading it takes 4–10 seconds per run on the WSL laptop, so a check script that spawns Node several times in tests hits Vitest's 5-second limit. `web/scripts/check-structure.ts` finds imports with a regular expression instead.
- **Check the licence before upgrading a UI package**: PrimeVue moved from MIT to a key-based licence in version 5 (July 2026), and `npm install` gave no warning. Read the package's `LICENSE.md` when adding or upgrading one.
- **Tests cannot load Vuetify screens**: Node can't import the `.css` files that Vuetify components import, and processing all of Vuetify through Vite takes more than Vitest's 5 seconds on the WSL laptop. Tests that only need routing replace the screens with empty components (`vi.mock` of the `.vue` file, as in `tests/app/router.test.ts`); screen behavior is checked in a browser.
- **Day counts depend on the time zone**: Strava's `start_date_local` is local time written with a trailing `Z`, so the calculations parse it as UTC and then cut it to local midnight. The same ride can land on a different day, and loads and form change with the browser's time zone. The calculation tests run in the time zone of `web/tests/fixtures/rides.json` (`tests/core/reference.ts` sets it), so a new date test must import that file, or its days will not match the recorded ones.
