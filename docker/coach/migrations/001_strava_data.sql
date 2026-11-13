-- I dati di Strava dell'atleta collegato: tutte le attività, i loro dettagli corsa,
-- l'atleta con le statistiche e lo stato della sincronizzazione. "Disconnetti da Strava"
-- li cancella tutti.

-- Ogni attività com'è nella lista di Strava (nome e percorso compresi: li mostra Attività).
CREATE TABLE strava_activities (
    id          BIGINT PRIMARY KEY,
    start_date  TIMESTAMPTZ NOT NULL,
    summary     JSONB NOT NULL
);
CREATE INDEX strava_activities_newest ON strava_activities (start_date DESC, id DESC);

-- Le cifre dei dettagli corsa (stream secondo per secondo) di un'attività, scaricati una volta.
-- NULL dove l'attività non ha potenza o frequenza cardiaca.
CREATE TABLE ride_details (
    activity_id BIGINT PRIMARY KEY REFERENCES strava_activities (id) ON DELETE CASCADE,
    np          DOUBLE PRECISION,
    watts_n     INTEGER,
    hr_mean     DOUBLE PRECISION,
    hr_n        INTEGER
);

-- Una riga sola: l'atleta e le sue statistiche; quando la sincronizzazione ha chiesto a
-- Strava (checked_at, anche se poi Strava non ha risposto) e quando è arrivata in fondo
-- (synced_at); history_complete quando la lista arriva fino alla prima attività: finché è
-- falso, la sincronizzazione successiva continua dalle attività più vecchie salvate.
CREATE TABLE strava_sync (
    only_row         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (only_row),
    athlete_id       BIGINT NOT NULL,
    athlete          JSONB NOT NULL,
    stats            JSONB NOT NULL,
    checked_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ,
    history_complete BOOLEAN NOT NULL DEFAULT FALSE
);
