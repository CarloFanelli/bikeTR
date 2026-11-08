"""Il voto delle corse del set di valutazione: regole seguite, JSON leggibile, citazioni inventate,
paper di supporto citato e trovato, ripiego, secondi e costo, dai file dei risultati scritti qui a
mano, contro il set di oggi; senza modello né rete, e sempre lo stesso voto per lo stesso file."""

import json
import socket
import time
from pathlib import Path

import pytest

from app import grading

SITUATIONS = json.loads(grading.SITUATIONS_FILE.read_text(encoding="utf-8"))
# Forma +10: ammessi seiler_4x8 e seiler_4x4 (paper 21812820) e ronnestad_30_15 (31977120).
FRESH = "forma-esattamente-piu-10"
SEILER, RONNESTAD, OTHER = "21812820", "31977120", "16430681"


def answer(protocol="seiler_4x8", cited=(), rationale="Forma alta.", given=(SEILER, OTHER), situation=FRESH,
           raw=None, **fields) -> dict:
    """Una risposta riuscita: il testo del modello è il JSON richiesto dal prompt, se non è dato."""
    if raw is None:
        raw = json.dumps({"protocolId": protocol, "razionale": rationale, "paperUsati": list(cited)})
    return {"situation": situation, "repeat": 1, "duration": 60, "protocolId": protocol, "fellBack": False,
            "truncated": False, "jsonReadable": True,
            "papersFound": [{"pmid": p, "title": "Un paper", "score": 0.5} for p in given], "papersCited": [],
            "inputTokens": 900, "outputTokens": 42, "cost": None, "charged": None, "seconds": 10.0,
            "modelRaw": raw, **fields}


def failure(situation=FRESH, charged=None) -> dict:
    return {"situation": situation, "repeat": 1, "duration": 60, "error": "model", "message": "Ollama non raggiungibile",
            "charged": charged}


def run(answers, **fields) -> dict:
    return {"kind": "evaluation", "startedAt": "2026-11-08T09:15:00Z", "provider": "ollama", "model": "qwen2.5:7b",
            "searchModel": "BAAI/bge-small-en-v1.5", "promptVersion": "abcd1234", "repeat": 1, "complete": True,
            "totalCost": None, "answers": answers, **fields}


def write(project: Path, name: str, content) -> str:
    path = project / "eval-runs" / name
    path.parent.mkdir(exist_ok=True)
    path.write_text(content if isinstance(content, str) else json.dumps(content), encoding="utf-8")
    return f"eval-runs/{name}"


def grade(answers) -> grading.Scores:
    return grading.grade(run(answers), SITUATIONS)


def test_rules_followed_counts_only_the_model_choice_inside_the_allowed_list():
    scores = grade([
        answer("seiler_4x8"),
        # Fuori lista e troppo lungo per 60 minuti: il Coach lo sostituisce con Z2, ma il voto
        # guarda la scelta del modello.
        answer("over_under", protocolId="z2_endurance", fellBack=True),
        answer("sprint_9x9", protocolId="z2_endurance", fellBack=True),
        answer(raw="Scelgo il 4x8, mi sembra giusto.", protocolId="seiler_4x8", fellBack=True),
        answer(truncated=True, protocolId="seiler_4x8", fellBack=True),
    ])
    assert scores.rules_followed == (1, 5)
    assert scores.readable == (3, 5)
    assert scores.fallback == (4, 5)


def test_a_pmid_not_given_in_the_list_or_in_the_text_is_an_invented_citation():
    scores = grade([
        answer(cited=[SEILER]),
        answer(cited=["99999999"]),
        answer(rationale="Come in [PMID:99999999], meglio intervalli."),
        answer(cited=[int(SEILER), SEILER, f"PMID:{SEILER}"]),
        answer(),
    ])
    assert scores.invented == (2, 5)


def test_support_counts_only_answers_given_the_paper_of_the_chosen_protocol():
    scores = grade([
        answer(cited=[SEILER]),
        answer(rationale=f"Lo studio [PMID:{SEILER}] confronta 4×4 e 4×8."),
        # Il Coach aggiunge da sé la fonte ai paper citati: qui il modello non cita niente.
        answer(),
        answer(given=(OTHER,)),
        answer("sweet_spot_3x15", cited=[SEILER], situation="forma-esattamente-meno-10"),
        answer(raw="non è JSON", fellBack=True),
    ])
    assert scores.support_cited == (2, 3)
    assert scores.support_found == (3, 4)


def test_errors_are_counted_apart_and_no_success_gives_dashes():
    scores = grade([failure(), failure()])
    assert (scores.answered, scores.failed) == (0, 2)
    lines = grading.report(run([failure(), failure()]), scores, "corsa.json")
    assert "  Risposte valutate: 0 · errori: 2" in lines
    assert "  Regole seguite: —" in lines and "  Secondi (mediana): —" in lines


