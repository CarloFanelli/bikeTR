"""Il modello chat scelto in .env: senza impostazioni Ollama con qwen2.5:7b, con il solo
OLLAMA_CHAT_MODEL quel modello, con COACH_PROVIDER=cloud l'endpoint, la chiave, il modello,
i prezzi e il tetto di spesa."""

import pytest

from app import ollama, provider
from app.errors import CoachError
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, CLOUD_PRICES, CLOUD_URL


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
    assert settings(monkeypatch, **CLOUD_ENV) == provider.ChatSettings("cloud", CLOUD_MODEL, CLOUD_URL, CLOUD_KEY,
                                                                       CLOUD_PRICES)


def test_cloud_ignores_the_ollama_model(monkeypatch):
    assert settings(monkeypatch, **CLOUD_ENV, OLLAMA_CHAT_MODEL="x" * 101).model == CLOUD_MODEL


def test_a_wrong_setting_is_a_service_error_with_its_own_code(monkeypatch):
    with pytest.raises(CoachError) as e:
        settings(monkeypatch, COACH_PROVIDER="openai")
    assert (e.value.status, e.value.code) == (500, "invalid_settings")


def test_ollama_ignores_the_cloud_prices_still_in_env(monkeypatch):
    env = {k: v for k, v in CLOUD_ENV.items() if k != "COACH_PROVIDER"}
    assert settings(monkeypatch, **env).prices is None


def test_prices_accept_zero_and_decimals(monkeypatch):
    chat = settings(monkeypatch, **{**CLOUD_ENV, "CLOUD_PRICE_IN": "0", "CLOUD_PRICE_OUT": "0.25",
                                    "CLOUD_SPENDING_LIMIT": "2.5"})
    assert (chat.prices.input, chat.prices.output, chat.prices.limit) == (0, 0.25, 2.5)


@pytest.mark.parametrize("name,raw", [
    ("CLOUD_PRICE_IN", "-1"), ("CLOUD_PRICE_OUT", "tre"), ("CLOUD_SPENDING_LIMIT", "nan"),
    ("CLOUD_SPENDING_LIMIT", "inf"), ("CLOUD_PRICE_IN", "1e999"), ("CLOUD_PRICE_IN", "3,5"),
])
def test_a_price_or_limit_that_is_not_a_number_of_dollars_is_refused(monkeypatch, name, raw):
    with pytest.raises(CoachError) as e:
        settings(monkeypatch, **{**CLOUD_ENV, name: raw})
    assert (e.value.code, e.value.message) == (
        "invalid_settings", f'{name} in .env vale "{raw}": serve un numero di dollari, 0 o più, con il punto per i decimali')
