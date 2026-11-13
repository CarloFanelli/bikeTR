-- I dati dell'atleta che l'app salva, uno per chiave (settings, plannedRests, rainyDays,
-- ftpHistory, mesocycle, segmentCache, coachSettings), ognuno com'era nel browser.
-- Restano dopo "Disconnetti da Strava", tranne segmentCache, che sono dati di Strava.
CREATE TABLE athlete_data (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);
