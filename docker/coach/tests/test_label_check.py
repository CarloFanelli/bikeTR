"""La misura delle etichette: regola e modello che etichetta sulle corse etichettate a mano, quante
ne azzeccano in tutto e per etichetta, secondi e costo, un file nuovo di risultati per ogni misura.
Modelli finti: nessuna spesa."""

import json
from datetime import datetime, timezone

import pytest

from app import cloud, label_check, ollama
from app.spending import charge
from fakes import CLOUD_ENV, CLOUD_PRICES, FakeCloud, FakeOllama
from test_graph import chat_bodies

CLOCK = lambda: datetime(2026, 11, 19, 9, 0, tzinfo=timezone.utc)  # noqa: E731


def ride(i: int, label: str, watts: int, minutes: int = 60, gara: bool = False) -> dict:
    return {"id": f"r{i}", "data": "2025-01-01", "tipo": "Ride", "durataMin": minutes, "distanzaKm": 30,
            "avgWatts": watts, "avgHr": 140, "nome": "Uscita", "gara": gara, "np": watts, "maxWatts": 500,
            "maxHr": 175, "label": label}


RIDES = [ride(1, "fondo", 150, 120), ride(2, "ripetute", 190), ride(3, "recupero", 100, 40),
         ride(4, "gara", 210, 90, gara=True), ride(5, "ripetute", 150)]


@pytest.fixture
def labeled(tmp_path):
    path = tmp_path / "labeled_rides.json"
    path.write_text(json.dumps({"ftp": 200, "lthr": 165, "rides": RIDES}))
    return path


def measure(monkeypatch, tmp_path, labeled, fake, env, spending=None, argv=()):
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(ollama if isinstance(fake, FakeOllama) else cloud, "client", lambda *args: fake.client())
    return label_check.main(list(argv), results_dir=tmp_path / "label-runs", labeled_file=labeled, clock=CLOCK,
                            spending=spending)


MODEL_ANSWER = json.dumps({"c1": "fondo", "c2": "ripetute", "c3": "recupero", "c4": "fondo"})


def test_rule_and_model_accuracy_overall_and_per_label(monkeypatch, tmp_path, labeled, capsys):
    fake = FakeOllama(MODEL_ANSWER, model="qwen2.5:3b")
    code = measure(monkeypatch, tmp_path, labeled, fake, {"LABEL_MODEL": "qwen2.5:3b"})
    out = capsys.readouterr().out.splitlines()
    assert code == 0
    # Regola: fondo, ripetute, recupero e gara giusti, la quinta (150W su 200) è fondo.
    assert out[1] == "Regola: 80% (4/5) · recupero 1/1 · fondo 1/1 · ripetute 1/2 · gara 1/1"
    # Modello: la gara è fondo, la quinta non ha etichetta.
    assert out[2] == ("Modello qwen2.5:3b: 60% (3/5) · recupero 1/1 · fondo 1/1 · ripetute 1/2 · gara 0/1"
                      " · senza etichetta 1")
    assert out[3].startswith("Secondi del modello: ") and out[3].endswith(" · costo: —")
    (path,) = (tmp_path / "label-runs").iterdir()
    run = json.loads(path.read_text())
    assert out[0] == "Set: tuning"
    assert path.name == "2026-11-19_09-00-00_qwen2.5-3b_tuning.json" and run["set"] == "tuning"
    assert run["rides"][4] == {"id": "r5", "label": "ripetute", "rule": "fondo", "model": ""}
    assert run["totalCost"] is None
    assert out[4] == f"Riga per il README: | {path.name} | tuning | qwen2.5:3b | 80% (4/5) | 60% (3/5) | {run['seconds']:.1f} | — |"


def test_rides_go_to_the_model_in_groups_with_short_ids(monkeypatch, tmp_path, labeled):
    monkeypatch.setattr(label_check, "BATCH", 2)
    fake = FakeOllama(["{}", "{}", "{}"], model="qwen2.5:3b")
    measure(monkeypatch, tmp_path, labeled, fake, {"LABEL_MODEL": "qwen2.5:3b"})
    bodies = chat_bodies(fake)
    assert [b["messages"][1]["content"].count("\n- c") for b in bodies] == [2, 2, 1]


def test_each_run_writes_a_new_file(monkeypatch, tmp_path, labeled):
    for _ in range(2):
        measure(monkeypatch, tmp_path, labeled, FakeOllama(MODEL_ANSWER, model="qwen2.5:3b"),
                {"LABEL_MODEL": "qwen2.5:3b"})
    assert len(list((tmp_path / "label-runs").iterdir())) == 2


@pytest.mark.parametrize("content, message", [
    (None, "Manca labeled_rides.json: preparalo con python -m app.labeled_rides"),
    ({"ftp": 200, "lthr": None, "rides": [ride(7, "", 150)]},
     'labeled_rides.json: la corsa r7 ha etichetta ""; quelle ammesse sono recupero, fondo, ripetute, gara'),
    ({"ftp": 200, "lthr": None, "rides": [ride(8, "tempo", 150)]},
     'labeled_rides.json: la corsa r8 ha etichetta "tempo"; quelle ammesse sono recupero, fondo, ripetute, gara'),
])
def test_a_missing_file_or_an_unknown_label_stops_naming_it(monkeypatch, tmp_path, content, message, capsys):
    path = tmp_path / "labeled_rides.json"
    if content is not None:
        path.write_text(json.dumps(content))
    code = measure(monkeypatch, tmp_path, path, FakeOllama("{}"), {"LABEL_MODEL": "qwen2.5:3b"})
    assert code == 2 and not (tmp_path / "label-runs").exists()
    assert capsys.readouterr().err == f"✗ {message}\n"


