"""La corsa del set di valutazione: un comando fa scegliere il workout al modello chat di .env in
ogni situazione, tante volte quante chiede --repeat, e scrive un file di risultati nuovo, riscritto
dopo ogni risposta; con --search-only misura soltanto la ricerca dei paper. Qui modello chat, modello
di ricerca e provider sono finti: nessuna spesa."""

import json
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from app import cloud, evaluation, grading, ollama, prompts, search, tracing
from fakes import CLOUD_ENV, CLOUD_KEY, CLOUD_MODEL, DownPhoenix, FakeCloud, FakeOllama, FakeSearch, drafts_per_answer
from fixture_data import FIXTURES, load

CASES = load("coach_cases.json")
# Riposo: la regola di oggi lo ammette in ogni situazione provata qui, e senza citazioni il controllo
# accetta la prima bozza.
ANSWER = '{"protocolId":"rest","razionale":"Forma molto bassa: riposo.","passaggiUsati":[]}'
CLOCK = datetime(2026, 11, 8, 9, 15, 0, tzinfo=timezone.utc)
COACH_DIR = Path(__file__).resolve().parents[1]
SITUATIONS = json.loads(evaluation.SITUATIONS_FILE.read_text(encoding="utf-8"))
ANSWER_COST = (900 * 3 + 42 * 15) / 1_000_000
CEILING_COST = (8000 * 3 + 4000 * 15) / 1_000_000
FIELDS = {"situation", "repeat", "duration", "protocolId", "fellBack", "truncated", "jsonReadable", "papersFound",
          "passagesFound", "papersCited", "inputTokens", "outputTokens", "cost", "charged", "seconds", "modelRaw"}


@pytest.fixture
def fakes(monkeypatch):
    models = {"ollama": FakeOllama(ANSWER), "cloud": FakeCloud(ANSWER),
              "search": FakeSearch(CASES["queries"]["middle"])}
    monkeypatch.setattr(ollama, "client", models["ollama"].client)
    monkeypatch.setattr(cloud, "client", models["cloud"].client)
    monkeypatch.setattr(search, "encode", models["search"].encode)
    return models


@pytest.fixture
def two_situations(tmp_path) -> Path:
    """Le prime due situazioni del set: i test che non riguardano il set intero restano veloci."""
    path = tmp_path / "situations.json"
    path.write_text(json.dumps(SITUATIONS[:2]), encoding="utf-8")
    return path


@pytest.fixture
def cloud_env(monkeypatch):
    for name, value in CLOUD_ENV.items():
        monkeypatch.setenv(name, value)


