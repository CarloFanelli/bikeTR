# Strava Auth

How BikeTR connects to Strava: where the client credentials live, who holds the tokens, and how the browser gets access.

## Terms

### Auth server
The small server-side service that reads the Strava client credentials (Client ID, client secret) from `.env`, runs the OAuth login and stores the **Strava tokens**. It hands the browser short-lived access tokens; the client secret and refresh token never leave it.
_Avoid_: "backend" (generic: the **Coach service** runs on the server too and asks this server for tokens), "proxy" (it does not forward Strava API calls).

### Strava tokens
The refresh token and the access token (with its expiry) obtained by authorizing BikeTR on Strava; held by the **Auth server**, the refresh token is replaced on each renewal. Distinct from the client credentials (Client ID and client secret), which come from `.env` and identify the app, not the user.
_Avoid_: "keys" (ambiguous between credentials and tokens), "secret" for anything but the client secret.

## Decisions

- **Browser calls Strava directly with short-lived access tokens**: only login and token renewal go through the auth server, not every Strava API call; the browser asks `/auth/token` for a token right before each Strava request (`web/src/data/strava.ts`), so a long job or a tab open for hours never holds an expired one. Why: smallest change for a single-user app reachable only from localhost; the future agent can still reuse the server-held tokens.

## Gotchas

- **Scripted page loads exhaust Strava's rate limit**: every full page load downloads the athlete and the last activities from Strava again, and Strava allows 100 requests per 15 minutes per app. About 30 reloads from a headless browser (for screenshots) were enough to get `API /athlete: 429`, and the athlete's own browser shows the same error until the window resets. A scripted session should load the app once and move between sections by clicking, never with a new page load per screen.
