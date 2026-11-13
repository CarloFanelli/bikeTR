-- Le richieste di dettagli corsa del download in sottofondo: al massimo 60 ogni 15 minuti e
-- 600 al giorno. Restano dopo "Disconnetti da Strava": il limite di Strava è dell'app, non
-- dell'atleta, e un nuovo collegamento non deve ripartire da zero.
CREATE TABLE detail_requests (
    at TIMESTAMPTZ NOT NULL
);
CREATE INDEX detail_requests_at ON detail_requests (at);

-- Le attività il cui download dei dettagli non è riuscito: si riprovano dopo le altre,
-- dalla più vecchia a fallire.
CREATE TABLE detail_failures (
    activity_id BIGINT PRIMARY KEY REFERENCES strava_activities (id) ON DELETE CASCADE,
    failed_at   TIMESTAMPTZ NOT NULL
);
