"""Il modello di ricerca dentro il servizio Coach: funziona senza internet, si carica una
volta sola anche con due richieste insieme, e mentre codifica le altre richieste vanno avanti."""

import asyncio
import os
import threading
import time

import numpy as np

from app import search


def test_the_real_model_encodes_a_query_offline_in_under_a_second():
    # HF_HUB_OFFLINE=1 (Dockerfile): il modello si legge solo dal disco, mai da internet.
    assert os.environ["HF_HUB_OFFLINE"] == "1"
    search.model()
    started = time.monotonic()
    vector = asyncio.run(search.encode("FTP 250 W, forma -12, 60 minuti: soglia o fondo lento?"))
    assert time.monotonic() - started < 1
    assert len(vector) == 384 and all(isinstance(x, float) for x in vector)


def test_text_beyond_the_model_limit_counts_as_cut():
    assert not search.cut("Polarized training in well-trained cyclists")
    assert search.cut("watt " * 600)


def test_two_searches_at_once_load_the_model_once(monkeypatch):
    loads = []

    def slow_load(*args, **kwargs):
        loads.append(args)
        time.sleep(0.2)
        return object()
    monkeypatch.setattr(search, "_model", None)
    monkeypatch.setattr(search, "TextEmbedding", slow_load)
    threads = [threading.Thread(target=search.model) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(loads) == 1


def test_other_requests_go_on_while_a_query_is_encoded(monkeypatch):
    release = threading.Event()

    class BusyModel:
        """Finisce di codificare solo quando il test lo lascia andare; ricorda se è successo."""
        released = None

        def embed(self, texts):
            self.released = release.wait(2)
            return [np.zeros(3) for _ in texts]
    busy = BusyModel()
    monkeypatch.setattr(search, "_model", busy)

    async def go():
        encoding = asyncio.create_task(search.encode("query"))
        await asyncio.sleep(0.05)
        # Un'altra richiesta: arriva qui solo se la codifica non tiene fermo il servizio.
        release.set()
        return await encoding
    assert asyncio.run(go()) == [0.0, 0.0, 0.0]
    assert busy.released is True
