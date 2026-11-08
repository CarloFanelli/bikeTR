"""Catalogo dei protocolli: nomi, watt e passi uguali a quelli del codice del browser
(fixtures/coach_expected.json), a più FTP e durate, anche alla durata minima di ogni protocollo e
un minuto sotto. Le fonti no: il browser citava paper su altro, il catalogo ora cita i paper di
supporto."""

import pytest

from app.protocols import PROTOCOLS
from fixture_data import load

EXPECTED = load("coach_expected.json")


def test_catalog_has_the_browser_protocols_in_the_same_order():
    assert list(PROTOCOLS) == list(EXPECTED["catalog"])


@pytest.mark.parametrize("protocol_id", list(EXPECTED["catalog"]))
def test_protocol_builds_the_browser_workout(protocol_id):
    exp, proto = EXPECTED["catalog"][protocol_id], PROTOCOLS[protocol_id]
    assert proto.name == exp["name"]
    for b in exp["builds"]:
        assert proto.build(b["ftp"], b["duration"]) == b["built"], (b["ftp"], b["duration"])


def test_reference_covers_a_too_short_duration_for_every_protocol_with_a_minimum():
    too_short = {pid for pid, exp in EXPECTED["catalog"].items()
                 if any(b["built"] is None for b in exp["builds"])}
    assert too_short == {"sweet_spot_3x15", "threshold_3x10", "seiler_4x8", "seiler_4x4",
                         "ronnestad_30_15", "over_under", "z2_cadence_drills", "tempo_2x20"}
