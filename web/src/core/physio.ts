// Limiti delle zone di frequenza cardiaca come frazione della soglia (LTHR), usati per
// il tempo in zona calcolato dagli stream.
// Sorgenti: Coggan/Allen (Training and Racing with a Power Meter, 2010),
// Friel (Cyclist's Training Bible).

export const PHYSIO = {
  // Zone FC come frazione di LTHR (Coggan modificato Friel).
  Z2_PCT_LTHR: [0.75, 0.88],
  Z3_PCT_LTHR: [0.88, 0.94],
  Z4_PCT_LTHR: [0.94, 1.05],
};
