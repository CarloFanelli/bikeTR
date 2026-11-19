-- La serie compatta di una corsa: potenza e frequenza cardiaca in medie di `step` secondi, un
-- elemento per passo dall'inizio della registrazione; NULL dove il segnale manca (pausa, fascia
-- staccata) e per tutta la colonna se la corsa non ha quel segnale. Serve a riconoscere la forma
-- dell'uscita (blocchi duri e recuperi) con l'FTP e la soglia di oggi. Se ne va con la corsa,
-- quindi anche con "Disconnetti da Strava".
CREATE TABLE ride_series (
    activity_id BIGINT PRIMARY KEY REFERENCES strava_activities (id) ON DELETE CASCADE,
    step        INTEGER NOT NULL,
    watts       DOUBLE PRECISION[],
    hr          DOUBLE PRECISION[]
);