def evaluate(tmp_path, spending, situations=evaluation.SITUATIONS_FILE, args=()) -> tuple[int, list[Path]]:
    """Esegue il comando con la cartella dei risultati, l'indice, le situazioni e il totale della
    spesa del test; ritorna il codice di uscita e i file scritti."""
    results = tmp_path / "eval-runs"
    code = evaluation.main(list(args), results_dir=results, index_file=FIXTURES / "papers_index.json",
                           situations_file=situations, spending=spending, clock=lambda: CLOCK)
    return code, sorted(results.glob("*")) if results.exists() else []


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def assert_steps_from_the_papers(steps) -> None:
    """Si parte dai numeri dell'atleta già pronti: nessun passo delle corse né dei numeri, poi una
    coppia bozza e controllo per ogni bozza e la consegna."""
    names = [step.name for step in steps]
    assert names[0] == "papers" and names[-1] == "deliver"
    assert names[1:-1] == ["draft", "check"] * (len(names[1:-1]) // 2) and names[1:-1]


def test_every_situation_of_the_set_runs_like_a_coach_request_and_the_file_is_complete(fakes, tmp_path,
                                                                                       cloud_spending, capsys):
    code, [file] = evaluate(tmp_path, cloud_spending)
    assert code == 0
    run = read(file)
    assert (run["kind"], run["provider"], run["model"], run["startedAt"]) == (
        "evaluation", "ollama", "qwen2.5:7b", "2026-11-08T09:15:00Z")
    assert (run["searchModel"], run["promptVersion"]) == (search.SEARCH_MODEL, prompts.prompt_version())
    assert (run["repeat"], run["complete"], run["totalCost"]) == (1, True, None)
    assert [(a["situation"], a["repeat"], a["duration"]) for a in run["answers"]] == [
        (s["name"], 1, s["minutes"]) for s in SITUATIONS]
    drafts = drafts_per_answer([body for _, body in fakes["ollama"].requests])
    for a, n in zip(run["answers"], drafts, strict=True):
        assert set(a) == FIELDS
        # Ogni bozza legge 900 token e ne scrive 42: la risposta conta tutte le sue bozze.
        assert (a["modelRaw"], a["jsonReadable"], a["inputTokens"], a["outputTokens"]) == (ANSWER, True, 900 * n,
                                                                                            42 * n)
        assert len(a["papersFound"]) == 4 and len(a["passagesFound"]) == 8
    # Lo stesso prompt di una richiesta del Coach, dai numeri della situazione.
    sent = [body["messages"] for _, body in fakes["ollama"].requests if len(body["messages"]) == 2]
    assert [m[1]["content"] for m in sent] == [prompts.user_prompt(s["context"], s["minutes"]) for s in SITUATIONS]
    assert fakes["search"].texts == [prompts.retrieval_query(s["context"], s["minutes"]) for s in SITUATIONS]
    lines = capsys.readouterr().out.splitlines()
    first = SITUATIONS[0]
    assert lines[0].startswith(f"[1/{len(SITUATIONS)}] {first['name']} ({first['minutes']} min): ")
    # Poi i punteggi della corsa, il costo totale e il nome del file.
    assert lines[len(SITUATIONS)] == f"eval-runs/{file.name} — qwen2.5:7b · prompt {run['promptVersion']} · corsa completa"
    assert f"  Risposte valutate: {len(SITUATIONS)} · errori: 0" in lines and "  Costo per risposta: —" in lines
    assert lines[-2:] == ["Costo totale: —", f"Risultati in eval-runs/{file.name}"]


def test_the_run_never_loads_the_service_with_its_saved_rides():
    # app.main crea all'importazione l'accesso a Strava e alle corse salvate in /data.
    res = subprocess.run([sys.executable, "-c", "import sys, app.evaluation; print('app.main' in sys.modules)"],
                         cwd=COACH_DIR, capture_output=True, text=True, check=True)
    assert res.stdout.strip() == "False"


def test_repeat_3_answers_every_situation_three_times(fakes, tmp_path, cloud_spending, two_situations):
    _, [file] = evaluate(tmp_path, cloud_spending, two_situations, ["--repeat", "3"])
    run = read(file)
    names = [s["name"] for s in SITUATIONS[:2]]
    assert run["repeat"] == 3 and run["complete"]
    assert [(a["situation"], a["repeat"]) for a in run["answers"]] == [(n, k) for k in (1, 2, 3) for n in names]


def test_every_answer_leaves_its_trace_with_situation_and_repeat_and_no_rides_step(fakes, tmp_path, cloud_spending,
                                                                                   two_situations, phoenix):
    evaluate(tmp_path, cloud_spending, two_situations, ["--repeat", "2"])
    # Senza mandare le tracce in coda: il comando le ha già mandate prima di finire.
    traces = phoenix.traces()
    expected = [(s, k) for k in (1, 2) for s in SITUATIONS[:2]]
    assert [root.name for root, _ in traces] == [f"evaluation · {s['name']} #{k}" for s, k in expected]
    for (root, steps), (s, k) in zip(traces, expected):
        assert root.resource.attributes["openinference.project.name"] == "evaluation"
        assert dict(root.attributes) == {"openinference.span.kind": "CHAIN", "coach.source": "evaluation",
                                         "coach.minutes": s["minutes"], "coach.situation": s["name"],
                                         "coach.repeat": k, "coach.prompt_version": prompts.prompt_version()}
        assert_steps_from_the_papers(steps)


def test_with_phoenix_not_started_the_run_completes_and_one_line_says_traces_are_lost(fakes, tmp_path, cloud_spending,
                                                                                     two_situations, monkeypatch,
                                                                                     capsys):
    monkeypatch.setattr(tracing, "phoenix", DownPhoenix)
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations, ["--repeat", "2"])
    assert code == 0 and read(file)["complete"] is True and len(read(file)["answers"]) == 4
    assert capsys.readouterr().out.count("[coach] Phoenix non risponde") == 1


