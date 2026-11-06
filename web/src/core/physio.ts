// Costanti fisiologiche centralizzate.
// Sorgenti: Coggan/Allen (Training and Racing with a Power Meter, 2010),
// Friel (Cyclist's Training Bible), Seiler studies, Rønnestad studies.

export const PHYSIO = {
  // Rapporto medio LTHR/HRmax (88–92% letteratura, 0.91 è il midpoint).
  // Usato simmetricamente: LTHR = HRmax × 0.91, HRmax = LTHR / 0.91.
  LTHR_OVER_HRMAX: 0.91,

  // Fattore classico Coggan: FTP ≈ 95% della potenza media tenuta in un test 20'.
  FTP_FACTOR_20MIN: 0.95,

  // Time constant esponenziale per le medie di carico (TrainingPeaks PMC).
  CTL_TC_DAYS: 42,
  ATL_TC_DAYS: 7,

  // Zone FC come frazione di LTHR (Coggan modificato Friel).
  Z1_MAX_PCT_LTHR: 0.75,
  Z2_PCT_LTHR: [0.75, 0.88],
  Z3_PCT_LTHR: [0.88, 0.94],
  Z4_PCT_LTHR: [0.94, 1.05],
  Z5_MIN_PCT_LTHR: 1.05,

  // Soglia "sforzo duro" su FC.
  HARD_HR_PCT_LTHR: 0.92,
  // Soglia "sforzo duro" su potenza (IF vs FTP).
  HARD_IF_THRESHOLD: 0.85,
  // Sufficienza dello score di sofferenza Strava per marcare un'attività dura.
  HARD_SUFFER_SCORE: 60,

  // FTP decay nei dati storici: half-life ≈ 8 settimane → divisore 12 nello scaling
  // exp(-ageWeeks / FTP_DECAY_TAU_WEEKS). Coerente con perdite ~5-7%/mese senza
  // allenamento.
  FTP_DECAY_TAU_WEEKS: 12,

  // Volume multiplier in base a forma corrente (TSB) o settimana di scarico.
  VOLUME_MUL: {
    recovery: 0.6,   // settimana di scarico programmata
    exhausted: 0.75, // TSB < -30
    tired: 0.88,     // TSB < -15
    normal: 1.0,
  },
};
