# Docker

How BikeTR runs locally with Docker Compose: the services, how they reach each other, and what a restart picks up.

## Gotchas

- **nginx template changes need a web restart**: nginx builds its configuration from `docker/nginx/default.conf.template` only when the `web` container starts, and `docker compose up -d` does not restart a container when only a mounted file changed. After editing the template, or pulling a version that changes it, run `docker compose restart web`; until then new routes answer 404.