@pytest.mark.parametrize("repeat", ["0", "-1", "1.5", "tre", ""])
def test_a_repeat_count_that_is_not_a_whole_number_from_1_is_refused_before_any_call(fakes, tmp_path, cloud_spending,
                                                                                      two_situations, repeat, capsys):
    code, files = evaluate(tmp_path, cloud_spending, two_situations, [f"--repeat={repeat}"])
    assert (code, files, fakes["ollama"].requests) == (2, [], [])
    assert "--repeat vuole un numero intero da 1 in su" in capsys.readouterr().err


def test_runs_in_the_same_second_never_overwrite(fakes, tmp_path, cloud_spending, two_situations, monkeypatch):
    monkeypatch.setenv("OLLAMA_CHAT_MODEL", "org/qwen2.5:7b")
    fakes["ollama"].installed = ["org/qwen2.5:7b"]
    evaluate(tmp_path, cloud_spending, two_situations)
    _, files = evaluate(tmp_path, cloud_spending, two_situations)
    assert [f.name for f in files] == ["2026-11-08_09-15-00_org-qwen2.5-7b-2.json",
                                       "2026-11-08_09-15-00_org-qwen2.5-7b.json"]


def test_cloud_run_prints_the_worst_case_records_costs_and_never_writes_the_key(fakes, tmp_path, cloud_spending,
                                                                               cloud_env, two_situations, capsys):
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    run = read(file)
    assert code == 0 and run["model"] == CLOUD_MODEL
    assert [(a["cost"], a["charged"]) for a in run["answers"]] == [(pytest.approx(ANSWER_COST),) * 2] * 2
    assert run["totalCost"] == pytest.approx(2 * ANSWER_COST) and cloud_spending.total() == pytest.approx(2 * ANSWER_COST)
    out = capsys.readouterr().out
    assert out.splitlines()[0] == "Costo massimo: $0.1680 per 2 risposte; restano $1.0000 sotto il tetto."
    assert "Costo totale: $0.0067" in out
    assert CLOUD_KEY not in file.read_text() and CLOUD_KEY not in out


def test_cloud_run_whose_worst_case_exceeds_what_is_left_does_not_start(fakes, tmp_path, cloud_spending, cloud_env,
                                                                        two_situations, capsys):
    cloud_spending.add(1 - 2 * CEILING_COST + 0.0001)
    code, files = evaluate(tmp_path, cloud_spending, two_situations)
    assert (code, files, fakes["cloud"].requests) == (2, [], [])
    assert "Il costo massimo supera quanto resta sotto il tetto" in capsys.readouterr().err


def test_cloud_run_whose_worst_case_is_exactly_what_is_left_starts(fakes, tmp_path, cloud_spending, cloud_env,
                                                                   two_situations):
    cloud_spending.add(1 - 2 * CEILING_COST)
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    assert code == 0 and read(file)["complete"]


def test_unreadable_spending_file_refuses_a_cloud_run(fakes, tmp_path, cloud_spending, cloud_env, two_situations,
                                                      capsys):
    cloud_spending.path.write_text("non è json")
    code, files = evaluate(tmp_path, cloud_spending, two_situations)
    assert (code, files, fakes["cloud"].requests) == (2, [], [])
    assert "Il totale della spesa cloud" in capsys.readouterr().err


def test_ollama_run_has_no_worst_case_line(fakes, tmp_path, cloud_spending, two_situations, capsys):
    evaluate(tmp_path, cloud_spending, two_situations)
    assert "Costo massimo" not in capsys.readouterr().out


