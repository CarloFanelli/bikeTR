"""La forma di un'uscita dalla sua serie compatta, con FTP e soglia cardiaca di oggi: blocchi duri,
recuperi dopo ognuno e minuti per zona, su serie inventate di passi da 15 secondi."""

from app.ride_shape import ride_shape

FTP = 250
LTHR = 170


def minutes(n: float, value) -> list:
    return [value] * int(n * 4)


def series(watts=None, hr=None) -> dict:
    return {"step": 15, "watts": watts, "hr": hr}


def test_two_by_twenty_gives_two_blocks_with_their_recoveries():
    watts = minutes(10, 150) + minutes(20, 240) + minutes(5, 150) + minutes(20, 240) + minutes(10, 150)
    shape = ride_shape(series(watts=watts), True, FTP, LTHR)
    assert shape["fonte"] == "potenza"
    assert shape["blocchi"] == [{"minuti": 20, "zona": 4, "recuperoMin": 5},
                                {"minuti": 20, "zona": 4, "recuperoMin": 10}]
    assert shape["minutiPerZona"] == {"Z1": 0, "Z2": 25, "Z3": 0, "Z4": 40, "Z5": 0, "Z6": 0}


def test_three_by_ten_in_z3_from_heart_rate_without_a_power_meter():
    hr = minutes(10, 140) + (minutes(10, 150) + minutes(4, 130)) * 3
    shape = ride_shape(series(watts=minutes(52, 200), hr=hr), False, FTP, LTHR)
    assert shape["fonte"] == "fc"
    assert [(b["minuti"], b["zona"]) for b in shape["blocchi"]] == [(10, 3)] * 3


def test_one_activation_in_a_long_easy_ride_is_a_single_block():
    watts = minutes(90, 160) + minutes(3, 200) + minutes(90, 160)
    assert [b["minuti"] for b in ride_shape(series(watts=watts), True, FTP, LTHR)["blocchi"]] == [3]


def test_a_50_second_effort_is_not_a_hard_block():
    watts = minutes(10, 150) + [300] * 3 + [150] * 1 + minutes(10, 150)
    assert ride_shape(series(watts=watts), True, FTP, LTHR)["blocchi"] == []


def test_a_20_second_dip_does_not_split_a_block():
    watts = minutes(5, 150) + minutes(5, 240) + [150] + minutes(5, 240) + minutes(5, 150)
    assert [b["minuti"] for b in ride_shape(series(watts=watts), True, FTP, LTHR)["blocchi"]] == [10.25]


def test_heart_rate_dropouts_are_neither_recovery_nor_a_split():
    hr = minutes(5, 160) + minutes(1, None) + minutes(5, 160) + minutes(3, None) + minutes(2, 130)
    shape = ride_shape(series(hr=hr), False, None, LTHR)
    assert shape["blocchi"] == [{"minuti": 10, "zona": 3, "recuperoMin": 2}]


def test_with_a_power_meter_heart_rate_fills_only_where_power_is_missing():
    watts = minutes(5, 150) + minutes(5, None) + minutes(5, 150)
    hr = minutes(5, 165) + minutes(5, 165) + minutes(5, 165)
    shape = ride_shape(series(watts=watts, hr=hr), True, FTP, LTHR)
    assert shape["fonte"] == "potenza e fc"
    assert [b["minuti"] for b in shape["blocchi"]] == [5]


def test_without_ftp_heart_rate_is_used_and_without_lthr_or_signals_there_is_no_shape():
    hr = minutes(10, 165)
    assert ride_shape(series(watts=minutes(10, 300), hr=hr), True, None, LTHR)["fonte"] == "fc"
    assert ride_shape(series(watts=minutes(10, 300), hr=hr), False, FTP, None) is None
    assert ride_shape(series(), True, FTP, LTHR) is None
    assert ride_shape(None, True, FTP, LTHR) is None


def test_a_new_ftp_changes_the_shape_of_the_same_series():
    watts = minutes(10, 150) + minutes(10, 200) + minutes(10, 150)
    assert ride_shape(series(watts=watts), True, 250, LTHR)["blocchi"] != []
    assert ride_shape(series(watts=watts), True, 300, LTHR)["blocchi"] == []


def test_the_load_per_hour_comes_from_known_heart_rate_even_with_a_power_meter():
    # 30 minuti a soglia e 30 al 70%: (1 + 0.49) / 2 * 100 punti l'ora; i buchi non contano.
    hr = minutes(30, LTHR) + minutes(5, None) + minutes(30, 0.7 * LTHR)
    shape = ride_shape(series(watts=minutes(65, 150), hr=hr), True, FTP, LTHR)
    assert shape["caricoOra"] == 74.5
    assert ride_shape(series(watts=minutes(12, 150)), True, FTP, LTHR)["caricoOra"] is None
    assert ride_shape(series(watts=minutes(12, 150), hr=hr), True, FTP, None)["caricoOra"] is None
