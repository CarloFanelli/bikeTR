"""Il voto delle corse del set di valutazione: regole seguite, JSON leggibile, citazioni inventate,
paper di supporto citato e trovato, punteggio della ricerca, ripiego, secondi e costo, dai file dei risultati scritti qui a
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
        # Fuori lista e troppo lungo per 60 minuti: il Coach lascia la scelta alle regole di
        # ripiego, ma il voto guarda la scelta del modello.
        answer("over_under", protocolId="z2_endurance", fellBack=True),
        answer("sprint_9x9", protocolId="z2_endurance", fellBack=True),
        answer(raw="Scelgo il 4x8, mi sembra giusto.", protocolId="seiler_4x8", fellBack=True),
        answer(truncated=True, protocolId="seiler_4x8", fellBack=True),
    ])
    assert scores.rules_followed == (1, 5)
    assert scores.readable == (3, 5)
    assert scores.fallback == (4, 5)


def test_a_pmid_not_given_in_the_list_or_in_the_text_is_an_invented_citation():
    # Un file di prima dei passaggi: si contano i PMID della lista paperUsati e del testo, come allora.
    scores = grade([
        answer(cited=[SEILER]),
        answer(cited=["99999999"]),
        answer(rationale="Come in [PMID:99999999], meglio intervalli."),
        answer(cited=[int(SEILER), SEILER, f"PMID:{SEILER}"]),
        answer(),
    ])
    assert scores.invented == (2, 5)


def test_the_source_paper_of_a_selection_rule_is_shown_by_the_prompt_and_not_invented():
    # Le fonti delle regole: Seiler 2010 (20861519) e Stöggl 2014 (24550842).
    scores = grade([
        answer(cited=["20861519", "24550842"]),
        answer(rationale="Poco lavoro duro, come in [PMID:24550842]."),
        answer(cited=["24550842", "99999999"]),
    ])
    assert scores.invented == (1, 3)
    # Per il paper trovato dalla ricerca contano solo i paper dati, non le fonti delle regole.
    assert grade([answer("seiler_4x8", cited=["20861519"], given=(OTHER,))]).support_found == (0, 1)


def labelled(cited=(), rationale="Forma alta.", protocol="seiler_4x8") -> dict:
    """Una risposta di un file con i passaggi: il modello cita etichette in passaggiUsati e nel
    razionale, e il file registra i passaggi dati (§1 e §3 di Seiler, §2 dell'altro paper). json.dumps
    scrive "§" come \\u00a7, come può farlo un modello."""
    raw = json.dumps({"protocolId": protocol, "razionale": rationale, "passaggiUsati": list(cited)})
    given = [f"PMID:{SEILER} §1", f"PMID:{SEILER} §3", f"PMID:{OTHER} §2"]
    return answer(protocol, raw=raw, passagesFound=[{"label": label, "score": 0.5} for label in given])


@pytest.mark.parametrize("cited, rationale, invented", [
    # Un'etichetta data non è inventata: le sue cifre non sono un PMID "3".
    ([f"PMID:{SEILER} §3"], f"Come in [PMID:{SEILER} §1].", False),
    ([f"PMID:{SEILER} §2"], "Forma alta.", True),
    ([], f"Come in [PMID:{RONNESTAD} §1].", True),
    ([], "Come in [PMID:99999999 §1].", True),
    # Un paper dato citato senza passaggio, come prima dei passaggi.
    ([], f"Come in [PMID:{OTHER}].", False),
    # La fonte di una regola: il suo PMID è nel prompt, un suo passaggio non dato no.
    ([], "Poco lavoro duro [PMID:24550842].", False),
    ([], "Poco lavoro duro [PMID:24550842 §1].", True),
    # La stessa etichetta inventata nel razionale e nella lista conta una volta.
    ([f"PMID:{SEILER} §2"], f"Come in [PMID:{SEILER} §2].", True),
], ids=["given", "section-not-given", "paper-not-given", "paper-not-in-index", "paper-only", "rule-source",
        "rule-source-label", "both-places"])
def test_a_cited_label_not_given_in_that_answer_is_invented(cited, rationale, invented):
    assert grade([labelled(cited, rationale)]).invented == (int(invented), 1)


def test_a_label_of_the_supporting_paper_counts_as_citing_it():
    assert grade([labelled([f"PMID:{SEILER} §3"])]).support_cited == (1, 1)


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


def test_the_search_score_counts_each_situation_once_from_the_papers_found_its_file_records():
    scores = grade([
        # Forma +10: un errore, poi la prima risposta riuscita trova Rønnestad; la ripetizione,
        # che ha la stessa ricerca, non conta di nuovo.
        failure(),
        answer(given=(RONNESTAD, OTHER)),
        answer(given=(OTHER,), repeat=2),
        # Il paper atteso è Seiler 2011, che la ricerca non trova.
        answer(given=(OTHER,), situation="forma-esattamente-piu-5"),
        # Solo risposte fallite: nessun paper trovato.
        failure(situation="due-ore-esatte"),
        # Solo protocolli di pratica (riposo): nessun paper atteso, non conta.
        answer("rest", situation="riposo-dopo-blocco"),
        answer(situation="vecchia-situazione"),
    ])
    assert scores.expected_found == (1, 3)


def test_with_no_situation_that_has_an_expected_paper_the_search_score_is_a_dash():
    scores = grade([answer("rest", situation="riposo-dopo-blocco")])
    assert scores.expected_found == (0, 0)
    assert "  Punteggio della ricerca, paper atteso trovato: —" in grading.report(run([]), scores, "corsa.json")


def drafted(*raws: str, cause=None, dropped=(), **fields) -> dict:
    """Una risposta con le sue bozze, come le registra il grafo: l'ultima è la risposta."""
    drafts = [{"modelRaw": r, "truncated": False} for r in raws]
    return answer(raw=raws[-1], drafts=drafts, fallbackCause=cause, citationsDropped=list(dropped),
                  fellBack=cause is not None, **fields)


def choice(protocol: str) -> str:
    return json.dumps({"protocolId": protocol, "razionale": "x", "passaggiUsati": []})


def test_an_answer_sent_back_for_the_rule_then_delivered_counts_only_in_rules_followed():
    scores = grade([drafted(choice("rest"), choice("seiler_4x8")), drafted(choice("seiler_4x8"))])
    assert (scores.rules_followed, scores.rules_first) == ((2, 2), (1, 2))
    assert scores.average_drafts == 1.5


def test_answers_are_counted_per_fallback_cause_and_citations_dropped():
    scores = grade([drafted(choice("rest"), choice("rest"), choice("rest"), cause="not_allowed"),
                    drafted("", "", "", cause="unreadable"),
                    drafted(choice("seiler_4x8"), cause="truncated", truncated=True),
                    drafted(choice("rest"), cause="not_allowed"),
                    drafted(choice("seiler_4x8"), dropped=["PMID:9 §1"]),
                    answer("over_under", fellBack=True)])
    assert scores.fallback_causes == {"truncated": 1, "unreadable": 1, "too_long": 1, "not_allowed": 2}
    assert scores.fallback == (5, 6) and scores.citations_dropped == (1, 6)
    assert scores.average_drafts == pytest.approx(10 / 6)


def test_an_old_fallback_answer_that_todays_catalog_accepts_counts_under_no_cause():
    # Un file di prima delle bozze: Seiler in 60 minuti oggi si può usare, ma allora era andato al ripiego.
    scores = grade([answer("seiler_4x8", fellBack=True)])
    assert (scores.fallback, scores.fallback_causes) == ((1, 1), {})


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
    # File di prima delle bozze: la prima bozza è la risposta, e la causa del ripiego viene da lei (Over-Under
    # in 60 minuti: troppo lungo).
    assert out[:16] == [
        "eval-runs/a.json — qwen2.5:7b · prompt abcd1234 · corsa completa",
        "  Risposte valutate: 2 · errori: 0",
        "  Regole seguite: 50% (1/2)",
        "  Regole seguite alla prima bozza: 50% (1/2)",
        "  JSON leggibile: 100% (2/2)",
        "  Citazioni inventate: 0% (0/2)",
        "  Citazioni tolte dalla scheda: 0% (0/2)",
        "  Paper di supporto citato: 100% (1/1)",
        "  Paper di supporto trovato dalla ricerca: 100% (1/1)",
        "  Punteggio della ricerca, paper atteso trovato: 100% (1/1)",
        "  Ripiego usato: 50% (1/2)",
        "  Cause del ripiego: troppo lungo 1",
        "  Bozze per risposta (media): 1.0",
        "  Secondi (mediana): 10.0",
        "  Costo per risposta: —",
        "  Non eseguite: " + ", ".join(s["name"] for s in SITUATIONS if s["name"] != FRESH),
    ]
    rows = [line for line in out if line.startswith("| qwen2.5:7b")]
    assert rows == [
        "| qwen2.5:7b | abcd1234 | 50% (1/2) | 50% (1/2) | 100% (2/2) | 0% (0/2) | 0% (0/2) | 100% (1/1) | 100% (1/1) "
        "| 100% (1/1) | 50% (1/2) | too_long 1 | 1.0 | 10.0 | — | [a.json](eval-runs/a.json) |",
        "| qwen2.5:7b | abcd1234 | 100% (1/1) | 100% (1/1) | 100% (1/1) | 0% (0/1) | 0% (0/1) | 0% (0/1) | 100% (1/1) "
        "| 100% (1/1) | 0% (0/1) | — | 1.0 | 10.0 | — | [b.json](eval-runs/b.json) |",
    ]
    header = out.index(rows[0]) - 2
    assert out[header].startswith("| Model | Prompt | Rules followed |")
    assert "| Support found | Expected paper found | Fallback |" in out[header]


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