def test_cap_reached_by_the_app_during_the_run_fails_the_later_answers_and_the_file_is_incomplete(
        fakes, tmp_path, cloud_spending, cloud_env, two_situations):
    handle = fakes["cloud"].handle

    def app_spends_meanwhile(request):
        cloud_spending.add(1.0)
        return handle(request)
    fakes["cloud"].handle = app_spends_meanwhile
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    first, second = read(file)["answers"]
    assert code == 0 and first["protocolId"] and second["error"] == "spending_cap"
    assert read(file)["complete"] is False


def test_a_failing_answer_is_recorded_the_next_one_runs_and_the_file_is_incomplete(fakes, tmp_path, cloud_spending,
                                                                                   two_situations):
    handle, calls = fakes["ollama"].handle, []

    def drop_the_first(request):
        if request.url.path == "/api/chat":
            calls.append(1)
            if len(calls) == 1:
                raise httpx.ReadError("connessione caduta")
        return handle(request)
    fakes["ollama"].handle = drop_the_first
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    run = read(file)
    assert code == 0 and run["answers"][0]["error"] == "model" and "protocolId" in run["answers"][1]
    assert run["complete"] is False


def test_every_answer_failing_still_writes_the_file_and_ends_with_code_1(fakes, tmp_path, cloud_spending,
                                                                          two_situations, capsys):
    fakes["ollama"].down = True
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    assert code == 1 and {a["error"] for a in read(file)["answers"]} == {"model"}
    assert "errore: Ollama non raggiungibile" in capsys.readouterr().out


def test_the_file_is_rewritten_after_every_answer_and_marked_incomplete_until_the_end(fakes, tmp_path, cloud_spending,
                                                                                      two_situations):
    handle, seen = fakes["ollama"].handle, []

    def look_at_the_file(request):
        if request.url.path == "/api/chat":
            [file] = (tmp_path / "eval-runs").glob("*.json")
            seen.append(read(file))
        return handle(request)
    fakes["ollama"].handle = look_at_the_file
    _, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    assert [(len(r["answers"]), r["complete"]) for r in seen] == [(0, False), (1, False)]
    assert read(file)["complete"] is True


def test_a_run_stopped_halfway_keeps_the_finished_answers_and_their_traces(fakes, tmp_path, cloud_spending,
                                                                           two_situations, capsys, phoenix):
    handle, calls = fakes["ollama"].handle, []

    def stop_at_the_second(request):
        # La prima bozza di ogni risposta manda due messaggi: si ferma alla seconda risposta.
        if request.url.path == "/api/chat" and len(json.loads(request.content)["messages"]) == 2:
            calls.append(1)
            if len(calls) == 2:
                raise KeyboardInterrupt
        return handle(request)
    fakes["ollama"].handle = stop_at_the_second
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    run = read(file)
    assert code == 130 and len(run["answers"]) == 1 and run["complete"] is False
    assert f"Corsa interrotta: le risposte finite sono in eval-runs/{file.name}" in capsys.readouterr().err
    (root, steps), *_ = phoenix.traces()
    assert root.name == f"evaluation · {SITUATIONS[0]['name']} #1"
    assert_steps_from_the_papers(steps)


def test_answers_without_token_counts_record_null_cost_and_charge_the_high_estimate(fakes, tmp_path, cloud_spending,
                                                                                    cloud_env, two_situations):
    fakes["cloud"].usage = None
    _, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    answers = read(file)["answers"]
    assert [(a["inputTokens"], a["cost"], a["charged"]) for a in answers] == [(None, None, pytest.approx(CEILING_COST))] * 2


def test_an_unexpected_error_is_recorded_without_the_key(fakes, tmp_path, cloud_spending, cloud_env, two_situations,
                                                         monkeypatch):
    encode, calls = fakes["search"].encode, []

    async def broken_once(text):
        calls.append(text)
        if len(calls) == 1:
            raise RuntimeError(f"modello di ricerca rotto ({CLOUD_KEY})")
        return await encode(text)
    monkeypatch.setattr(search, "encode", broken_once)
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    first, second = read(file)["answers"]
    assert code == 0 and "protocolId" in second
    assert (first["error"], first["message"]) == (
        "internal", "Errore interno della valutazione (RuntimeError): modello di ricerca rotto (***)")
    assert CLOUD_KEY not in file.read_text()


