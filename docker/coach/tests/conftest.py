"""Ogni test parte senza le impostazioni del modello chat di .env: il Coach usa Ollama con
il modello predefinito, qualunque cosa ci sia nel .env di chi lancia i test, e nessun test
può usare una chiave vera."""

import pytest

from app import provider


@pytest.fixture(autouse=True)
def default_chat_settings(monkeypatch):
    for name in ("COACH_PROVIDER", "OLLAMA_CHAT_MODEL", *provider.CLOUD_SETTINGS):
        monkeypatch.delenv(name, raising=False)
