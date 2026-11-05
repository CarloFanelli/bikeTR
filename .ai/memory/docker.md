# Docker

How BikeTR runs locally with Docker Compose: the services, how they reach each other, and what a restart picks up.

## Gotchas

- **Mounted config and server code need a recreate**: nginx builds its configuration from `docker/nginx/default.conf.template` and the auth server loads `docker/auth/server.mjs` only when their containers start, and `docker compose up -d` does not restart a container when only a mounted file changed. After editing files under `docker/`, or pulling a version that changes them, run `docker compose up -d --force-recreate` (what the README tells users); until then new routes answer 404.
- **Docker's DNS ignores `extra_hosts`**: nginx resolves upstreams through Docker's DNS (`resolver 127.0.0.11`), which does not read the container's `/etc/hosts`, so an `extra_hosts` entry has no effect on `proxy_pass` targets. `host.docker.internal` resolves only because Docker Desktop's own DNS knows it; the host-Ollama option therefore needs Docker Desktop and fails on a plain Linux Docker Engine.