def test_wrong_env_stops_before_any_call_and_writes_nothing(fakes, tmp_path, cloud_spending, two_situations,
                                                            monkeypatch, capsys):
    monkeypatch.setenv("COACH_PROVIDER", "cloud")
    code, files = evaluate(tmp_path, cloud_spending, two_situations)
    assert (code, files, fakes["cloud"].requests) == (2, [], [])
    assert "manca in .env: CLOUD_URL" in capsys.readouterr().err


def search_only_files(tmp_path) -> tuple[Path, Path]:
    """Tre situazioni (paper atteso trovato, non trovato, solo pratica) e un indice in cui la
    ricerca finta trova per prima Seiler 2011, il paper di seiler_4x8."""
    vector = CASES["queries"]["middle"]
    index = load("papers_index.json")
    first = index["papers"][0]
    first.update(pmid="21812820", passages=[{**s, "embedding": vector} for s in first["passages"]])
    index_file = tmp_path / "papers_index.json"
    index_file.write_text(json.dumps(index), encoding="utf-8")
    base = SITUATIONS[0]
    situations = [{**base, "name": "trovato", "allowed": ["seiler_4x8", "rest"]},
                  {**base, "name": "non-trovato", "allowed": ["ronnestad_30_15"]},
                  {**base, "name": "solo-pratica", "allowed": ["rest"]}]
    situations_file = tmp_path / "situations.json"
    situations_file.write_text(json.dumps(situations), encoding="utf-8")
    return situations_file, index_file


def test_search_only_runs_the_coach_search_in_every_situation_and_prints_the_search_score(
        fakes, tmp_path, cloud_spending, monkeypatch, phoenix, capsys):
    # Un .env cloud senza chiave né indirizzo, e niente rete: la sola ricerca non ne ha bisogno.
    monkeypatch.setenv("COACH_PROVIDER", "cloud")

    def no_network(*args):
        raise AssertionError("la sola ricerca non deve usare la rete")
    monkeypatch.setattr(socket.socket, "connect", no_network)
    situations_file, index_file = search_only_files(tmp_path)
    results = tmp_path / "eval-runs"
    code = evaluation.main(["--search-only"], results_dir=results, index_file=index_file,
                           situations_file=situations_file, spending=cloud_spending)
    assert code == 0
    assert capsys.readouterr().out.splitlines() == [
        f"Sola ricerca dei paper: 3 situazioni, modello di ricerca {search.SEARCH_MODEL}",
        f"Paper cercati: paper di base, {len(BASE_PMIDS)} paper (21812820, {', '.join(BASE_PMIDS[1:])})",
        "  Punteggio della ricerca, paper atteso trovato: 50% (1/2)"]
    situations = json.loads(situations_file.read_text(encoding="utf-8"))
    assert fakes["search"].texts == [prompts.retrieval_query(s["context"], s["minutes"]) for s in situations]
    # Nessun modello chat, nessuna spesa, nessun file, nessuna traccia.
    assert (fakes["ollama"].requests, fakes["cloud"].requests) == ([], [])
    assert cloud_spending.total() == 0 and not results.exists() and phoenix.traces() == []


def test_search_only_counts_every_situation_of_the_set_with_an_expected_paper(fakes, tmp_path, cloud_spending,
                                                                              capsys):
    code, files = evaluate(tmp_path, cloud_spending, args=["--search-only"])
    # 20 delle 27 situazioni ammettono un protocollo con un paper di supporto; l'indice dei test non ne ha.
    assert (code, files) == (0, [])
    assert "  Punteggio della ricerca, paper atteso trovato: 0% (0/20)" in capsys.readouterr().out.splitlines()


def test_search_only_with_a_refused_index_prints_the_coach_message_and_fails(fakes, tmp_path, cloud_spending, capsys):
    situations_file, index_file = search_only_files(tmp_path)
    index = json.loads(index_file.read_text(encoding="utf-8"))
    index_file.write_text(json.dumps({**index, "model": "altro-modello"}), encoding="utf-8")
    code = evaluation.main(["--search-only"], results_dir=tmp_path / "eval-runs", index_file=index_file,
                           situations_file=situations_file, spending=cloud_spending)
    assert code == 2
    assert "✗ papers_index.json è codificato con altro-modello" in capsys.readouterr().err


