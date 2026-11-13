"""La spesa per il modello cloud: il costo di ogni risposta dai token e dai prezzi di .env, il
totale in un file che resta dopo un riavvio, il tetto che ferma le richieste cloud prima di
qualunque chiamata, e Ollama che non costa nulla. Il provider è simulato: nessuna spesa vera."""

import json
import subprocess
import sys
from pathlib import Path

import httpx
import pytest

from app import main
from app.errors import CoachError
from app.spending import Prices, Spending, charge, cost
from fakes import CLOUD_ENV, CLOUD_PRICES, CLOUD_URL
from test_workout import BODY, SAME_ORIGIN, events_of, make_service, post

# Con i prezzi di prova (3 e 15 dollari per milione di token): la risposta del finto
# provider (900 token letti, 42 scritti) e il costo massimo di una risposta (8.000 e 4.000).
ANSWER_COST = (900 * 3 + 42 * 15) / 1_000_000
CEILING_COST = (8000 * 3 + 4000 * 15) / 1_000_000
UNREADABLE = ('Il totale della spesa cloud in {path} non si legge: le richieste cloud restano ferme finché il file '
              'non contiene {{"total": dollari spesi}}.')


@pytest.fixture
def cloud_service(monkeypatch):
    return make_service(monkeypatch, CLOUD_ENV)


# --- Costo di una risposta ----------------------------------------------------------------

def test_cost_comes_from_tokens_and_prices_per_million():
    assert cost(CLOUD_PRICES, 900, 42) == pytest.approx(ANSWER_COST)
    assert cost(Prices(0, 0, 1), 900, 42) == 0


def test_cost_is_unknown_with_ollama_or_without_token_counts():
    assert cost(None, 900, 42) is None
    assert cost(CLOUD_PRICES, None, 42) is None and cost(CLOUD_PRICES, 900, None) is None


def test_an_answer_without_token_counts_is_charged_the_ceiling():
    assert charge(CLOUD_PRICES, None, None) == pytest.approx(CEILING_COST)
    assert charge(CLOUD_PRICES, 900, None) == pytest.approx(CEILING_COST)
    assert charge(CLOUD_PRICES, 0, 0) == 0


# --- Il totale nel file -------------------------------------------------------------------

def test_nothing_spent_before_the_first_cloud_answer(tmp_path):
    assert Spending(tmp_path / "spending.json").total() == 0


def test_total_survives_a_restart(tmp_path):
    Spending(tmp_path / "spending.json").add(0.5)
    Spending(tmp_path / "spending.json").add(0.25)
    assert Spending(tmp_path / "spending.json").total() == 0.75


def test_disconnecting_from_strava_keeps_the_total(cloud_service, cloud_spending):
    cloud_spending.add(0.5)
    assert cloud_service.client.post("/coach/forget", headers=SAME_ORIGIN).status_code == 204
    assert cloud_spending.total() == 0.5


@pytest.mark.parametrize("content", [b"non json", b'{"total": "1"}', b'{"total": -1}', b'{"total": NaN}',
                                     b'{"total": true}', b"[]", b"{}", b"\xff\xfe",
                                     b'{"total": 1' + b"0" * 400 + b"}"])   # troppo grande per un float
def test_unreadable_total_refuses_and_is_never_reset(tmp_path, content):
    path = tmp_path / "spending.json"
    path.write_bytes(content)
    spending = Spending(path)
    for action in (lambda: spending.check(5), lambda: spending.add(0.1)):
        with pytest.raises(CoachError) as e:
            action()
        assert (e.value.status, e.value.code, e.value.message) == (
            500, "spending_unreadable", UNREADABLE.format(path=path))
    assert path.read_bytes() == content


COACH_DIR = Path(__file__).resolve().parents[1]
# Aggiunge 1 dollaro per volta, quante volte dice il secondo argomento, dopo il via sullo stdin.
ADD_MANY = """import sys
from pathlib import Path
from app.spending import Spending
spending = Spending(Path(sys.argv[1]))
sys.stdin.read()
for _ in range(int(sys.argv[2])):
    spending.add(1)
"""


def test_two_processes_adding_at_once_keep_every_amount(tmp_path):
    # Come il servizio Coach e il controllo dal vivo: due container sullo stesso file.
    path = tmp_path / "spending.json"
    workers = [subprocess.Popen([sys.executable, "-c", ADD_MANY, str(path), "500"], cwd=COACH_DIR,
                                stdin=subprocess.PIPE) for _ in range(2)]
    for w in workers:   # il via, per tutti e due insieme
        w.stdin.close()
    assert [w.wait(30) for w in workers] == [0, 0]
    assert Spending(path).total() == 1000


def test_cap_reached_refuses_naming_total_and_limit(tmp_path):
    spending = Spending(tmp_path / "spending.json")
    spending.add(1)
    spending.check(1.01)
    with pytest.raises(CoachError) as e:
        spending.check(1)
    assert (e.value.status, e.value.code, e.value.message) == (
        402, "spending_cap", "Tetto di spesa raggiunto: spesi $1.0000 su un limite di $1.00 "
                             "(CLOUD_SPENDING_LIMIT in .env). Alza il limite per continuare.")


