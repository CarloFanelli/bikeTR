"""Il modello chat del Coach, scelto in .env: Ollama (il predefinito) oppure un modello in
cloud raggiunto con il formato compatibile con OpenAI. Le impostazioni si leggono e si
controllano a ogni richiesta, prima di qualunque chiamata: un .env sbagliato dà lo stesso
messaggio in italiano ovunque, e il prossimo avvio del Coach legge quello nuovo."""

import math
import os
from dataclasses import dataclass, field

import httpx

from app import cloud, ollama
from app.errors import CoachError
from app.spending import Prices

PROVIDERS = ("ollama", "cloud")
CLOUD_SETTINGS = ("CLOUD_URL", "CLOUD_API_KEY", "CLOUD_MODEL", "CLOUD_PRICE_IN", "CLOUD_PRICE_OUT",
                  "CLOUD_SPENDING_LIMIT")


@dataclass(frozen=True)
class ChatSettings:
    provider: str   # "ollama" o "cloud"
    model: str
    url: str
    # Fuori da repr: un errore che stampa le impostazioni non mostra la chiave.
    key: str = field(default="", repr=False)
    prices: Prices | None = None   # None con Ollama: non costa nulla


def invalid(message: str) -> CoachError:
    return CoachError(500, "invalid_settings", message)


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def checked_model(name: str, setting: str) -> str:
    if len(name) > ollama.MAX_MODEL_NAME:
        raise invalid(f"Il nome del modello deve avere al massimo {ollama.MAX_MODEL_NAME} caratteri "
                      f"({setting} in .env)")
    return name


def dollars(name: str) -> float:
    raw = env(name)
    try:
        value = float(raw)
    except ValueError:
        value = math.nan
    # float() accetta anche "nan", "inf" e "1e999" (che diventa inf): non sono dollari.
    if not math.isfinite(value) or value < 0:
        raise invalid(f'{name} in .env vale "{raw}": serve un numero di dollari, 0 o più, con il punto per i decimali')
    return value


def settings() -> ChatSettings:
    """Il modello chat di .env. Senza COACH_PROVIDER: Ollama con OLLAMA_CHAT_MODEL, o qwen2.5:7b."""
    provider = env("COACH_PROVIDER").lower() or "ollama"
    if provider not in PROVIDERS:
        raise invalid(f'COACH_PROVIDER in .env vale "{env("COACH_PROVIDER")}": i valori ammessi sono '
                      f'{" e ".join(PROVIDERS)}')
    if provider == "ollama":
        model = env("OLLAMA_CHAT_MODEL") or ollama.DEFAULT_CHAT_MODEL
        return ChatSettings("ollama", checked_model(model, "OLLAMA_CHAT_MODEL"), ollama.OLLAMA_URL)
    missing = [name for name in CLOUD_SETTINGS if not env(name)]
    if missing:
        raise invalid(f"Con COACH_PROVIDER=cloud manca in .env: {', '.join(missing)}")
    prices = Prices(dollars("CLOUD_PRICE_IN"), dollars("CLOUD_PRICE_OUT"), dollars("CLOUD_SPENDING_LIMIT"))
    return ChatSettings("cloud", checked_model(env("CLOUD_MODEL"), "CLOUD_MODEL"), env("CLOUD_URL"),
                        env("CLOUD_API_KEY"), prices)


def client(chat: ChatSettings) -> httpx.AsyncClient:
    return ollama.client() if chat.provider == "ollama" else cloud.client(chat.url, chat.key)


def stream(chat: ChatSettings, chat_client: httpx.AsyncClient, messages: list):
    """Il testo della risposta man mano che arriva, poi ChatEnd (app/chat.py)."""
    if chat.provider == "ollama":
        return ollama.chat_stream(chat_client, chat.model, messages)
    return cloud.chat_stream(chat_client, chat.model, messages, chat.key)
