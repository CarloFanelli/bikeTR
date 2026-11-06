# Immagine del servizio Coach: contiene solo Python e i pacchetti. Il codice è
# montato da compose.yaml in /app, quindi una modifica al codice richiede solo
# `docker compose up -d --force-recreate`; un cambio di requirements.txt richiede
# `docker compose up -d --build`.
FROM python:3.12-slim

# /app è montato in sola lettura: Python non deve provare a scriverci i .pyc.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
# Un solo processo (il default di uvicorn): il lucchetto delle corse salvate e i
# download in corso vivono nella sua memoria.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
