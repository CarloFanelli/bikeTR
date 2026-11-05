# Task 04: strava-auth-server

## Objective

The Strava Client ID and client secret come only from `.env`; "Connect to Strava" runs through the auth server, which keeps the Strava tokens across restarts and hands the browser short-lived access tokens; every Strava screen works as before.

## Context

**Satisfies**: REQ-1, REQ-3, REQ-5, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27

Today the browser stores the client secret and refresh token and talks to Strava's token endpoint itself. This task moves login and token renewal to the auth server, started by the same command. The browser keeps calling the Strava API directly with access tokens (user decision). Old credentials left in the browser are deleted.

## Depends on

- Task 02

## Expected Behavior

- The start command also starts the auth server; it reads the Client ID and client secret from `.env`.
- The app has no form for the Client ID or secret. When credentials are missing (or still placeholders), the app names the missing `.env` settings and says to run the start command again.
- When credentials are present but the user is not connected, the app shows a "Connect to Strava" button; it leads to Strava's authorization page and back into the app, connected.
- The browser asks the auth server for an access token; it gets one valid for at least one more minute, renewed with Strava when needed, saving any new refresh token Strava returns.
- The Strava tokens persist across stop and restart; the full-cleanup command removes them.
- "Disconnect" deletes the server-held Strava tokens and shows "Connect to Strava".
- On first load, the old version's Strava credentials and tokens in browser storage are deleted; all other browser data stays.
- Home, training, analysis, activities, activity detail, segment predictions and export work as before once connected.
- The client secret and refresh token never appear in served files, responses, browser storage or logs.

## Acceptance Criteria

- [ ] With credentials in `.env`, clicking "Connect to Strava" and approving lands the user in the app, connected (REQ-19, REQ-20)
- [ ] No page, response, browser storage entry or log line contains the client secret or refresh token (REQ-19, REQ-21)
- [ ] An access token close to expiry is renewed; a valid one is returned within 200 ms without calling Strava (REQ-21, REQ-22)
- [ ] After stop and start, the user is still connected without authorizing again (REQ-23)
- [ ] "Disconnect" removes the server-held tokens; the app then shows "Connect to Strava" (REQ-24)
- [ ] Old `biketr_strava` credentials in browser storage are deleted on first load; other keys remain (REQ-25)
- [ ] With credentials missing from `.env`, the app starts and names the missing settings (REQ-26, REQ-3)

## Edge Cases

- `.env` absent → the app starts and shows the missing-Strava-credentials message (REQ-3)
- User looks for the old Client ID / secret form → not present; the setup screen explains which `.env` settings to fill in (REQ-19)
- Wrong Client ID or secret in `.env` → Strava rejects the authorization; the app shows Strava's error and says to check `.env` (REQ-19)
- User denies authorization on Strava → back in the app with an "authorization denied" message and the Connect button; nothing stored (REQ-20)
- User reloads right after returning from Strava (authorization code reused) → no error; the app loads with the existing connection (REQ-20)
- Strava unreachable during the first authorization → error message plus the Connect button; nothing stored (REQ-20)
- A return from Strava without the random `state` value issued when the user clicked Connect, or with a different one → rejected; nothing stored; the app shows the Connect button (REQ-20 · from code)
- Browser asks for an access token while not connected → the auth server answers "not connected"; the app shows Connect to Strava (REQ-21)
- Auth server not running or crashed → the page loads, shows "auth server unreachable" and suggests checking the Docker logs (REQ-21)
- Two tabs need a renewal at the same moment → only one renewal; both get the same valid access token; the stored refresh token stays valid (REQ-22)
- User revoked BikeTR's access in Strava's settings → renewal fails; stored tokens deleted; the app shows Connect to Strava (REQ-22)
- Strava down during a renewal → connection error shown; stored tokens kept; the next request retries (REQ-22)
- Long export (throttled over many minutes) outlives the access token → export obtains a renewed token and continues (REQ-22)
- Stored token file corrupted or unreadable → treated as not connected; the app shows Connect to Strava; no crash (REQ-23)
- Full-cleanup command run → stored tokens removed; Connect needed again (REQ-23, REQ-5)
- Disconnect clicked when already disconnected → no error (REQ-24)
- Disconnect in one tab while another tab is open → the other tab shows Connect to Strava on its next token request (REQ-24)
- After Disconnect, a tab that was already open keeps the access token it holds and can read Strava until it reloads or the token expires (at most 6 hours) → expected; documented in the README (REQ-24 · from code)
- Browser holds no old credentials → nothing happens (REQ-25)
- Browser holds other old data (settings, FTP history, caches, Coach settings) → kept untouched (REQ-25)
- `.env` has only one of Client ID / client secret, or still the `.env.example` placeholders → treated as missing; the message names the missing setting (REQ-26)
- Strava credentials added to `.env` while everything is running → take effect after running the start command again; the message says so (REQ-26)
- Activity detail page opened from a bookmark while not connected → redirects to the main page showing Connect to Strava (REQ-27)
- Strava rate limit reached → existing error messages unchanged (REQ-27)
