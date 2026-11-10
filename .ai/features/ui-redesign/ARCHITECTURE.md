---
feature: ui-redesign
spec-version: 1.0
status: approved
---

# Architecture Plan: UI Redesign — foundation and pilot screens

## Technical Approach

### Overview

Direction B is built on Vuetify's own theme system, not beside it: two themes (`light`, `dark`) with direction B's colours plus a few named extra colours, and Vuetify 4.3.2's built-in `'system'` theme name, which already follows `prefers-color-scheme` live (`node_modules/vuetify/lib/composables/theme.js:204-270`). Fonts come from two OFL-1.1 npm packages bundled by Vite, fed to Vuetify through its `--v-font-body` / `--v-font-heading` variables (`vuetify/lib/styles/settings/_variables.scss:20,203`). The calculation code in `src/core/` keeps its output byte for byte — its tests and `tests/fixtures/plan-expected.json` pin emoji and colours — so emoji become icons and long texts move into panels only in the display layer. Every new piece of logic (emoji mapping, text cutting, explanation copy, theme choice, last ride) is a pure function with a Vitest test, because tests cannot render Vuetify screens.

### Shared Concerns

#### Theme colours only

- **Appears in**: Task 01, Task 02, Task 03, Task 04, Task 05
- **Reference example**: `src/components/RestCalendar.vue:61` (`rgb(var(--v-theme-primary))`)
- **Rule**: styles use `rgb(var(--v-theme-…))` and Vuetify's border variables, never a hex value; data colours that must differ per theme are named theme colours.
- **Watch out for**: `color-mix(…, transparent)` banners in `MonthPlan.vue:65-70` read differently on white; check them in both themes.

#### Emoji to line icon

- **Appears in**: Task 01, Task 04, Task 05
- **Reference example**: `src/core/training-view.ts:225` (`planRows` splits the leading emoji off a title)
- **Rule**: a pure function splits a leading emoji from a calculation string and returns a semantic icon name; one icon component maps the name to an `@mdi/js` path; unknown emoji → no icon.

#### Info popover and Info panel

- **Appears in**: Task 03, Task 04, Task 05
- **Reference example**: created in Task 03
- **Rule**: explained labels use the info-label component; fixed copy lives in the explanations modules, ad-hoc text (plan day detail, mesocycle lines) is passed as a topic object at open time.

## Per-Task Technical Guidance

### Task 01: theme-foundation

**Files to modify:**
- `web/src/app/main.ts` — replace the single dark `biketr` theme with `light`/`dark` from the new theme module; `defaultTheme` = saved choice (`'system'` when none); import the font CSS.
- `web/src/data/storage.ts` — theme choice load/save on the `biketr_ui` key (`{ theme }`), validated to `system|light|dark`; drop sidebar load/save in Task 02.
- `web/src/components/LineChart.vue` — `MUTED`/`GRID` from `useTheme().current` inside the `options` computed, so a theme change recomputes them.
- The 18 components and 2 screens holding hex backgrounds or borders (list: `grep -rnoE "#[0-9a-fA-F]{3,6}" web/src`) — Theme colours only.
- `web/src/components/LoadChartCard.vue` — bar colours from named theme colours per load tag.
- `web/package.json` — `@fontsource-variable/inter`, `@fontsource/space-grotesk` (both OFL-1.1, read with `npm view`).
- `README.md` §7 — `biketr_ui` row now `{theme}`.

**Files to create:**
- `web/src/app/theme.ts` — the two theme definitions and font variables.
- `web/src/core/emoji.ts` — Emoji to line icon (pure); `web/src/components/LineIcon.vue` — name → `@mdi/js` path.
- Tests: `web/tests/core/emoji.test.ts`; theme-choice cases in `web/tests/data/storage.test.ts`.

**Key decisions:**
- Core colours (`training-view.ts:103-109`, `hr.ts:167-171`) stay; components map tags to theme colours.

**Watch out for:**
- `riposo` bars `#2a2e38` vanish on white — `src/core/training-view.ts:108` → map the tag to a theme colour in `LoadChartCard.vue`; test: chart in light theme shows rest days.
- An old `biketr_ui` holding only `{sidebarCollapsed}` must load as `'system'`, not move to `.broken` — `src/data/storage.ts:121-124` → validator accepts objects, missing `theme` means system; test: old value.

---

### Task 02: top-bar-shell

**Files to modify:**
- `web/src/App.vue` — the top bar instead of `AppSidebar`; the content area keeps the loading, notice, connect and error branches.
- `web/src/data/storage.ts` — remove `loadSidebarCollapsed`/`saveSidebarCollapsed`; tests at `web/tests/data/storage.test.ts:126-144` change with them.
- `web/src/screens/HomeScreen.vue` — export button, its progress line and `ExportDialog` leave Home.

**Files to create:**
- `web/src/components/AppTopBar.vue` — `VAppBar` with section links (`to` + active class), account `VMenu` (avatar or initials, name, "Collegato a Strava", Impostazioni, Esporta allenamenti opening `ExportDialog`, a three-way theme `VBtnToggle`), export progress from `exportJob` (`web/src/app/jobs.ts:51`).

