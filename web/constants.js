// Configurazione runtime: limiti rete. Modificabili a mano via
// devtools (window.APP_CONFIG) o in futuro tramite UI settings.
// Le costanti fisiologiche sono in src/core/physio.ts, i pesi per tipo di attività
// in src/core/load.ts.
import { MAX_SEGMENTS_HYDRATE } from './src/data/segments.ts';
import { MAX_STREAMS_FETCH } from './src/data/streams.ts';

export const APP_CONFIG = {
  maxStreamsFetch: MAX_STREAMS_FETCH,
  maxSegmentsHydrate: MAX_SEGMENTS_HYDRATE,
};
