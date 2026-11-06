# Task 03: ride-download

## Objective

The Coach service keeps an up-to-date copy of your latest rides and their **ride details**, downloading each ride's details only once, and deletes everything when you disconnect from Strava.

## Context

**Satisfies**: REQ-6, REQ-7, REQ-9, REQ-10

The service asks the **Auth server** for an access token; the client secret and refresh token stay there. This is the first time ride data is stored on the server, so the saved rides follow the connection: they belong to one athlete, survive restarts and disappear on Disconnect. The Coach request that uses them arrives in Task 04, so this task is verified against a simulated Strava.

## Depends on

- Task 02

## Expected Behavior

- On each Coach request the service downloads the latest 60 activities with an access token from the Auth server.
- It downloads ride details for any of the latest 40 rides it has not saved yet, reports progress, and keeps them across restarts.
- When Strava can't be reached, it uses the last saved rides and says from when.
- "Disconnetti da Strava" also deletes the saved rides and ride details.
- Saved data contains no tokens and lives only in a Docker volume.

## Acceptance Criteria

- [ ] A request downloads the 60 latest activities with a token obtained from the Auth server (REQ-6)
- [ ] The first request downloads details for the latest 40 rides; the next makes one Strava request plus one per new ride (REQ-7)
- [ ] After `docker compose down` and `up`, saved ride details are reused without downloading again (REQ-7)
- [ ] After an FTP change, a request makes no detail downloads and its training load uses the new FTP (REQ-9)
- [ ] Disconnecting from Strava deletes every saved ride and ride detail (REQ-10)
- [ ] Strava unreachable with saved rides → the saved ones are used and their download date is reported (REQ-6)

## Edge Cases

- Strava unreachable, erroring or over its request limit → saved rides with their date; with none saved, "Strava non raggiungibile, riprova più tardi" (REQ-6 from the spec edge-case table)
- Strava refuses the access (revoked on strava.com) → "Collega di nuovo Strava"; nothing else downloaded (REQ-6)
- Auth server unreachable → same wording as the main page's login-service message (REQ-6)
- No activities at all → nothing to download, nothing fails (REQ-6)
- Connected athlete differs from the saved rides' athlete → saved rides and details discarded before use, then downloaded again (REQ-6)
- 41st most recent ride or older → summary figures only; no details downloaded (REQ-7)
- A detail download fails or hits Strava's limit → that ride uses summary figures this time and is retried next request; the count of rides on summaries is reported (REQ-7)
- Ride with neither power nor heart-rate data → recorded as having no details; not downloaded again (REQ-7)
- Saved details unreadable or corrupted → treated as missing and downloaded again; no crash (REQ-7)
- Two requests need the same new ride → each ride is saved once and the saved data stays readable (REQ-7)
- Request abandoned during the detail downloads → details already downloaded are kept (REQ-7)
- FTP changes between two requests → the second request makes zero detail downloads (REQ-9)
- Coach service not running during Disconnect → Disconnect still completes; saved rides stay until the next Disconnect or `docker compose down -v` (REQ-10)
- Disconnect while a request is downloading → the request stops; nothing it downloaded is kept (REQ-10)
- Strava's ride list includes start coordinates, route maps and titles → the service saves only the figures the Coach reads: no locations, maps or titles (REQ-6 · from code)
