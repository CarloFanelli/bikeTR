# Task 02: auth-server-typescript

## Objective

The **Auth server** is written in TypeScript and behaves exactly as today: login, connection status, access token and logout answer the browser and the **Coach service** as before.

## Context

**Satisfies**: REQ-1, REQ-2, REQ-25

The Auth server is small and independent of the screens, so it moves right after the toolchain and its type check. It keeps running without third-party packages (recorded decision), and the **Strava tokens** it already saved must keep working.

## Depends on

- Task 01

## Expected Behavior

- The Auth server's code is TypeScript and is covered by the strict type check.
- Login, status, token and logout keep their addresses and answers, for the browser and for the Coach service.
- The Strava connection saved before the change keeps working; nobody has to reconnect.
- The client secret and the refresh token never reach the browser.

## Acceptance Criteria

- [ ] The Auth server's code is TypeScript and passes the strict type check with zero errors (REQ-1, REQ-2)
- [ ] Login, status, token and logout answer exactly as before, for the browser and for the Coach service (REQ-1)
- [ ] An existing Strava connection keeps working after the change, with no reconnect (REQ-25)
- [ ] The Auth server still runs without third-party packages (REQ-1)

## Edge Cases

- Many downloads ask for a token at once → the Auth server renews once and all of them get the same token (its current behavior) (REQ-21 from the spec edge-case table)
- A tab of the old version still open after the switch → both read and write the same data formats; nothing is corrupted (REQ-25)

## Notes from implementation

- **Impacts Task 02**: the `app` container does not mount `docker/auth` yet: the plan placed that mount in the web toolchain task, but nothing used it there. Add `./docker/auth:/workspace/docker/auth:ro` to the `app` service together with `web/tsconfig.auth.json`, and check that `/@fs/workspace/docker/auth/…` stays refused. /dev, 2026-11-06.
