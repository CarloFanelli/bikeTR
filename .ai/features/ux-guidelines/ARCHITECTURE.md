---
feature: ux-guidelines
spec-version: 1.0
status: approved
---

# Architecture Plan: ux-guidelines

## Technical Approach

### Overview

Presentation fixes on the existing Vuetify app, plus pure, tested helpers in `web/src/core` for what a test can observe: chart summary sentences, the name match for search, and series colours checked for contrast. App-wide rules (focus ring, reduced motion, tabular digits) are unlayered CSS in `web/src/app/fonts.css`, which wins over Vuetify's `@layer` styles without `!important` (memory: web-app gotcha). Chart series colours move into the themes as named colours, the pattern `LOAD_KINDS` already uses (`core/training-view.ts:103-110`), so light and dark each get their own shade. No new packages.

## Per-Task Technical Guidance

### Task 01: chart-contrast-patterns

**Files to modify:**
- `web/src/app/theme.ts` — `series-…` colours per theme (green, red, orange, gold, violet, blue, five zone shades), each ≥ 3:1 on `surface`.
- `web/src/core/hr.ts:167-171` — zone `color` becomes a theme colour name; `tests/core/hr.test.ts` follows.
- `FormTrendCard.vue:24-26`, `FtpTrendCard.vue:25,54`, `PowerCurveCard.vue:20`, `PowerProfileCard.vue:16-17,56`, `HrZonesCard.vue:21` — hexes become theme names resolved like `LoadChartCard`.
- `web/src/components/LoadChartCard.vue:28` and `ChartLegend.vue` — `CanvasPattern` fills for hard (stripes) and long (dots) built on the bar colour; legend swatch takes the same pattern (CSS `repeating-linear-gradient` / `radial-gradient`).

**Files to create:**
- `web/tests/app/theme.test.ts` — contrast ≥ 3:1 for every `series-…` and `load-…` colour vs `surface`, both themes.

**Key decisions:**
- Patterns drawn with the canvas API on the bar colour: no plugin. `MonthPlan.vue:27` role colours are accent borders, not chart series: unchanged.

**Watch out for:**
- `hrZonesView` passes `z.color` on (`core/analysis-view.ts:76`) and `HrZonesCard.vue:36` uses it as a border colour → resolve the name there too, or the zone rows lose their border.

### Task 02: chart-summaries

**Files to modify:**
- `web/src/core/analysis-view.ts` — one sentence builder per chart beside `formView`, `hrZonesView`, `powerCurveView`, `ftpTrendRows`; load summary beside `loadChartView` (`core/training-view.ts:112`).
- `LoadChartCard.vue`, `FormTrendCard.vue`, `FtpTrendCard.vue`, `PowerCurveCard.vue`, `HrZonesCard.vue` — the sentence under the chart, `text-body-2`.
- `web/tests/core/analysis-view.test.ts`, `web/tests/core/training-view.test.ts` — sentences, ≤ 25 words, no-data case.

**Patterns to reuse:** messages without data in `hrZonesView` (`analysis-view.ts:71-72`); `fmtKm`/`fmtTime` in `core/format.ts`.

**Key decisions:**
- Sentences built in core, not templates: testable for word count and numbers; no emoji in them.

### Task 03: focus-motion-details

**Files to modify:**
- `web/src/app/fonts.css` — `:focus-visible` outline 2 px `primary`, offset 2 px; `@media (prefers-reduced-motion: reduce)` zeroing animations and transitions; `font-variant-numeric: tabular-nums` on `body`.
- `web/src/components/InfoLabel.vue` — circled "i" (`mdiInformationOutline`) after the text in both the popover and `panel` branches, joined to the last word by a word joiner.

**Patterns to reuse:** `.info-label:focus-visible` (`InfoLabel.vue:47-50`) is replaced by the global ring.

**Key decisions:**
- One global rule for all controls instead of per-component styles; Vuetify's own focus overlay stays beneath it.

