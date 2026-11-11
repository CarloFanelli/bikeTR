---
feature: ui-redesign
status: APPROVED
reviewed: 2026-11-11
head: 92c9a49ea8eef72ec92e47b45a157aae0d44296d
---

# Review — ui-redesign

**Scope**: re-verification of the 3 addressed findings: 7 files changed by the fixes (the script listed all 46 feature files because the work is uncommitted; the others were reviewed earlier today and are unchanged since)
**Findings**: 0 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · bug · freshness row still shows an emoji   [ADDRESSED]
**File**: `web/src/components/AdviceCard.vue:25`
**Issue**: The "Perché questo allenamento" panel on Allenamento passes the advice rows through unchanged, so the "Freschezza" value reads "🟢 alta" or "🔴 bassa" (built in `web/src/core/training-view.ts:53`).
**Change**: Map every row value through `splitEmoji(value).text` before adding the readiness state, as `MonthPlan.vue:36,44` does with its `noEmoji` helper for the training-model rows.
**Why**: REQ-1 requires no emoji on Allenamento, and the Info panel opens on that screen.

### F-2 · nit · dead · unused icon import   [ADDRESSED]
**File**: `web/src/components/LineIcon.vue:5`
**Issue**: `mdiSleep` is imported but no icon name maps to it.
**Change**: Remove `mdiSleep` from the import list.

### F-3 · nit · dup · same header and button styles in both pilot screens   [ADDRESSED]
**File**: `web/src/screens/HomeScreen.vue:217-225`, `web/src/screens/TrainingScreen.vue:102-109`
**Issue**: The `.first-capital::first-letter` and `.action` rules are copied word for word in both screens, and the same button-text reset appears again as `.more` in `InfoLabel.vue:53` and `.section` in `AppTopBar.vue:147`.
**Change**: Keep one copy of each rule in `web/src/app/fonts.css`, the global stylesheet the redesign already adds, and drop the scoped copies.