def test_an_unreachable_model_stops_with_its_message_and_writes_nothing(monkeypatch, tmp_path, labeled, capsys):
    fake = FakeOllama("{}")
    fake.down = True
    code = measure(monkeypatch, tmp_path, labeled, fake, {"LABEL_MODEL": "qwen2.5:3b"})
    assert code == 1 and not (tmp_path / "label-runs").exists()
    assert capsys.readouterr().err == f"✗ {ollama.unreachable()}\n"


CLOUD_LABEL = {**CLOUD_ENV, "LABEL_PROVIDER": "cloud", "LABEL_MODEL": "haiku", "LABEL_PRICE_IN": "3",
               "LABEL_PRICE_OUT": "15"}


def test_a_cloud_run_prints_the_worst_case_and_counts_its_cost(monkeypatch, tmp_path, labeled, cloud_spending, capsys):
    fake = FakeCloud(MODEL_ANSWER)
    assert measure(monkeypatch, tmp_path, labeled, fake, CLOUD_LABEL, cloud_spending) == 0
    out = capsys.readouterr().out.splitlines()
    worst = charge(CLOUD_PRICES, None, None)
    assert out[0] == f"Costo massimo: ${worst:.4f} per 1 chiamate del modello che etichetta; restano $1.0000 sotto il tetto."
    run = json.loads(next((tmp_path / "label-runs").iterdir()).read_text())
    assert run["totalCost"] == pytest.approx(charge(CLOUD_PRICES, 900, 42)) == pytest.approx(cloud_spending.total())


def test_a_cloud_run_past_the_cap_does_not_start(monkeypatch, tmp_path, labeled, cloud_spending, capsys):
    cloud_spending.add(0.99)
    fake = FakeCloud(MODEL_ANSWER)
    assert measure(monkeypatch, tmp_path, labeled, fake, CLOUD_LABEL, cloud_spending) == 2
    assert fake.requests == [] and not (tmp_path / "label-runs").exists()
    assert "supera quanto resta sotto il tetto" in capsys.readouterr().err


def test_rides_labelled_before_the_power_meter_flag_count_as_measured_only_with_normalized_power(tmp_path):
    path = tmp_path / "labeled_rides.json"
    estimated = {**ride(1, "fondo", 300, 120), "np": None, "avgHr": 150}
    measured = ride(2, "ripetute", 190)
    flagged = {**ride(3, "fondo", 300, 120), "potenzaMisurata": False}
    path.write_text(json.dumps({"ftp": 200, "lthr": 165, "rides": [estimated, measured, flagged]}))
    rides = label_check.labeled_rides(path)["rides"]
    assert [r["potenzaMisurata"] for r in rides] == [False, True, False]


def test_the_check_set_is_measured_by_name_and_reads_its_own_file(monkeypatch, tmp_path, capsys):
    monkeypatch.setitem(label_check.LABELED_FILES, "check", tmp_path / "labeled_rides_check.json")
    fake = FakeOllama(MODEL_ANSWER, model="qwen2.5:3b")
    assert measure(monkeypatch, tmp_path, None, fake, {"LABEL_MODEL": "qwen2.5:3b"}, argv=["--set", "check"]) == 2
    assert "Manca labeled_rides_check.json: preparalo con python -m app.labeled_rides --set check" in capsys.readouterr().err
    (tmp_path / "labeled_rides_check.json").write_text(json.dumps({"ftp": 200, "lthr": 165, "rides": RIDES}))
    assert measure(monkeypatch, tmp_path, None, fake, {"LABEL_MODEL": "qwen2.5:3b"}, argv=["--set", "check"]) == 0
    out = capsys.readouterr().out.splitlines()
    (path,) = (tmp_path / "label-runs").iterdir()
    assert out[0] == "Set: check" and path.name.endswith("_check.json")
    assert out[3:5] == ["Etichette della regola: affidabili", "Etichette di qwen2.5:3b: non affidabili"]


def counts(right: int, of: int, **labels_) -> dict:
    empty = {label: {"right": 0, "of": 0} for label in ("recupero", "fondo", "ripetute", "gara")}
    return {"all": {"right": right, "of": of}, **empty, **{k: {"right": r, "of": o} for k, (r, o) in labels_.items()}}


@pytest.mark.parametrize("score, expected", [
    (counts(8, 10, fondo=(6, 6), ripetute=(1, 2), recupero=(1, 2)), True),
    (counts(7, 10, fondo=(6, 6), ripetute=(1, 2), recupero=(0, 2)), False),
    (counts(9, 10, fondo=(8, 8), ripetute=(1, 2)), True),
    (counts(9, 10, fondo=(8, 8), ripetute=(1, 1), recupero=(0, 1)), False),
])
def test_reliable_means_80_percent_and_half_of_each_label_present_both_inclusive(score, expected):
    assert label_check.reliable(score) is expected
