"""Il controllo dal vivo: un comando fa scegliere il workout al modello chat di .env in 3
situazioni inventate, senza Strava né browser, e scrive un file di risultati nuovo da
portare in git. Qui modello chat, modello di ricerca e provider sono finti: nessuna spesa."""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from app import cloud, live_check, ollama, prompts, search
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, FakeCloud, FakeOllama, FakeSearch
from fixture_data import FIXTURES, load

CASES = load("coach_cases.json")
ANSWER = next(c for c in CASES["cases"] if c["name"] == "valid-answer")["answer"]
CLOCK = datetime(2026, 11, 7, 18, 30, 5, tzinfo=timezone.utc)
COACH_DIR = Path(__file__).resolve().parents[1]
ANSWER_COST = (900 * 3 + 42 * 15) / 1_000_000
CEILING_COST = (8000 * 3 + 4000 * 15) / 1_000_000
FIELDS = {"situation", "duration", "provider", "model", "protocolId", "fellBack", "truncated", "jsonReadable",
          "papersFound", "papersCited", "inputTokens", "outputTokens", "cost", "charged", "seconds", "modelRaw"}


@pytest.fixture
def fakes(monkeypatch):
    models = {"ollama": FakeOllama(ANSWER), "cloud": FakeCloud(ANSWER),
              "search": FakeSearch(CASES["queries"]["middle"])}
    monkeypatch.setattr(ollama, "client", models["ollama"].client)
    monkeypatch.setattr(cloud, "client", models["cloud"].client)
    monkeypatch.setattr(search, "encode", models["search"].encode)
    return models


def check(tmp_path, cloud_spending, clock=CLOCK) -> tuple[int, list[Path]]:
    """Esegue il comando con la cartella dei risultati, l'indice e il totale della spesa del
    test; ritorna il codice di uscita e i file scritti."""
    results = tmp_path / "live-checks"
    code = live_check.main([], results_dir=results, index_file=FIXTURES / "papers_index.json",
                           spending=cloud_spending, clock=lambda: clock)
    return code, sorted(results.glob("*.json")) if results.exists() else []


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_three_made_up_situations_with_the_env_model(fakes, tmp_path, cloud_spending, capsys):
    code, [file] = check(tmp_path, cloud_spending)
    assert code == 0
    run = read(file)
    assert (run["provider"], run["model"], run["startedAt"]) == ("ollama", "qwen2.5:7b", "2026-11-07T18:30:05Z")
    assert [(s["situation"], s["duration"]) for s in run["situations"]] == [("base", 60), ("ftp280", 90),
                                                                           ("noLthr", 45)]
    for s in run["situations"]:
        assert set(s) == FIELDS
        assert (s["provider"], s["model"], s["modelRaw"], s["jsonReadable"]) == ("ollama", "qwen2.5:7b", ANSWER, True)
        assert len(s["papersFound"]) == 4 and {"pmid", "title", "score"} <= set(s["papersFound"][0])
        assert all(isinstance(pmid, str) for pmid in s["papersCited"])
        assert (s["inputTokens"], s["outputTokens"], s["cost"], s["charged"]) == (900, 42, None, None)
    assert len(fakes["ollama"].requests) == 3 and len(fakes["search"].texts) == 3
    lines = capsys.readouterr().out.splitlines()
    assert lines[0].startswith("base (60 min): ") and " · ripiego: no · " in lines[0]
    assert lines[0].endswith(" · token: 900 in, 42 out · costo: —")
    assert lines[3] == "Costo totale: —"
    assert lines[4] == f"Risultati in live-checks/{file.name}"


def test_the_check_never_loads_the_service_with_its_saved_rides():
    # app.main crea all'importazione l'accesso a Strava e alle corse salvate in /data.
    res = subprocess.run([sys.executable, "-c", "import sys, app.live_check; print('app.main' in sys.modules)"],
                         cwd=COACH_DIR, capture_output=True, text=True, check=True)
    assert res.stdout.strip() == "False"


def test_file_name_has_date_time_and_model_and_never_overwrites(fakes, tmp_path, cloud_spending, monkeypatch):
    monkeypatch.setenv("OLLAMA_CHAT_MODEL", "org/qwen2.5:7b")
    fakes["ollama"].installed = ["org/qwen2.5:7b"]
    check(tmp_path, cloud_spending)
    _, files = check(tmp_path, cloud_spending)   # stessa ora, stesso modello
    assert [f.name for f in files] == ["2026-11-07_18-30-05_org-qwen2.5-7b-2.json",
                                       "2026-11-07_18-30-05_org-qwen2.5-7b.json"]
    assert {read(f)["model"] for f in files} == {"org/qwen2.5:7b"}


