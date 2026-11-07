# Immagine del servizio Coach: contiene Python, i pacchetti e il modello di ricerca dei
# paper. Il codice è montato da compose.yaml in /app, quindi una modifica al codice richiede
# solo `docker compose up -d --force-recreate`; un cambio di requirements.txt o di questo
# file richiede `docker compose up -d --build`.
FROM python:3.12-slim

# /app è montato in sola lettura: Python non deve provare a scriverci i .pyc.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Il modello di ricerca dei paper, scaricato qui una volta sola. Sta fuori da /app perché
# /app è coperto dal codice montato. Cambiarlo vuol dire ricodificare papers_index.json.
ENV SEARCH_MODEL=BAAI/bge-small-en-v1.5 \
    SEARCH_MODEL_DIR=/models
RUN python -c "import os; from fastembed import TextEmbedding; \
TextEmbedding(os.environ['SEARCH_MODEL'], cache_dir=os.environ['SEARCH_MODEL_DIR'])"
# Da qui in poi il modello si legge solo dal disco: senza internet la ricerca funziona, e
# una copia rovinata dà un errore invece di un nuovo download nascosto.
ENV HF_HUB_OFFLINE=1

WORKDIR /app
# Un solo processo (il default di uvicorn): il lucchetto delle corse salvate e i
# download in corso vivono nella sua memoria.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
