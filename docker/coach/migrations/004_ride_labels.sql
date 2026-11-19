-- Il tipo di uscita (recupero, fondo, ripetute, gara) che il modello che etichetta ha dato a una
-- corsa, con il nome di quel modello: un altro modello la etichetta di nuovo. Le etichette della
-- regola non si salvano. Se ne vanno con la corsa, quindi anche con "Disconnetti da Strava".
CREATE TABLE ride_labels (
    activity_id BIGINT PRIMARY KEY REFERENCES strava_activities (id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    model       TEXT NOT NULL
);