def test_the_prompt_version_changes_with_the_prompt_text_and_only_with_it(monkeypatch):
    version = prompts.prompt_version()
    assert len(version) == 8 and prompts.prompt_version() == version
    monkeypatch.setattr(prompts, "SYSTEM_TEMPLATE", prompts.SYSTEM_TEMPLATE.replace("evidence-based", "basato sulle prove"))
    assert prompts.prompt_version() != version


# --- Paper di base o libreria ------------------------------------------------------------------

BASE_PMIDS = [p["pmid"] for p in load("papers_index.json")["papers"]]


def saved_library_with(saved_library, added=(), removed=()):
    paper = load("papers_index.json")["papers"][0]
    saved_library.path.write_text(json.dumps({
        "model": search.SEARCH_MODEL, "added": [{**paper, "pmid": pmid} for pmid in added], "removed": list(removed)}))


def test_by_default_the_run_searches_the_base_papers_even_when_the_library_differs(fakes, tmp_path, cloud_spending,
                                                                                    two_situations, saved_library):
    saved_library_with(saved_library, added=["999"], removed=[BASE_PMIDS[0]])
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    assert code == 0 and read(file)["papers"] == {"source": "base", "pmids": BASE_PMIDS}


def test_with_the_library_option_the_run_searches_and_records_the_library(fakes, tmp_path, cloud_spending,
                                                                           two_situations, saved_library):
    saved_library_with(saved_library, added=["999"], removed=[BASE_PMIDS[0]])
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations, args=["--library"])
    assert code == 0 and read(file)["papers"] == {"source": "library", "pmids": [*BASE_PMIDS[1:], "999"]}
    assert all(BASE_PMIDS[0] not in [p["pmid"] for p in a["papersFound"]] for a in read(file)["answers"])


def test_search_only_on_the_library_prints_the_papers_searched(fakes, tmp_path, cloud_spending, saved_library, capsys):
    situations_file, index_file = search_only_files(tmp_path)
    saved_library_with(saved_library, removed=["21812820"])
    code = evaluation.main(["--search-only", "--library"], results_dir=tmp_path / "eval-runs", index_file=index_file,
                           situations_file=situations_file, spending=cloud_spending)
    out = capsys.readouterr().out.splitlines()
    assert code == 0 and out[1] == f"Paper cercati: libreria, {len(BASE_PMIDS) - 1} paper ({', '.join(BASE_PMIDS[1:])})"
    # Senza Seiler 2011 la ricerca non trova più il paper atteso.
    assert out[2] == "  Punteggio della ricerca, paper atteso trovato: 0% (0/2)"


def test_the_library_option_with_nothing_added_or_removed_searches_the_base_papers(fakes, tmp_path, cloud_spending,
                                                                                    two_situations):
    code, [file] = evaluate(tmp_path, cloud_spending, two_situations, args=["--library"])
    assert code == 0 and read(file)["papers"] == {"source": "library", "pmids": BASE_PMIDS}


def test_the_library_option_with_an_unreadable_library_stops_before_any_file(fakes, tmp_path, cloud_spending,
                                                                              two_situations, saved_library, capsys):
    saved_library.path.write_text("{")
    assert evaluate(tmp_path, cloud_spending, two_situations, args=["--library"]) == (2, [])
    assert f"✗ La libreria salvata in {saved_library.path} non si legge" in capsys.readouterr().err
    assert fakes["ollama"].requests == []


def test_a_results_file_from_before_the_papers_field_is_graded_as_before(fakes, tmp_path, cloud_spending,
                                                                          two_situations):
    _, [file] = evaluate(tmp_path, cloud_spending, two_situations)
    run = read(file)
    old = {k: v for k, v in run.items() if k != "papers"}
    assert grading.grade(old, SITUATIONS[:2]) == grading.grade(run, SITUATIONS[:2])
