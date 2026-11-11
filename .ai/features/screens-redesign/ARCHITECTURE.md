---
feature: screens-redesign
spec-version: 1.0
status: approved
---

# Architecture Plan: screens-redesign

## Technical Approach

### Overview

Presentation only: every task rewrites one screen's templates on the `ui-redesign` foundation (themes, `InfoLabel`, `InfoPanel`, `LineIcon`, `splitEmoji`), leaving `web/src/core` calculations and the `data/` calls untouched. Explanation texts go into new modules under `web/src/core/explanations/`, checked by `tests/core/explanations.test.ts`. The only new saved value is the Analisi tab, kept in the same `biketr_ui` object as the theme. No new packages: tabs come from Vuetify's `VTabs`/`VTabsWindow` (`node_modules/vuetify/lib/components/VTabs`).

### Shared Concerns

#### Screen heading

- **Appears in**: Task 01, Task 02, Task 03, Task 04, Task 05
- **Reference example**: `web/src/screens/TrainingScreen.vue:46-49`
- **Rule**: each screen opens with `<header>` and an `h1.text-h4`, not a `VCardTitle` with emoji; the screen body caps at 880 px like `.training`.

#### Emoji at display time

- **Appears in**: Task 01, Task 02, Task 03, Task 04, Task 05
- **Reference example**: `web/src/components/MonthPlan.vue:36` (`noEmoji`), `web/src/components/AdviceCard.vue:25`
- **Rule**: core strings keep their emoji; templates pass them through `splitEmoji`/`emojiIcon` and show `LineIcon` or nothing.
- **Watch out for**: Info panel rows and notices too, not only titles — the review of `ui-redesign` caught a row that slipped (memory: web-app gotcha).

#### Explanation modules

- **Appears in**: Task 01, Task 03, Task 05
- **Reference example**: `web/src/core/explanations/home.ts`, test `web/tests/core/explanations.test.ts:7-16`
- **Rule**: each screen's topics live in `core/explanations/{screen}.ts`, are added to the test's `ALL`, keep `short` ≤ 2 sentences, `lead` ≤ 3, and no code names.

## Per-Task Technical Guidance

### Task 01: analisi-tabs

**Files to modify:**
- `web/src/screens/AnalysisScreen.vue` — heading, `VTabs` + `VTabsWindow` with four items; the `view` computed stays as is.
- `web/src/data/storage.ts` — `loadAnalysisTab`/`saveAnalysisTab` beside `loadThemeChoice` (`:131-136`).
- The nine cards (`SegmentPredictions`, `LoadChartCard`, `FormTrendCard`, `PowerCurveCard`, `HrZonesCard`, `PowerProfileCard`, `FtpTrendCard`, `FtpLthrCard`, `SegmentWorkouts`) — `InfoLabel` titles, no emoji; `HrZonesCard` polarisation accordion and `FormTrendCard:47-50` caption move to topics; `FtpLthrCard` tables get a horizontal scroll wrapper.
- `web/tests/data/storage.test.ts` — tab load/save cases.

**Files to create:**
- `web/src/core/explanations/analysis.ts` — one topic per card, polarisation and FTP/LTHR method with technical parts (pattern: `home.ts`).

**Patterns to reuse:** Screen heading, Emoji at display time, Explanation modules (Shared Concerns); `LoadChartCard` already has its `InfoLabel` title.

**Key decisions:**
- Tab saved in `biketr_ui` next to the theme, not in the address: the spec asks for "last chosen", not a shareable link.

**Watch out for:**
- `saveThemeChoice` writes `{ theme }` alone (`storage.ts:136`), so saving the tab the same way erases the theme and vice versa → both savers merge with the current object, like `saveCoachSettings` (`:124`); test: save theme, then tab, both load.

### Task 02: activities-redesign

