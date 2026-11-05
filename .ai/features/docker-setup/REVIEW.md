---
feature: docker-setup
status: DRAFT
reviewed: 2026-11-05
head: 74731b5be02f9c320518d91c3695fb3b7739d23b
---

# Review — docker-setup

**Scope**: 16 files (primary — diff since base `a66211fd`; 14 workflow artifacts under `.ai/` excluded)
**Findings**: 1 must-fix · 0 should-fix · 0 nit

## Findings

### F-1 · must-fix · bug · second renewal uses a replaced refresh token   [ADDRESSED]
**File**: `docker/auth/server.mjs:174-183`
**Issue**: `token()` reads the token file before joining the shared renewal, so a request whose read started before the previous renewal finished writing finds `renewing` already reset to `null` and starts a second renewal with the refresh token Strava has just replaced; Strava refuses it, `renew()` deletes the stored tokens (`docker/auth/server.mjs:84-87`), and the user is disconnected.
**Change**: Make the shared renewal re-read the file itself: `renew()` takes no argument, starts with `readTokens()`, returns `null` when there are none and returns them unchanged without calling Strava when the stored access token is still valid for `MIN_VALIDITY_S`, so every renewal uses the latest stored refresh token.
**Why**: REQ-22 edge case "two tabs need a renewal at the same moment → only one renewal; the stored refresh token stays valid", and the task 04 watch-out on parallel renewals. Reproduced against a simulated Strava that replaces the refresh token on each renewal: 150 simultaneous token requests at expiry disconnected the user in 5 of 6 rounds.
