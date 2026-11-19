"""La bozza delle corse etichettate: corse salvate copiate senza id, percorso, data vera né nome
originale, cifre spostate di qualche punto, etichetta vuota, in un file che git ignora. Il database
è quello di prova; nessuna corsa vera."""

import asyncio
import json
import random

import pytest

from app import labeled_rides
from app.athlete_data import AthleteData


def bike(i: int, **extra) -> dict:
    return {"id": 9_000_000 + i, "type": "Ride", "name": f"Giro del lago con Marco {i}",
            "start_date": f"2026-0{1 + i % 9}-{10 + i % 18}T07:00:00Z", "start_date_local": "2026-01-10T08:00:00",
            "moving_time": 3600 + 60 * i, "distance": 30_000 + 100 * i, "average_watts": 180 + i,
            "weighted_average_watts": 200 + i, "average_heartrate": 140, "max_watts": 600, "max_heartrate": 175,
            "device_watts": True, "has_heartrate": True,
            "map": {"summary_polyline": "abc"}, "workout_type": 11 if i == 0 else None, **extra}


def run(activity_store, test_database, tmp_path, acts, athlete=None, argv=(), tuning_file=None):
    if acts:
        asyncio.run(activity_store.save_activities(activity_store.generation, acts))
    out = tmp_path / ("labeled-rides-check-draft.json" if "check" in argv else "labeled-rides-draft.json")
    data = AthleteData(test_database)
    for key, value in (athlete or {}).items():
        asyncio.run(data.save(key, value))
    code = labeled_rides.main(list(argv), store=activity_store, athlete=data, out=out, rng=random.Random(1),
                              sources_file=tmp_path / "sources.json",
                              tuning_file=tuning_file or tmp_path / "labeled_rides.json")
    return code, out


def sources(tmp_path) -> dict:
    return json.loads((tmp_path / "sources.json").read_text())


def test_the_draft_has_anonymized_rides_with_an_empty_label(activity_store, test_database, tmp_path, capsys):
    acts = [bike(i) for i in range(5)] + [{**bike(9), "type": "Run"}]
    code, out = run(activity_store, test_database, tmp_path, acts,
                    {"settings": {"ftpDeclared": 250, "hrLthr": 165}})
    assert code == 0
    draft = json.loads(out.read_text())
    text = out.read_text()
    assert len(draft["rides"]) == 5
    for original in acts:
        assert str(original["id"]) not in text
        assert original["start_date"][:10] not in text
    assert not any(word in text for word in ("lago", "Marco", "summary_polyline", "abc"))
    assert {r["label"] for r in draft["rides"]} == {""}
    assert 250 * 0.97 <= draft["ftp"] <= 250 * 1.03 and 165 * 0.97 <= draft["lthr"] <= 165 * 1.03
    assert any(r["gara"] for r in draft["rides"])
    for ride, original in zip(sorted(draft["rides"], key=lambda r: r["durataMin"]),
                              sorted(acts[:5], key=lambda a: a["moving_time"])):
        assert abs(ride["durataMin"] - original["moving_time"] / 60) <= original["moving_time"] / 60 * 0.03 + 1
        assert abs(ride["avgWatts"] - original["weighted_average_watts"]) <= original["weighted_average_watts"] * 0.03 + 1
    out_text = capsys.readouterr().out
    assert "Scritte 5 corse" in out_text and "ne volevo 40" in out_text
    assert labeled_rides.FINAL_FILES["tuning"] in out_text


def test_at_most_40_rides_spread_over_the_whole_history(activity_store, test_database, tmp_path):
    acts = [bike(i, start_date=f"20{10 + i // 12:02d}-{1 + i % 12:02d}-05T07:00:00Z") for i in range(100)]
    code, out = run(activity_store, test_database, tmp_path, acts)
    rides = json.loads(out.read_text())["rides"]
    assert code == 0 and len(rides) == labeled_rides.WANTED


@pytest.mark.parametrize("name, kept", [
    ("Giro del lago con Marco", "Giro"),
    ("6x3' VO2 a Montevecchia", "6x3' VO2"),
    ("Z2 lungo con Luca e Anna", "Z2 lungo"),
    ("Passeggiata a Bergamo", "Uscita"),
    ("Criterium di Brescia", "Criterium"),
])
def test_names_keep_only_training_words(name, kept):
    assert labeled_rides.training_name(name) == kept


def test_no_saved_rides_stops_saying_to_connect_strava(activity_store, test_database, tmp_path, capsys):
    code, out = run(activity_store, test_database, tmp_path, [])
    assert code == 1 and not out.exists()
    assert "collega Strava" in capsys.readouterr().err


def test_an_existing_draft_is_overwritten_and_the_command_says_so(activity_store, test_database, tmp_path, capsys):
    (tmp_path / "labeled-rides-draft.json").write_text("{}")
    run(activity_store, test_database, tmp_path, [bike(1)])
    assert "(sovrascritta)" in capsys.readouterr().out


