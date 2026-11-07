"""Il modello chat scelto in .env: senza impostazioni Ollama con qwen2.5:7b, con il solo
OLLAMA_CHAT_MODEL quel modello, con COACH_PROVIDER=cloud l'endpoint, la chiave e il modello."""

import pytest

from app import ollama, provider
from app.errors import CoachError
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, CLOUD_URL


def settings(monkeypatch, **env) -> provider.ChatSettings:
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return provider.settings()


def test_no_settings_means_ollama_with_qwen_7b(monkeypatch):
    assert settings(monkeypatch) == provider.ChatSettings("ollama", "qwen2.5:7b", ollama.OLLAMA_URL)


def test_an_older_env_with_only_the_ollama_model_keeps_working(monkeypatch):
    assert settings(monkeypatch, OLLAMA_CHAT_MODEL=" llama3:8b ").model == "llama3:8b"


def test_provider_name_ignores_case_and_spaces(monkeypatch):
    assert settings(monkeypatch, COACH_PROVIDER=" Ollama ").provider == "ollama"


def test_cloud_settings(monkeypatch):
    assert settings(monkeypatch, **CLOUD_ENV) == provider.ChatSettings("cloud", CLOUD_MODEL, CLOUD_URL, CLOUD_KEY)


def test_cloud_ignores_the_ollama_model(monkeypatch):
    assert settings(monkeypatch, **CLOUD_ENV, OLLAMA_CHAT_MODEL="x" * 101).model == CLOUD_MODEL


def test_a_wrong_setting_is_a_service_error_with_its_own_code(monkeypatch):
    with pytest.raises(CoachError) as e:
        settings(monkeypatch, COACH_PROVIDER="openai")
    assert (e.value.status, e.value.code) == (500, "invalid_settings")
