# Task 02: top-bar-shell

## Objective

A top bar replaces the sidebar: it links the six sections, holds an account menu with Impostazioni, Esporta allenamenti and the theme choice, shows export progress anywhere, and collapses into a menu button on a phone.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-8

The shell frames every screen, so it comes right after the theme. Moving the export out of Home here frees Home for the **Daily overview** in Task 05.

## Depends on

- Task 01

## Expected Behavior

- A top bar shows "BikeTR" and links Home, Allenamento, Analisi, Attività, Coach AI and Libreria; the current section is highlighted.
- At the right, the athlete's picture (or initials) opens an account menu: full name with "Collegato a Strava", Impostazioni, Esporta allenamenti (opens the existing export window) and a three-way theme choice "Sistema / Chiaro / Scuro".
- A theme choice applies at once and is still applied after reload.
- While an export runs, the top bar shows its progress on every screen; a failed export shows a dismissable notice there.
- Below 768 px the six sections move into a menu button that opens the full list; picking a section closes it.
- The sidebar and its collapse button are gone; the loading message, error notices and Collega Strava screen still show as today.

## Acceptance Criteria

- [ ] The top bar links all six sections and highlights the current one, also on detail screens of a section (REQ-2)
- [ ] The account menu shows name, Strava connection, Impostazioni, Esporta allenamenti and the theme choice (REQ-3)
- [ ] Picking "Chiaro", "Scuro" or "Sistema" applies at once and survives a reload (REQ-8)
- [ ] An export started on Home keeps showing its progress in the top bar after moving to Analisi (REQ-4)
- [ ] At 767 px wide the sections sit behind a menu button; at 768 px the full bar shows (REQ-5)
- [ ] Top bar and menus use line icons, no emoji (REQ-1)

## Edge Cases

- A section's screen fails to load its code → top bar stays visible and usable; the error shows in the content area (REQ-2)
- Athlete opens an unknown address → redirects to Home as today; top bar highlights Home (REQ-2)
- Athlete has no profile picture → account menu shows initials of first and last name (REQ-3)
- Very long athlete name → shortened with "…" in the top bar; full name inside the account menu (REQ-3)
- Strava disconnected in another tab → next Strava call fails as today, the connect screen appears, in the active theme (REQ-3)
- Export started, athlete changes screen → progress stays in the top bar until the export ends or fails (REQ-4)
- Export fails midway → top bar progress replaced by an error notice the athlete can dismiss (REQ-4)
- Width exactly 768 px → full top bar shown; menu button appears from 767 px down (REQ-5)
- Menu open, athlete picks a section → menu closes and the section opens (REQ-5)
- Saved theme value is unreadable or unknown → treated as "Sistema" (REQ-8)
- Browser storage blocked (private window) → choice applies for this visit, falls back to "Sistema" after reload (REQ-8)
- Two tabs open, theme changed in one → the other tab picks up the choice on its next reload (REQ-8)
