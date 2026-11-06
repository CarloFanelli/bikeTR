#!/bin/sh
# Avvio del container app: installa i pacchetti npm quando package-lock.json è
# cambiato (primo avvio, o dopo un git pull), poi esegue il comando ricevuto
# (di default il server Vite). I pacchetti stanno in un volume Docker: quelli
# installati sul computer non entrano mai nel container.
set -e
hash=$(sha256sum package-lock.json | cut -d ' ' -f 1)
stamp=node_modules/.biketr-lock-sha256
if [ "$(cat "$stamp" 2>/dev/null)" != "$hash" ]; then
  echo "Installo i pacchetti npm di package-lock.json..."
  if ! npm ci --no-audit --no-fund; then
    echo "Pacchetti npm non installati: al primo avvio e dopo un aggiornamento serve la connessione a internet." >&2
    exit 1
  fi
  echo "$hash" > "$stamp"
fi
exec "$@"