def test_median_seconds_and_cost_per_answer_with_errors_included_in_the_cost():
    answers = [answer(seconds=5.0, charged=0.004), answer(seconds=9.0, charged=0.002),
               answer(seconds=30.0, charged=0.003), failure(charged=0.084)]
    scores = grading.grade(run(answers, provider="cloud"), SITUATIONS)
    assert scores.median_seconds == 9.0
    assert scores.cost_per_answer == pytest.approx(0.093 / 4)
    assert grade([answer()]).cost_per_answer is None


def test_situations_no_longer_in_the_set_are_skipped_and_new_ones_listed_as_not_run():
    scores = grade([answer(situation="vecchia-situazione"), answer(), failure(situation="riposo-dopo-blocco")])
    assert scores.skipped == ["vecchia-situazione"]
    assert scores.not_run == [s["name"] for s in SITUATIONS if s["name"] not in (FRESH, "riposo-dopo-blocco")]
    assert (scores.answered, scores.failed) == (1, 1)


def test_grading_a_file_twice_gives_the_same_output_without_network_in_under_5_seconds(tmp_path, monkeypatch, capsys):
    def no_network(*args):
        raise AssertionError("il voto non deve usare la rete")
    monkeypatch.setattr(socket.socket, "connect", no_network)
    name = write(tmp_path, "corsa.json", run([answer(cited=[SEILER])] * 30))
    started = time.monotonic()
    outputs = []
    for _ in range(2):
        assert grading.main([name], project_dir=tmp_path) == 0
        outputs.append(capsys.readouterr().out)
    assert time.monotonic() - started < 5
    assert outputs[0] == outputs[1]


def test_scores_and_readme_rows_one_per_file_even_for_the_same_model_and_prompt(tmp_path, capsys):
    first = write(tmp_path, "a.json", run([answer(cited=[SEILER]), answer("over_under", fellBack=True)]))
    second = write(tmp_path, "b.json", run([answer()]))
    assert grading.main([first, second], project_dir=tmp_path) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[:11] == [
        "eval-runs/a.json — qwen2.5:7b · prompt abcd1234 · corsa completa",
        "  Risposte valutate: 2 · errori: 0",
        "  Regole seguite: 50% (1/2)",
        "  JSON leggibile: 100% (2/2)",
        "  Citazioni inventate: 0% (0/2)",
        "  Paper di supporto citato: 100% (1/1)",
        "  Paper di supporto trovato dalla ricerca: 100% (1/1)",
        "  Ripiego usato: 50% (1/2)",
        "  Secondi (mediana): 10.0",
        "  Costo per risposta: —",
        "  Non eseguite: " + ", ".join(s["name"] for s in SITUATIONS if s["name"] != FRESH),
    ]
    rows = [line for line in out if line.startswith("| qwen2.5:7b")]
    assert rows == [
        "| qwen2.5:7b | abcd1234 | 50% (1/2) | 100% (2/2) | 0% (0/2) | 100% (1/1) | 100% (1/1) | 50% (1/2) | 10.0 "
        "| — | [a.json](eval-runs/a.json) |",
        "| qwen2.5:7b | abcd1234 | 100% (1/1) | 100% (1/1) | 0% (0/1) | 0% (0/1) | 100% (1/1) | 0% (0/1) | 10.0 "
        "| — | [b.json](eval-runs/b.json) |",
    ]
    header = out.index(rows[0]) - 2
    assert out[header].startswith("| Model | Prompt | Rules followed |")


def test_an_incomplete_run_is_graded_but_its_row_says_it_is_not_for_the_readme(tmp_path, capsys):
    name = write(tmp_path, "fermata.json", run([answer()], complete=False))
    assert grading.main([name], project_dir=tmp_path) == 0
    out = capsys.readouterr().out
    assert "eval-runs/fermata.json — qwen2.5:7b · prompt abcd1234 · corsa incompleta" in out
    assert "[fermata.json](eval-runs/fermata.json) (incompleta) |" in out
    assert "Le corse incomplete non vanno nel README" in out


def test_a_live_check_or_unreadable_file_is_refused_by_name_and_the_others_are_graded(tmp_path, capsys):
    live = write(tmp_path, "controllo.json", {"startedAt": "2026-11-07T18:30:05Z", "situations": []})
    broken = write(tmp_path, "rotto.json", "{non è json")
    good = write(tmp_path, "buona.json", run([answer()]))
    assert grading.main([live, broken, "eval-runs/manca.json", good], project_dir=tmp_path) == 1
    out, err = capsys.readouterr()
    assert f"✗ {live}: non è una corsa del set di valutazione" in err
    assert f"✗ {broken}: illeggibile" in err
    assert "✗ eval-runs/manca.json: non trovato" in err
    assert "[buona.json](eval-runs/buona.json)" in out


def test_no_file_given_is_refused(capsys):
    assert grading.main([]) == 2
    assert "Indica almeno un file dei risultati" in capsys.readouterr().err
