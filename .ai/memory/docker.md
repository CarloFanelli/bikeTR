# Docker

How BikeTR runs locally with Docker Compose: the services, how they reach each other, and what a restart picks up.

## Gotchas

- **Mounted config and server code need a recreate**: nginx builds its configuration from `docker/nginx/default.conf.template` and the auth server loads `docker/auth/server.mjs` only when their containers start, and `docker compose up -d` does not restart a container when only a mounted file changed. After editing files under `docker/`, or pulling a version that changes them, run `docker compose up -d --force-recreate` (what the README tells users); until then new routes answer 404.
- **Docker's DNS ignores `extra_hosts`**: nginx resolves upstreams through Docker's DNS (`resolver 127.0.0.11`), which does not read the container's `/etc/hosts`, so an `extra_hosts` entry has no effect on `proxy_pass` targets. `host.docker.internal` resolves only because Docker Desktop's own DNS knows it; the host-Ollama option therefore needs Docker Desktop and fails on a plain Linux Docker Engine.
- **A missing single-file bind mount becomes a folder**: mounting `./some-file.json` into a container when the file does not exist makes Docker create an empty folder with that name in the project, and `git restore` of the file then fails. To give a service one project file, let it fetch the file from nginx (`http://web/<file>` with header `Host: localhost`, since nginx refuses other host names), as the Coach service does for `papers_index.json`.
- **nginx closes an idle live-reload connection after 60 seconds**: the WebSocket between the page and Vite stays silent when nothing changes, and nginx's default `proxy_read_timeout` (60 s) drops it; Vite's client then waits for the server and reloads the page, losing unsaved form input. The `location /` proxying to the `app` service keeps `proxy_read_timeout 1d`.
- **Don't block dot-paths in front of Vite**: Vite serves pre-bundled packages under `/node_modules/.vite/deps/`, so a "deny hidden files" rule such as `location ~ /\.` breaks the app. Hidden project files stay safe because the `app` container mounts only `web/` and nginx serves nothing else from the project folder except `/papers_index.json`.
