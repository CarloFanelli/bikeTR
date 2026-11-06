"""Sostituti di Strava e dell'indice dei paper per i test del workout."""

from app.strava import RideData
from fixture_data import DETAILS, NOW_MS, load

INDEX = load("papers_index.json")


class FakeRides:
    """Al posto del download da Strava: due dettagli scaricati, poi le corse date."""

    def __init__(self, acts: list):
        self.data = RideData(activities=acts, details=DETAILS, downloaded_at=NOW_MS,
                             from_saved=False, missing_details=0)
        self.calls = 0
        self.error = None

    async def refresh(self, now_ms, progress=None):
        self.calls += 1
        if self.error:
            raise self.error
        for done in (1, 2):
            progress(done, 2)
        return self.data


async def fixture_index() -> dict:
    return INDEX