def test_limit_zero_refuses_from_the_first_request(tmp_path):
    with pytest.raises(CoachError) as e:
        Spending(tmp_path / "spending.json").check(0)
    assert e.value.code == "spending_cap"


# --- Attraverso la rotta HTTP -------------------------------------------------------------

def test_cloud_result_shows_its_cost_and_adds_it_to_the_total(cloud_service, cloud_spending):
    assert events_of(post(cloud_service, BODY))[-1]["cost"] == pytest.approx(ANSWER_COST)
    assert cloud_spending.total() == pytest.approx(ANSWER_COST)
    post(cloud_service, BODY)
    assert cloud_spending.total() == pytest.approx(2 * ANSWER_COST)


def test_answer_without_token_counts_shows_no_cost_and_adds_the_ceiling(cloud_service, cloud_spending):
    cloud_service.cloud.usage = None
    assert events_of(post(cloud_service, BODY))[-1]["cost"] is None
    assert cloud_spending.total() == pytest.approx(CEILING_COST)


def test_stream_dropping_before_the_token_counts_adds_the_ceiling(cloud_service, cloud_spending):
    cloud_service.cloud.drop_after = 3
    assert events_of(post(cloud_service, BODY))[-1]["type"] == "error"
    assert cloud_spending.total() == pytest.approx(CEILING_COST)


@pytest.mark.parametrize("status", [401, 403, 402, 429, 500])
def test_request_the_provider_refused_adds_nothing(cloud_service, cloud_spending, status):
    cloud_service.cloud.status, cloud_service.cloud.error = status, {"error": {"message": "no"}}
    assert events_of(post(cloud_service, BODY))[-1]["type"] == "error"
    assert cloud_spending.total() == 0 and not cloud_spending.path.exists()


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ConnectTimeout])
def test_unreachable_provider_adds_nothing(cloud_service, cloud_spending, error):
    def unreachable(request):
        raise error("provider spento")
    cloud_service.cloud.handle = unreachable
    assert events_of(post(cloud_service, BODY))[-1] == {
        "type": "error", "error": "model", "message": f"Provider cloud non raggiungibile su {CLOUD_URL}"}
    assert not cloud_spending.path.exists()


@pytest.mark.parametrize("error", [httpx.ReadError, httpx.RemoteProtocolError, httpx.WriteError])
def test_connection_lost_before_the_provider_answers_adds_nothing(cloud_service, cloud_spending, error):
    def lost(request):
        raise error("connessione persa prima della risposta")
    cloud_service.cloud.handle = lost
    assert events_of(post(cloud_service, BODY))[-1]["type"] == "error"
    assert not cloud_spending.path.exists()


def test_cap_reached_refuses_before_any_call(cloud_service, cloud_spending):
    cloud_spending.add(1.5)
    res = post(cloud_service, BODY)
    assert (res.status_code, res.json()) == (402, {
        "error": "spending_cap", "message": "Tetto di spesa raggiunto: spesi $1.5000 su un limite di $1.00 "
                                            "(CLOUD_SPENDING_LIMIT in .env). Alza il limite per continuare."})
    assert cloud_service.rides.calls == 0 and cloud_service.search.texts == [] and cloud_service.cloud.requests == []
    assert cloud_spending.total() == 1.5


def test_request_started_under_the_limit_finishes_and_the_next_is_refused(cloud_service, cloud_spending):
    cloud_spending.add(0.999)
    assert events_of(post(cloud_service, BODY))[-1]["type"] == "result"
    assert cloud_spending.total() == pytest.approx(0.999 + ANSWER_COST)
    assert post(cloud_service, BODY).status_code == 402
    assert len(cloud_service.cloud.requests) == 1


def test_unreadable_total_refuses_cloud_requests_before_any_call(cloud_service, cloud_spending):
    cloud_spending.path.write_text("{rotto")
    res = post(cloud_service, BODY)
    assert (res.status_code, res.json()["error"]) == (500, "spending_unreadable")
    assert cloud_service.rides.calls == 0 and cloud_service.cloud.requests == []
    assert cloud_spending.path.read_text() == "{rotto"


def test_ollama_costs_nothing_and_is_never_stopped_by_the_cap(monkeypatch, cloud_spending):
    # .env ha ancora i prezzi del cloud, ma il provider scelto è Ollama.
    service = make_service(monkeypatch, {k: v for k, v in CLOUD_ENV.items() if k != "COACH_PROVIDER"})
    cloud_spending.add(5)
    result = events_of(post(service, BODY))[-1]
    assert (result["type"], result["provider"], result["cost"]) == ("result", "ollama", None)
    assert cloud_spending.total() == 5
    cloud_spending.path.write_text("{rotto")
    assert events_of(post(service, BODY))[-1]["type"] == "result"


def test_total_is_kept_when_switching_to_ollama_and_back(monkeypatch, cloud_spending):
    service = make_service(monkeypatch, CLOUD_ENV)
    post(service, BODY)
    monkeypatch.delenv("COACH_PROVIDER")
    post(service, BODY)
    monkeypatch.setenv("COACH_PROVIDER", "cloud")
    post(service, BODY)
    assert cloud_spending.total() == pytest.approx(2 * ANSWER_COST)
    assert json.loads(cloud_spending.path.read_text()) == {"total": pytest.approx(2 * ANSWER_COST)}
