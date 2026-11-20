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
# Come arrivano i paper alla bozza: fixed, la ricerca del codice prima della bozza; model, le
# ricerche che il modello chat chiede con lo strumento search_papers.
SEARCH_MODES = ("fixed", "model")
# Le etichette delle corse recenti nel prompt: off, nessuna; rule, quelle della regola di app/labels.py;
# model, quelle del modello che etichetta.
RIDE_LABELS = ("off", "rule", "model")
# Gli strumenti sulle uscite (app/ride_tools.py) offerti al modello chat: off, nessuno; on, in ogni bozza.
RIDE_TOOLS = ("off", "on")
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
    search_mode: str = "fixed"
    ride_labels: str = "off"
    # Il modello che etichetta le corse: solo con ride_labels "model".
    label: "ChatSettings | None" = None
    ride_tools: str = "off"


def invalid(message: str) -> CoachError:
    return CoachError(500, "invalid_settings", message)


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def checked_model(name: str, setting: str) -> str:
    if len(name) > ollama.MAX_MODEL_NAME:
        raise invalid(f"Il nome del modello deve avere al massimo {ollama.MAX_MODEL_NAME} caratteri "
                      f"({setting} in .env)")
    return name


def checked_url(url: str, setting: str = "CLOUD_URL") -> str:
    """Senza http:// o https:// ogni richiesta fallirebbe con un errore di connessione che
    non nomina l'impostazione."""
    try:
        parsed = httpx.URL(url)
    except httpx.InvalidURL:
        parsed = None
    if parsed is None or parsed.scheme not in ("http", "https") or not parsed.host:
        raise invalid(f'{setting} in .env vale "{url}": serve un indirizzo completo che inizia con https://, '
                      "per esempio https://api.anthropic.com/v1/")
    return url


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


def search_mode() -> str:
    mode = env("COACH_SEARCH_MODE").lower() or "fixed"
    if mode not in SEARCH_MODES:
        raise invalid(f'COACH_SEARCH_MODE in .env vale "{env("COACH_SEARCH_MODE")}": i valori ammessi sono '
                      f'{" e ".join(SEARCH_MODES)}')
    return mode


def ride_labels() -> str:
    labels = env("COACH_RIDE_LABELS").lower() or "off"
    if labels not in RIDE_LABELS:
        raise invalid(f'COACH_RIDE_LABELS in .env vale "{env("COACH_RIDE_LABELS")}": i valori ammessi sono '
                      f'{", ".join(RIDE_LABELS[:-1])} e {RIDE_LABELS[-1]}')
    return labels


def ride_tools() -> str:
    tools = env("COACH_RIDE_TOOLS").lower() or "off"
    if tools not in RIDE_TOOLS:
        raise invalid(f'COACH_RIDE_TOOLS in .env vale "{env("COACH_RIDE_TOOLS")}": i valori ammessi sono '
                      f'{" e ".join(RIDE_TOOLS)}')
    return tools


def label_settings() -> ChatSettings:
    """Il modello che etichetta le corse, con COACH_RIDE_LABELS=model: LABEL_PROVIDER (ollama se manca)
    e LABEL_MODEL. In cloud indirizzo e chiave sono quelli del modello chat se mancano i suoi
    (LABEL_CLOUD_URL, LABEL_CLOUD_API_KEY), i prezzi suoi, il tetto di spesa lo stesso."""
    provider = env("LABEL_PROVIDER").lower() or "ollama"
    if provider not in PROVIDERS:
        raise invalid(f'LABEL_PROVIDER in .env vale "{env("LABEL_PROVIDER")}": i valori ammessi sono '
                      f'{" e ".join(PROVIDERS)}')
    if not env("LABEL_MODEL"):
        raise invalid("Manca in .env: LABEL_MODEL, il modello che etichetta le corse")
    model = checked_model(env("LABEL_MODEL"), "LABEL_MODEL")
    if provider == "ollama":
        return ChatSettings("ollama", model, ollama.OLLAMA_URL)
    url, key = env("LABEL_CLOUD_URL") or env("CLOUD_URL"), env("LABEL_CLOUD_API_KEY") or env("CLOUD_API_KEY")
    missing = [name for name, value in (("LABEL_CLOUD_URL", url), ("LABEL_CLOUD_API_KEY", key),
                                        ("LABEL_PRICE_IN", env("LABEL_PRICE_IN")),
                                        ("LABEL_PRICE_OUT", env("LABEL_PRICE_OUT")),
                                        ("CLOUD_SPENDING_LIMIT", env("CLOUD_SPENDING_LIMIT"))) if not value]
    if missing:
        raise invalid(f"Con LABEL_PROVIDER=cloud manca in .env: {', '.join(missing)}")
    prices = Prices(dollars("LABEL_PRICE_IN"), dollars("LABEL_PRICE_OUT"), dollars("CLOUD_SPENDING_LIMIT"))
    return ChatSettings("cloud", model, checked_url(url, "LABEL_CLOUD_URL" if env("LABEL_CLOUD_URL") else "CLOUD_URL"),
                        key, prices)


