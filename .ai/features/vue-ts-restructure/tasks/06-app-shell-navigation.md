# Task 06: app-shell-navigation

## Objective

The new app opens next to today's app: the "Collega Strava" screen when not connected, otherwise a sidebar with the five sections, Impostazioni and the Strava status, which can shrink to icons. Each section has its own address, and the screens are built from one component library.

## Context

**Satisfies**: REQ-12, REQ-13, REQ-14, REQ-15, REQ-18

Each later screen task fills one section of this shell. Today's app stays the default page until Task 12, so BikeTR is fully usable while the new screens are built. A section not yet rebuilt says so and links to today's app.

## Depends on

- Task 03

## Expected Behavior

- Not connected: only the "Collega Strava" screen, as today; connecting works from it.
- Connected: a sidebar lists Home, Allenamento, Analisi, Attività and Coach AI, with Impostazioni and the Strava connection status at its bottom.
- A button shrinks the sidebar to icons, each showing its name on hover; the choice is kept after a reload.
- Each section has its own address: reloading reopens it, and the browser's Back returns to the previous section; an unknown address opens Home.
- Cards, tables, buttons, form fields and tabs come from one component library.

## Acceptance Criteria

- [ ] When not connected, only the "Collega Strava" screen shows, and connecting from it works (REQ-12, REQ-13)
- [ ] The sidebar lists the five sections, with Impostazioni and the Strava connection status at its bottom (REQ-13)
- [ ] The shrink button reduces the sidebar to icons with names on hover, and the choice survives a reload (REQ-14)
- [ ] Each section has its own address; reload reopens it and Back returns to the previous one (REQ-15)
- [ ] Shared cards, tables, buttons, form fields and tabs come from one component library (REQ-18)

## Edge Cases

- Not connected to Strava → only the "Collega Strava" screen, as today; no sidebar (REQ-13 from the spec edge-case table)
- Very long athlete name in the status → cut with "…"; full name on hover (REQ-13)
- Saved sidebar choice missing or unreadable → sidebar opens expanded (REQ-14)
- Sidebar shrunk → screens and charts use the freed width (REQ-14)
- Two tabs open, sidebar shrunk in one → the other follows the choice at its next reload (REQ-14)
- Unknown address (e.g. a typo) → opens Home (REQ-15)
- Two tabs on different screens → each keeps its own screen (REQ-15)
- Strava unreachable while loading → today's error message, in the new layout (REQ-11)
- Strava access revoked on strava.com → today's reconnect message (REQ-12)
- N/A — empty, network, concurrent, permission: appearance only (REQ-18)
- Connecting to Strava from the new app before the switch → returns to today's app; from Task 12 on it returns to the new app (REQ-12 · from code)

## Notes from implementation

- **REQ-18 / AC 5 — divergence**: the plan named PrimeVue as the one component library → the new app uses Vuetify 4 (MIT), with the Material Design Icons as SVG paths (`@mdi/js`, Apache-2.0), and PrimeVue is removed. PrimeVue 5, installed by Task 01, needs a licence key since July 2026: without it every page shows a red "licence cannot be verified" notice, and anyone who runs the project without their own key would see it. `ARCHITECTURE.md` now names Vuetify. Agreed in /dev, 2026-11-07.