def test_cloud_run_records_costs_adds_them_to_the_total_and_never_writes_the_key(fakes, tmp_path, cloud_spending,
                                                                                  monkeypatch, capsys):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    code, [file] = check(tmp_path, cloud_spending)
    assert code == 0
    assert [(s["cost"], s["charged"]) for s in read(file)["situations"]] == [(pytest.approx(ANSWER_COST),
                                                                              pytest.approx(ANSWER_COST))] * 3
    assert read(file)["totalCost"] == pytest.approx(3 * ANSWER_COST)
    assert cloud_spending.total() == pytest.approx(3 * ANSWER_COST)
    assert CLOUD_KEY not in file.read_text() and fakes["cloud"].requests[0][1]["authorization"] == f"Bearer {CLOUD_KEY}"
    out = capsys.readouterr().out
    assert " · costo: $0.0033" in out and "Costo totale: $0.0100" in out and CLOUD_KEY not in out


def test_cap_reached_mid_run_refuses_the_rest_and_still_writes_the_file(fakes, tmp_path, cloud_spending,
                                                                       monkeypatch, capsys):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    cloud_spending.add(0.999)
    code, [file] = check(tmp_path, cloud_spending)
    first, *refused = read(file)["situations"]
    assert code == 0 and first["protocolId"]
    assert [(s["error"], s["message"][:30]) for s in refused] == [("spending_cap", "Tetto di spesa raggiunto: spes")] * 2
    assert len(fakes["cloud"].requests) == 1
    assert "noLthr (45 min): errore: Tetto di spesa raggiunto" in capsys.readouterr().out


def test_unreachable_model_fails_every_situation_and_the_command(fakes, tmp_path, cloud_spending, capsys):
    fakes["ollama"].down = True
    code, [file] = check(tmp_path, cloud_spending)
    assert code == 1
    errors = [(s["situation"], s["provider"], s["model"], s["error"]) for s in read(file)["situations"]]
    assert errors == [(name, "ollama", "qwen2.5:7b", "model") for name in ("base", "ftp280", "noLthr")]
    assert len({s["message"] for s in read(file)["situations"]}) == 1
    assert "base (60 min): errore: Ollama non raggiungibile" in capsys.readouterr().out


def test_one_failing_situation_lets_the_next_one_run(fakes, tmp_path, cloud_spending):
    handle = fakes["ollama"].handle
    calls = []

    def drop_the_first(request):
        if request.url.path == "/api/chat":
            calls.append(1)
            if len(calls) == 1:
                raise httpx.ReadError("connessione caduta")
        return handle(request)
    fakes["ollama"].handle = drop_the_first
    code, [file] = check(tmp_path, cloud_spending)
    situations = read(file)["situations"]
    assert code == 0 and situations[0]["error"] == "model" and "protocolId" in situations[1]


def test_empty_answer_is_not_readable_and_uses_the_backup_rule(fakes, tmp_path, cloud_spending):
    fakes["ollama"].answer = ""
    _, [file] = check(tmp_path, cloud_spending)
    s = read(file)["situations"][0]
    assert (s["modelRaw"], s["jsonReadable"], s["fellBack"]) == ("", False, True)


def test_answer_cut_at_the_token_limit_is_recorded_as_cut(fakes, tmp_path, cloud_spending):
    fakes["ollama"].done_reason = "length"
    _, [file] = check(tmp_path, cloud_spending)
    s = read(file)["situations"][0]
    assert (s["truncated"], s["fellBack"]) == (True, True)


def test_unknown_tokens_print_as_a_dash(fakes, tmp_path, cloud_spending, monkeypatch, capsys):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    fakes["cloud"].usage = None
    _, [file] = check(tmp_path, cloud_spending)
    assert read(file)["situations"][0]["cost"] is None
    assert " · token: — in, — out · costo: —" in capsys.readouterr().out