def test_each_draft_ride_says_whether_a_power_meter_measured_its_power(activity_store, test_database, tmp_path):
    acts = [bike(1, device_watts=True), bike(2, device_watts=False, moving_time=9000)]
    code, out = run(activity_store, test_database, tmp_path, acts)
    rides = sorted(json.loads(out.read_text())["rides"], key=lambda r: r["durataMin"])
    assert code == 0 and [r["potenzaMisurata"] for r in rides] == [True, False]


def labelled(draft):
    """La bozza con un'etichetta su ogni corsa, come diventa il Tuning set."""
    data = json.loads(draft.read_text())
    draft.write_text(json.dumps({**data, "rides": [{**r, "label": "fondo"} for r in data["rides"]]}))
    return draft


def many(count: int) -> list:
    return [bike(i, start_date=f"20{10 + i // 12:02d}-{1 + i % 12:02d}-05T07:00:00Z") for i in range(count)]


def test_the_check_set_never_repeats_a_tuning_set_ride(activity_store, test_database, tmp_path, capsys):
    _, draft = run(activity_store, test_database, tmp_path, many(100))
    tuning = sources(tmp_path)["tuning"]
    code, out = run(activity_store, test_database, tmp_path, [], argv=["--set", "check"], tuning_file=labelled(draft))
    assert code == 0 and len(tuning) == 40
    check = sources(tmp_path)["check"]
    assert len(check) == 40 and not set(check) & set(tuning)
    assert {r["label"] for r in json.loads(out.read_text())["rides"]} == {""}
    assert labeled_rides.FINAL_FILES["check"] in capsys.readouterr().out


def test_with_few_rides_the_check_set_takes_all_the_others_and_says_how_many(activity_store, test_database,
                                                                            tmp_path, capsys):
    _, draft = run(activity_store, test_database, tmp_path, many(55))
    capsys.readouterr()
    code, out = run(activity_store, test_database, tmp_path, [], argv=["--set", "check"], tuning_file=labelled(draft))
    assert code == 0 and len(json.loads(out.read_text())["rides"]) == 15
    assert "Scritte 15 corse" in capsys.readouterr().out


def test_without_the_record_the_tuning_set_rides_are_matched_again_one_by_one(activity_store, test_database,
                                                                             tmp_path):
    code, draft = run(activity_store, test_database, tmp_path, many(100))
    tuning = sources(tmp_path)["tuning"]
    (tmp_path / "sources.json").unlink()
    code, _ = run(activity_store, test_database, tmp_path, [], argv=["--set", "check"], tuning_file=labelled(draft))
    assert code == 0 and sources(tmp_path)["tuning"] == tuning
    assert not set(sources(tmp_path)["check"]) & set(tuning)


def test_without_the_record_and_with_rides_that_no_longer_match_it_stops(activity_store, test_database, tmp_path,
                                                                        capsys):
    code, draft = run(activity_store, test_database, tmp_path, many(100))
    (tmp_path / "sources.json").unlink()
    newer = [bike(200 + i, start_date=f"2030-0{1 + i}-05T07:00:00Z") for i in range(3)]
    code, out = run(activity_store, test_database, tmp_path, newer, argv=["--set", "check"], tuning_file=labelled(draft))
    assert code == 2 and not out.exists() and not (tmp_path / "sources.json").exists()
    assert "Non posso evitare che il Check set ripeta corse del Tuning set" in capsys.readouterr().err


def test_a_record_that_no_longer_names_the_tuning_set_is_rebuilt_before_use(activity_store, test_database, tmp_path):
    _, draft = run(activity_store, test_database, tmp_path, many(100))
    tuning = sources(tmp_path)["tuning"]
    labelled(draft)
    # Una bozza del Tuning set rifatta in un'altra cartella e non messa al suo posto cambia l'elenco.
    stale = {"tuning": [a["id"] for a in many(100) if a["id"] not in tuning][:40]}
    (tmp_path / "sources.json").write_text(json.dumps(stale))
    code, _ = run(activity_store, test_database, tmp_path, [], argv=["--set", "check"], tuning_file=draft)
    assert code == 0 and sources(tmp_path)["tuning"] == tuning
    assert not set(sources(tmp_path)["check"]) & set(tuning)


def test_without_the_tuning_set_file_the_check_set_does_not_start(activity_store, test_database, tmp_path, capsys):
    run(activity_store, test_database, tmp_path, many(100))
    code, out = run(activity_store, test_database, tmp_path, [], argv=["--set", "check"],
                    tuning_file=tmp_path / "missing.json")
    assert code == 2 and not out.exists()
    assert "manca missing.json" in capsys.readouterr().err
