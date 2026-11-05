# Strava Auth

How BikeTR connects to Strava: where the client credentials live, who holds the tokens, and how the browser gets access.

## Terms

### Auth server
The small server-side service that reads the Strava client credentials (Client ID, client secret) from `.env`, runs the OAuth login and stores the **Strava tokens**. It hands the browser short-lived access tokens; the client secret and refresh token never leave it.
_Avoid_: "backend" (reserved for the future AI-agent service, which may reuse the tokens), "proxy" (it does not forward Strava API calls).

### Strava tokens
The refresh token and the access token (with its expiry) obtained by authorizing BikeTR on Strava; held by the **Auth server**, the refresh token is replaced on each renewal. Distinct from the client credentials (Client ID and client secret), which come from `.env` and identify the app, not the user.
_Avoid_: "keys" (ambiguous between credentials and tokens), "secret" for anything but the client secret.

## Decisions

- **Browser calls Strava directly with short-lived access tokens**: only login and token renewal go through the auth server, not every Strava API call. Why: smallest change for a single-user app reachable only from localhost; the future agent can still reuse the server-held tokens.