def test_answers_without_token_counts_add_their_high_estimate_to_the_run_total(fakes, tmp_path, cloud_spending,
                                                                                monkeypatch, capsys):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    fakes["cloud"].usage = None
    _, [file] = check(tmp_path, cloud_spending)
    run = read(file)
    assert [(s["cost"], s["charged"]) for s in run["situations"]] == [(None, pytest.approx(CEILING_COST))] * 3
    assert run["totalCost"] == pytest.approx(3 * CEILING_COST) and cloud_spending.total() == pytest.approx(3 * CEILING_COST)
    out = capsys.readouterr().out
    assert " · costo: — · addebitati: $0.0840" in out and "Costo totale: $0.2520" in out


def test_a_situation_failing_mid_answer_records_what_it_added_to_the_total(fakes, tmp_path, cloud_spending,
                                                                            monkeypatch, capsys):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    fakes["cloud"].drop_after = 3
    code, [file] = check(tmp_path, cloud_spending)
    run = read(file)
    assert code == 1 and [(s["error"], s["charged"]) for s in run["situations"]] == [("model", pytest.approx(CEILING_COST))] * 3
    assert run["totalCost"] == pytest.approx(3 * CEILING_COST) and cloud_spending.total() == pytest.approx(3 * CEILING_COST)
    assert "base (60 min): errore: Connessione con il provider cloud interrotta (ReadError) · addebitati: $0.0840" in (
        capsys.readouterr().out)


def test_an_unexpected_error_is_recorded_and_the_next_situation_runs(fakes, tmp_path, cloud_spending, monkeypatch):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    encode, calls = fakes["search"].encode, []

    async def broken_once(text):
        calls.append(text)
        if len(calls) == 1:
            raise RuntimeError(f"modello di ricerca rotto ({CLOUD_KEY})")
        return await encode(text)
    monkeypatch.setattr(search, "encode", broken_once)
    code, [file] = check(tmp_path, cloud_spending)
    first, *others = read(file)["situations"]
    assert code == 0 and all("protocolId" in s for s in others)
    assert (first["error"], first["message"], first["charged"]) == (
        "internal", "Errore interno del controllo dal vivo (RuntimeError): modello di ricerca rotto (***)", 0)
    assert CLOUD_KEY not in file.read_text()


def test_every_situation_leaves_its_trace_sent_before_the_command_ends(fakes, tmp_path, cloud_spending, phoenix):
    check(tmp_path, cloud_spending)
    # Senza mandare le tracce in coda: il comando le ha già mandate prima di finire.
    traces = phoenix.traces()
    assert [root.name for root, _ in traces] == ["live-check · base", "live-check · ftp280", "live-check · noLthr"]
    for (root, steps), (name, duration) in zip(traces, live_check.SITUATIONS):
        assert root.resource.attributes["openinference.project.name"] == "live-check"
        assert dict(root.attributes) == {"openinference.span.kind": "CHAIN", "coach.source": "live-check",
                                         "coach.minutes": duration, "coach.prompt_version": prompts.prompt_version(),
                                         "coach.situation": name}
        assert [s.name for s in steps] == ["rides", "papers", "model", "decision"]
        # Le corse inventate, non un download da Strava.
        assert steps[0].attributes["coach.rides.made_up"] is True


def test_wrong_env_stops_before_any_call_and_writes_nothing(fakes, tmp_path, cloud_spending, monkeypatch, capsys):
    monkeypatch.setenv("COACH_PROVIDER", "cloud")
    code, files = check(tmp_path, cloud_spending)
    assert (code, files, fakes["cloud"].requests) == (2, [], [])
    assert "manca in .env: CLOUD_URL" in capsys.readouterr().err


def test_index_of_another_search_model_is_recorded_as_the_error(fakes, tmp_path, cloud_spending):
    index = tmp_path / "papers_index.json"
    index.write_text(json.dumps({**load("papers_index.json"), "model": "nomic-embed-text"}))
    results = tmp_path / "live-checks"
    code = live_check.main([], results_dir=results, index_file=index, spending=cloud_spending, clock=lambda: CLOCK)
    [file] = results.glob("*.json")
    assert code == 1 and {s["error"] for s in read(file)["situations"]} == {"retrieval"}
    assert fakes["ollama"].requests == []


def test_the_cloud_model_name_is_written_in_full(fakes, tmp_path, cloud_spending, monkeypatch):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)
    _, [file] = check(tmp_path, cloud_spending)
    assert file.name == f"2026-11-07_18-30-05_{CLOUD_MODEL}.json" and read(file)["model"] == CLOUD_MODEL
