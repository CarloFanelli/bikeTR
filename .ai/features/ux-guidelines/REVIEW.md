---
feature: ux-guidelines
status: APPROVED
reviewed: 2026-11-11
head: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Review — ux-guidelines

**Scope**: 5 files re-verified (the files of the four addressed findings; nothing was committed since the previous review, so git can't isolate the delta), on top of the 42 files the previous pass reviewed out of 87 in the diff since base `92c9a49e`; 38 workflow artifacts under `.ai/` excluded
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · should-fix · bug · reduced motion freezes the loading spinners   [ADDRESSED]
**File**: `web/src/app/fonts.css:28-36`
**Issue**: The reduced-motion rule sets `animation: none` on every element, so the spinning ring of a loading button ("Riprova", "Aggiorna con streams") and the export chip stand still and stop showing that work is running.
**Change**: Right after the rule, inside the same media query, give `.v-progress-circular--indeterminate` and its children back their `animation` (`animation: revert-layer`), so only panels, menus, placeholders and page changes lose their motion.
**Why**: REQ-5 lists panels, menus, placeholders and page changes. A loading indicator is essential motion, and REQ-9's "Riprova" relies on it to show the retry is running.

### F-2 · nit · dup · day-and-month date format written twice   [ADDRESSED]
**File**: `web/src/core/training-view.ts:132-133`
**Issue**: `loadSummary` builds the "1 settembre" date inline, the same `toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })` as `dayMonth` in `web/src/core/analysis-view.ts:21`.
**Change**: Move `dayMonth` to `web/src/core/format.ts` beside `fmtDate`, export it, and use it in both summaries.

### F-3 · nit · convention · Home helpers header no longer true   [ADDRESSED]
**File**: `web/src/core/home.ts:1-2`
**Issue**: The header says this is what Home shows (data precision, profile, records and totals), but those now appear in Analisi's Profilo e dati tab, and Home uses only the week tiles and the last ride from here.
**Change**: Say the file holds the texts of Home (week tiles, last ride) and of the Profilo e dati tab (data precision, profile, records, totals).

### F-4 · nit · convention · Home explanations header no longer true   [ADDRESSED]
**File**: `web/src/core/explanations/home.ts:1-2`
**Issue**: The header calls these "Spiegazioni di Home", but level, data precision and the FTP/LTHR method are now opened from the Profilo e dati tab.
**Change**: Say they explain Home (form, readiness without data) and the Profilo e dati tab (level, data precision, how FTP and LTHR are estimated).