**Files to modify:**
- `web/src/screens/ActivitiesScreen.vue` — heading, rows with `LineIcon` from the type, name, date, distance, time; empty message.
- `web/src/screens/ActivityDetailScreen.vue` — header with sport icon, splits without `surface-variant` assumptions, KOM chip colour from the theme instead of `#ffd700` (`:116`).
- `web/src/core/activity-view.ts` — a row/header shape without the emoji prefix (`:14`), keeping `displayName`.
- `web/src/core/emoji.ts`, `web/src/components/LineIcon.vue` — icons for 🚶, 🥾, 💪 and a generic `activity` fallback.
- `web/tests/core/activity-view.test.ts`, `web/tests/core/emoji.test.ts` — new shapes and icons.

**Patterns to reuse:** Screen heading, Emoji at display time (Shared Concerns); `TYPE_EMOJI` (`core/format.ts:44`) stays the single type map, read through `emojiIcon`.

**Key decisions:**
- No distance → show time only: decided in the view helper, so the test covers it.

### Task 03: coach-redesign

**Files to modify:**
- `web/src/screens/CoachScreen.vue` — heading with `dataLine`, duration and generate/stop, notices, Dietro le quinte (`VExpansionPanels`, closed) holding context, raw output, retrieved papers, `metaLine`.
- `web/src/components/CoachWorkoutCard.vue` — title, watt, steps on page; reasoning and cited papers to an Info panel; notes to one-line notices.
- `web/src/components/CoachErrorCard.vue` — one-line notice, detail in a topic.
- `web/src/core/explanations/types.ts`, `web/src/components/InfoPanel.vue` — optional `links` (label, url, quotes) rendered after `lead`.

**Files to create:**
- `web/src/core/explanations/coach.ts` — workout "why" topic builder and error topics (pattern: `loadSourceTopic` in `training.ts`).

**Patterns to reuse:** Shared Concerns; `clipWords` (`core/text.ts`) for the page's start of the reasoning; `citedPapers`/`paperCitation`/`pubmedUrl` (`core/coach-view.ts`).

**Key decisions:**
- Links are an optional field of `Explanation`, so every existing topic stays valid.

**Watch out for:**
- The context exists only after a run starts: `coach-run.ts:35` resets it to null and `:52` fills it from the service — before the first run Dietro le quinte shows the "Nessuna richiesta ancora" line (task edge case), never a context rebuilt in the browser.
- Paper titles and quotes come from the service: render as text, never `v-html` (`CoachWorkoutCard.vue` header comment).

### Task 04: library-redesign

**Files to modify:**
- `web/src/screens/LibraryScreen.vue` — heading, PMID row, rows with citation, origin chip and passage count; the opened panel gets links, licence, text used, `dependencyLines`, passages and the remove button; removed papers unchanged.

**Patterns to reuse:** Screen heading, Emoji at display time (Shared Concerns); `library-view.ts` helpers as they are.

**Key decisions:**
- Only the template moves: the add, remove and restore flows in the script stay untouched.

### Task 05: settings-and-connect

**Files to modify:**
- `web/src/screens/SettingsScreen.vue` — heading, seven sections, help via `InfoLabel`, sticky save bar bound to `pending() !== lastSaved`, `VDialog` confirm replacing `window.confirm` (`:44`), `beforeunload` while dirty, save failure from `saveSettings`'s boolean.
- `web/src/components/CoachSettingsCard.vue` — Coach section; Ollama instructions into a topic with technical part.
- `web/src/components/NumberField.vue` — help through `InfoLabel` when given.
- `web/src/screens/ConnectScreen.vue` — centred welcome card; steps as a short list.

**Files to create:**
- `web/src/core/explanations/settings.ts` — field help and Ollama topic.

**Patterns to reuse:** Shared Concerns; `onBeforeRouteLeave` already in place (`SettingsScreen.vue:44`).

**Key decisions:**
- The dialog resolves the guard's promise: the router waits for "Esci senza salvare" or "Resta".

**Watch out for:**
- `disconnect` (`app/session.ts:97-101`) restarts the session without leaving the route, so the leave guard never fires → disconnect asks the same dialog itself while dirty.
- `saveSettings` returns false on a blocked storage (`storage.ts:61`) and the screen ignores it today → show the error and keep the bar.
