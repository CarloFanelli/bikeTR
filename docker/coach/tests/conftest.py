"""Ogni test parte senza le impostazioni del modello chat di .env: il Coach usa Ollama con
il modello predefinito, qualunque cosa ci sia nel .env di chi lancia i test, e nessun test
può usare una chiave vera. Il totale della spesa cloud sta nella cartella del test, mai nel
volume /data del Coach, come la libreria salvata, e le tracce restano in memoria, mai in Phoenix. Anche la cancellazione
delle tracce di Disconnetti si ricorda nella cartella del test e va al finto Phoenix."""

import pytest

from app import library, main, provider, tracing
from app.spending import Spending
from app.trace_deletion import TraceDeletion
from fakes import FakePhoenix, quick_sleep


@pytest.fixture(autouse=True)
def default_chat_settings(monkeypatch):
    for name in ("COACH_PROVIDER", "OLLAMA_CHAT_MODEL", *provider.CLOUD_SETTINGS):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(autouse=True)
def cloud_spending(monkeypatch, tmp_path) -> Spending:
    spending = Spending(tmp_path / "spending.json")
    monkeypatch.setattr(main, "cloud_spending", spending)
    return spending


@pytest.fixture(autouse=True)
def saved_library(monkeypatch, tmp_path) -> library.Library:
    saved = library.Library(tmp_path / "library.json")
    monkeypatch.setattr(library, "LIBRARY_FILE", saved.path)
    monkeypatch.setattr(main, "saved_library", saved)
    return saved


@pytest.fixture(autouse=True)
def phoenix(monkeypatch):
    fake = FakePhoenix()
    # Anche le tracce dei comandi, che scelgono il loro progetto, arrivano al finto Phoenix.
    monkeypatch.setattr(tracing, "phoenix", lambda: fake.received)
    yield fake
    fake.provider.shutdown()


@pytest.fixture(autouse=True)
def trace_deletion(monkeypatch, tmp_path, phoenix) -> TraceDeletion:
    deletion = TraceDeletion(tmp_path / "trace-deletion.json", phoenix.client(), sleep=quick_sleep)
    monkeypatch.setattr(main, "trace_deletion", deletion)
    return deletion
