// Configurazione runtime: limiti rete. Modificabili a mano via
// devtools (window.APP_CONFIG) o in futuro tramite UI settings.
// Le costanti fisiologiche sono in src/core/physio.ts, i pesi per tipo di attività
// in src/core/load.ts.
export const APP_CONFIG = {
  maxStreamsFetch: 40,
  maxSegmentsHydrate: 30,
};