def settings() -> ChatSettings:
    """Il modello chat di .env, con il modo di ricerca dei paper (COACH_SEARCH_MODE, fixed se manca), le
    etichette delle corse (COACH_RIDE_LABELS, off se manca) e gli strumenti sulle uscite (COACH_RIDE_TOOLS,
    off se manca).
    Senza COACH_PROVIDER: Ollama con OLLAMA_CHAT_MODEL, o qwen2.5:7b."""
    mode, labels, tools = search_mode(), ride_labels(), ride_tools()
    label = label_settings() if labels == "model" else None
    provider = env("COACH_PROVIDER").lower() or "ollama"
    if provider not in PROVIDERS:
        raise invalid(f'COACH_PROVIDER in .env vale "{env("COACH_PROVIDER")}": i valori ammessi sono '
                      f'{" e ".join(PROVIDERS)}')
    if provider == "ollama":
        model = env("OLLAMA_CHAT_MODEL") or ollama.DEFAULT_CHAT_MODEL
        return ChatSettings("ollama", checked_model(model, "OLLAMA_CHAT_MODEL"), ollama.OLLAMA_URL, search_mode=mode,
                            ride_labels=labels, label=label, ride_tools=tools)
    missing = [name for name in CLOUD_SETTINGS if not env(name)]
    if missing:
        raise invalid(f"Con COACH_PROVIDER=cloud manca in .env: {', '.join(missing)}")
    prices = Prices(dollars("CLOUD_PRICE_IN"), dollars("CLOUD_PRICE_OUT"), dollars("CLOUD_SPENDING_LIMIT"))
    return ChatSettings("cloud", checked_model(env("CLOUD_MODEL"), "CLOUD_MODEL"), checked_url(env("CLOUD_URL")),
                        env("CLOUD_API_KEY"), prices, mode, labels, label, tools)


def paid(chat: ChatSettings) -> bool:
    """Se una risposta può costare: il modello chat o quello che etichetta sono in cloud."""
    return bool(chat.prices or (chat.label and chat.label.prices))


def client(chat: ChatSettings) -> httpx.AsyncClient:
    return ollama.client() if chat.provider == "ollama" else cloud.client(chat.url, chat.key)


def stream(chat: ChatSettings, chat_client: httpx.AsyncClient, messages: list, tools: list | None = None):
    """Accepted, il testo della risposta man mano che arriva e le richieste di strumenti (ToolCall),
    poi ChatEnd (app/chat.py). Gli strumenti si offrono solo quando ci sono."""
    if chat.provider == "ollama":
        return ollama.chat_stream(chat_client, chat.model, messages, tools)
    return cloud.chat_stream(chat_client, chat.model, messages, chat.key, tools)


def tool_turn(chat: ChatSettings, text: str, calls: list, answers: list[str]) -> list[dict]:
    """I messaggi di un giro con strumenti, nel formato del provider: la richiesta del modello, poi
    la risposta a ogni strumento chiesto, nell'ordine."""
    if chat.provider == "ollama":
        return ollama.tool_turn(text, calls, answers)
    return cloud.tool_turn(text, calls, answers)