**Watch out for:**
- `PowerProfileCard.vue:82` clips its bars with `overflow: hidden` → nothing focusable sits inside it today; keep the ring off clipped containers when adding controls there.

### Task 04: phone-bottom-bar

**Files to modify:**
- `web/src/components/AppTopBar.vue:18-25,60-66` — sections from the shared list; below 768 px no menu button, Libreria added to the account menu above Impostazioni.
- `web/src/App.vue` — mount the Bottom bar when `phase === 'ready'`, like the top bar; `SECTION_OF` reads the shared list.

**Files to create:**
- `web/src/app/sections.ts` — the six sections: title, path, icon, colour, route names (used by top bar, Bottom bar, `App.vue`).
- `web/src/components/AppBottomBar.vue` — `VBottomNavigation` with five `VBtn`s, `active` per section like `isActive` (`AppTopBar.vue:28-29`).

**Patterns to reuse:** `useDisplay` width check (`AppTopBar.vue:31-32`).

**Key decisions:**
- `VBottomNavigation` is a Vuetify layout item (`useLayoutItem`, position bottom), so `VMain` leaves room by itself.

### Task 05: errors-with-retry

**Files to modify:**
- `web/src/App.vue:33` (session error, Riprova → `startSession`), `HomeScreen.vue` streams error (moves in Task 06), `SegmentPredictions.vue:36,44` (Riprova → `loadSegments` / `completeSegments`), `ExportDialog.vue:114` (Riprova → last export), `TrainingScreen.vue:55,91`, `HomeScreen.vue:109`, `ActivityDetailScreen.vue:90` (Riprova → reload the detail), `LibraryScreen.vue:127,162`, `CoachSettingsCard.vue:35,43` — notice component.
- `web/src/app/jobs.ts:76` — remember the last export choice for retry.

**Files to create:**
- `web/src/components/ErrorNotice.vue` — sentence, closed `VExpansionPanels` "Dettagli tecnici", optional Riprova with `loading`.

**Patterns to reuse:** `CoachErrorCard.vue` (notice plus detail); `splitEmoji` for `❌` messages.

**Watch out for:**
- `startSession` (`session.ts:38-40`) has no running guard → the session notice disappears when phase turns `loading`, so the button can't be pressed twice; keep the retry inside the error branch.
- `runExport` asks no confirmation (`ExportDialog.vue:61` does) → retry reuses the confirmed choice, never a new mode.

### Task 06: home-and-profile-tab

**Files to modify:**
- `web/src/screens/HomeScreen.vue` — keep header, workout, form, readiness, week tiles, last ride in that order; move profile and precision out with their computeds.
- `web/src/screens/AnalysisScreen.vue:37-42` — fifth tab "Profilo e dati".
- `web/src/data/storage.ts:144-151` — `'profilo'` in `AnalysisTab` and `ANALYSIS_TABS`; `web/tests/data/storage.test.ts`.

**Files to create:**
- `web/src/components/ProfileCard.vue`, `web/src/components/DataPrecisionCard.vue` — the two Home cards moved as they are (pattern: `FtpLthrCard.vue`, a card owning its computeds).

**Key decisions:**
- Cards are moved, not rewritten: their texts, topics and job progress stay identical.

**Watch out for:**
- `precision` recomputes on `segmentsJob.list` and `streamsJob.running` (`HomeScreen.vue:63-68`) → keep both reactive reads in the moved card, or the numbers go stale after a download.

### Task 07: activities-search

**Files to modify:**
- `web/src/screens/ActivitiesScreen.vue:47-50` — `VTextField` (clearable, Escape clears) above the chips; `weeks` filters by name too; no-match message.
- `web/src/core/activity-view.ts` — name match ignoring case and accents (`normalize('NFD')`).
- `web/tests/core/activity-view.test.ts` — match cases.

**Patterns to reuse:** `filter` and empty message (`ActivitiesScreen.vue:42-50,84-86`).

**Key decisions:**
- Matched on `displayName` (`activity-view.ts`), the name the athlete sees.