**Files to delete:**
- `web/src/components/AppSidebar.vue`.

**Patterns to reuse:**
- Section list and athlete name from `AppSidebar.vue:34-49`; `ExportDialog.vue` unchanged.

**Key decisions:**
- The phone switch uses `useDisplay().width < 768` directly; Vuetify's `md` breakpoint stays at its default so `VCol md=…` on other screens keeps working.
- Theme change: `useTheme().change(choice)` plus save.

**Watch out for:**
- Detail routes (`/attivita/:id`) must highlight Attività — `src/app/router.ts:28-31` → match by path prefix, not exact route; check in browser.

---

### Task 03: info-explanations

**Files to create:**
- `web/src/components/InfoLabel.vue` — a real `<button>` with dotted underline, `VMenu` popover (open on click, ≤ 2 sentences, "Approfondisci" when the topic has a panel text).
- `web/src/components/InfoPanel.vue` — `VNavigationDrawer` `location="right"` temporary at ≥ 768 px, full-screen `VDialog` below; title, lead sentences, collapsed "Dettagli tecnici" (`VExpansionPanels`, as in `HomeScreen.vue:25`).
- `web/src/app/info-panel.ts` — one reactive state (topic, opener element) so one panel at a time; closes on route change via `router.afterEach`.
- `web/src/core/explanations/` — topic copy per area (`charts.ts` now; `training.ts`, `home.ts` in Tasks 04–05), each module < 500 lines (`scripts/check-structure.ts:11`).
- `web/tests/core/explanations.test.ts` — every topic: popover ≤ 2 sentences, panel lead ≤ 3, no code-like token (camelCase, `()`, `.ts`).

**Files to modify:**
- `web/src/App.vue` — mount `InfoPanel` once.
- `web/src/components/LoadChartCard.vue` — title as `InfoLabel` on the daily-load topic.

**Key decisions:**
- Copy as data, not in templates: the REQ-15/16 limits become a test.

**Watch out for:**
- Focus must return to the opener after close — Vuetify returns focus for its own activators, not for a panel opened from a popover link → keep the opener in `info-panel.ts` and focus it on close; check with keyboard.

---

### Task 04: allenamento-redesign

**Files to modify:**
- `web/src/screens/TrainingScreen.vue` — new layout; today card, next card, calendar, chart, plan; "Chiedi al Coach" `to="/coach"`.
- `web/src/components/AdviceCard.vue` — title with `LineIcon`, detail cut to 30 words, "Perché questo allenamento" `InfoLabel` whose panel holds reason and `adviceRows`.
- `web/src/components/RestCalendar.vue` — `LineIcon` per state; legend into an `InfoLabel`.
- `web/src/components/MonthPlan.vue` — one row per day, detail into the panel; banners as one-line notices; model rows, diagnostics and `loadSourceLine` into panels; drop `VExpansionPanels` per week.

**Files to create:**
- `web/src/core/text.ts` — cut text to ≤ 30 words at a sentence end, else at the 30th word with "…"; `web/tests/core/text.test.ts`.
- `web/src/core/explanations/training.ts` — readiness, freshness, ratio, calendar legend, load source, training model.
- `web/src/app/today.ts` — today's advice computed from session and storage, moved out of `TrainingScreen.vue:36-55` (also read by Task 05).

**Patterns to reuse:**
- `attempt` (`TrainingScreen.vue:28-34`) for per-block errors; Emoji to line icon; Info popover and Info panel.

**Watch out for:**
- `MonthPlan.vue` row links to rides (`:59-63`) and the info label sit in one row → the label must stop click propagation; check a past linked day opens the panel.

---

### Task 05: home-overview

**Files to modify:**
- `web/src/screens/HomeScreen.vue` — Daily overview blocks: today (from `app/today.ts`), form and readiness, last ride, level/totals/records, data precision; the FTP/LTHR method text (`:25-65`) moves to the explanations module.
- `web/src/core/home.ts` — last bike ride view (latest `start_date` among `type` containing `Ride`, as `home.ts:33`); totals labels without emoji.
- `web/tests/core/home.test.ts` — last-ride cases (none, only runs, unnamed).

**Files to create:**
- `web/src/core/explanations/home.ts` — form, readiness, level, data precision, FTP/LTHR method (plain lead + technical part).

**Patterns to reuse:**
- `compositeFatigueScore` as in `TrainingScreen.vue:46` for readiness; `displayName` (`core/activity-view.ts:8`); `fmtKm`/`fmtTime` (`core/format.ts`).

**Key decisions:**
- Pick the latest ride by date, not by list position: the order of Strava's list is not set in this code (`data/strava.ts:46`).

**Watch out for:**
- Only the last 60 activities are loaded (`src/app/session.ts:19`): 60 runs or swims leave no bike ride though older rides exist → "Nessuna uscita in bici tra le ultime 60 attività" (task edge case); test: list of runs only.
