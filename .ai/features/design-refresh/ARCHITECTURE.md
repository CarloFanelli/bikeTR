---
feature: design-refresh
spec-version: 1.0
status: approved
---

# Architecture Plan: design-refresh

## Technical Approach

### Overview

Presentation on the existing Vuetify foundation, plus three small pure helpers in `web/src/core` (sport group and week groups for Attività, the Mini map path, week tiles), each tested. Corners and page grids are global, unlayered CSS in `web/src/app/fonts.css`: Vuetify ships its CSS inside `@layer` blocks (`node_modules/vuetify/dist/vuetify.css:6-11`), so unlayered rules win without `!important`, and its radius scale has no 12 or 16 px step (`rounded-lg` 8, `rounded-xl` 24). Card maps reuse `ActivityMap.vue`, mounted lazily with Vuetify's `VLazy`; Mini maps are inline SVG, no tiles. The only new saved value is the Attività view, in `biketr_ui`.

### Shared Concerns

#### Page width and card grid

- **Appears in**: Task 02, Task 03, Task 05, Task 06
- **Reference example**: `web/src/screens/HomeScreen.vue:226-231` (`.tiles` grid with `min(100%, …)`)
- **Rule**: card screens use one global page class (1440 px, 24 px margins) and one grid class (3/2/1 columns at 1280/768 px) with a "span all" modifier for chart, table and map cards; narrow screens keep their 880 px rule.

#### Emoji at display time

- **Appears in**: Task 03, Task 04, Task 05
- **Reference example**: `web/src/core/activity-view.ts:14` (`sportIcon`), `web/src/components/MetricGrid.vue`
- **Rule**: sport icons come from `sportIcon`/`LineIcon`; core strings with emoji go through `splitEmoji` or `withoutEmoji`.

## Per-Task Technical Guidance

### Task 01: rounder-corners

**Files to modify:**
- `web/src/app/fonts.css` — unlayered radius rules: 16 px on `.v-card`, `.v-expansion-panels`, `.v-alert`, dialog and menu content, `.v-navigation-drawer` of the Info panel; 12 px on `.v-btn`, `.v-field`, `.v-chip`, `.v-btn-group`; card children clipped (`overflow: hidden` already on `.v-card`, vuetify.css:18465).
- `web/src/components/ActivityMap.vue:31`, `CoachWorkoutCard.vue`, `SettingsScreen.vue` save bar, `InfoPanel.vue` — local radii aligned to the same two values.

**Patterns to reuse:** global classes already in `fonts.css` (`.action`, `.first-capital`).

**Key decisions:**
- Global CSS, not `createVuetify` `defaults` (`app/main.ts:20`): the `rounded` prop only maps to the 2/4/8/24 scale.

**Watch out for:**
- The fullscreen `VDialog` of the Info panel on phones (`InfoPanel.vue:35-37`) would get rounded corners → exclude `.v-dialog--fullscreen` content.

### Task 02: card-columns

**Files to modify:**
- `web/src/app/fonts.css` — page and grid classes (Shared Concern).
- `web/src/screens/HomeScreen.vue`, `TrainingScreen.vue`, `AnalysisScreen.vue` (each `VTabsWindowItem` body), `CoachScreen.vue` — replace the 880 px wrapper and `d-flex flex-column` stacks with the grid; mark chart, table and map cards as spanning.
- `web/src/components/FtpLthrCard.vue` — its tables keep their sideways scroll inside the spanning card.

**Patterns to reuse:** `HomeScreen.vue:226` grid with `min(100%, …)`.

**Key decisions:**
- CSS grid with source order = today's order, so one column reproduces the current stack (REQ-5).
- Coach AI: the duration form, notices and Dietro le quinte span all columns; the workout card spans all; the grid only matters once Coach shows more than one card.

**Watch out for:**
- Grid items default to `min-width: auto`, so a chart canvas (`LineChart.vue:36`, responsive) or wide table keeps its cell from shrinking and the page scrolls sideways → grid cells get `min-width: 0`.

### Task 03: activities-two-views

**Files to modify:**
- `web/src/screens/ActivitiesScreen.vue` — all `session.activities`, `VBtnToggle` switch, table (`VTable`) and card grid; rows and cards as `RouterLink`s.
- `web/src/core/activity-view.ts` — row data gains climbing "—" and the route string; keep `activityRow` callers.
- `web/src/data/storage.ts` — `loadActivitiesView`/`saveActivitiesView` through `saveUi` (`:130`), beside `loadAnalysisTab` (`:147`).
- `web/src/components/ActivityMap.vue` — height and interactivity as props; detail keeps 360 px and dragging.
- `web/tests/core/activity-view.test.ts`, `web/tests/data/storage.test.ts`.

**Files to create:**
- `web/src/core/route-path.ts` — points to an SVG path fitted in a box, null under 2 points (pattern: `core/polyline.ts`).
- `web/src/components/MiniMap.vue` — the SVG line, or the sport icon.
- `web/tests/core/route-path.test.ts`.

**Patterns to reuse:** `decodePolyline` (`core/polyline.ts`), `VLazy` for card maps, `ActivityDetailScreen.vue:76-79` polyline fallback.

**Key decisions:**
- Card maps are static (no drag, zoom, scroll-wheel): the whole card is one link.

**Watch out for:**
- `saveThemeChoice`/`saveAnalysisTab` share `biketr_ui` → the view saver must use `saveUi`; test: save theme, tab, view, all three load.
- A Leaflet map mounted inside a link swallows clicks → disable its handlers and let the card's `RouterLink` receive the click.

### Task 04: filter-and-weeks

**Files to modify:**
- `web/src/screens/ActivitiesScreen.vue` — `VChipGroup` (mandatory, Tutte default, not saved) and week headers in both views.
- `web/src/core/activity-view.ts` — sport group per type and week groups with totals, from `isoDay` (`core/format.ts:34`) and Monday starts.
- `web/tests/core/activity-view.test.ts` — groups, totals, empty filter, near-midnight case importing `tests/fixtures/rides.json` time zone (memory: web-app gotcha "Day counts depend on the time zone").

**Patterns to reuse:** `TYPE_EMOJI` keys (`core/format.ts:44`) for the bike and run types; `type.includes('Ride')` as `core/plan/load-chart.ts:29`.

**Key decisions:**
- Bici = any type containing "Ride"; Corsa = types containing "Run"; Altro = the rest.

### Task 05: home-week-tiles

**Files to modify:**
- `web/src/core/home.ts` — week tiles: km, hours, load from Monday to today vs last week's same days.
- `web/src/screens/HomeScreen.vue` — the three tiles first in the grid.
- `web/tests/core/home.test.ts`.

**Patterns to reuse:** `activityLoad` (`core/load.ts:126`) with `hrProfile()` as `core/plan/load-chart.ts:28`; `isoDay` for days.

**Key decisions:**
- Change with a sign and unit ("+12 km", "−0h 30m"), no percentage at all, so a zero last week needs no special case beyond the sign.

### Task 06: loading-placeholders

**Files to modify:**
- `web/src/App.vue:18-21` — while `session.phase === 'loading'`, render the placeholder for the current route instead of the sentence.

**Files to create:**
- `web/src/components/LoadingPlaceholder.vue` — `VSkeletonLoader` cards in the page grid, a shape per route name (`home`, `allenamento`, `analisi`, `attivita`), the old sentence for other routes.

**Patterns to reuse:** route names in `app/router.ts`; page and grid classes (Shared Concern).

**Watch out for:**
- The route stays at its start location until the first screen's code downloads (memory gotcha), so `useRoute()` can read "/" during loading → pick the shape from `window.location.hash`.
