"""Ogni test parte senza le impostazioni del modello chat di .env: il Coach usa Ollama con
il modello predefinito, qualunque cosa ci sia nel .env di chi lancia i test, e nessun test
può usare una chiave vera. Il totale della spesa cloud sta nella cartella del test, mai nel
volume /data del Coach."""

import pytest

from app import main, provider
from app.spending import Spending


@pytest.fixture(autouse=True)
def default_chat_settings(monkeypatch):
    for name in ("COACH_PROVIDER", "OLLAMA_CHAT_MODEL", *provider.CLOUD_SETTINGS):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(autouse=True)
def cloud_spending(monkeypatch, tmp_path) -> Spending:
    spending = Spending(tmp_path / "spending.json")
    monkeypatch.setattr(main, "cloud_spending", spending)
    return spending
