// Spiegazioni dei grafici condivisi fra le schermate.

import type { Explanation } from './types.ts';

export const CHART_EXPLANATIONS = {
  dailyLoad: {
    title: 'Carico ultimi 30 giorni',
    short: 'Quanto ti ha impegnato ogni giornata, in un solo numero. La linea tratteggiata è la tua media di questi 30 giorni.',
    lead: [
      'Ogni uscita riceve un punteggio che cresce con la durata e con l\'intensità: un\'ora tutta alla tua soglia vale 100.',
      'Il colore dice com\'è stata la giornata: bici facile, bici dura, uscita lunga (almeno due ore), altro sport o riposo.',
      'Le barre sopra la media mostrano i giorni in cui hai caricato più del solito.',
    ],
    technical: [
      'Con la potenza il punteggio è il TSS: ore × (potenza normalizzata ÷ FTP)² × 100. La potenza normalizzata viene dai dati secondo per secondo, se scaricati, altrimenti dalla potenza media pesata di Strava.',
      'Senza potenza si usa l\'hrTSS: ore × (frequenza cardiaca media ÷ LTHR)² × 100. Senza soglia si stima dalla frequenza massima, poi dal Suffer Score di Strava, infine dalla sola durata.',
      'Gli altri sport valgono una parte del punteggio, secondo il tipo (la bici vale per intero); le escursioni con molto dislivello hanno un calcolo proprio.',
      'Una giornata è dura quando l\'uscita in bici supera l\'85% della FTP, o il 92% della LTHR in frequenza cardiaca; senza questi dati, quando il Suffer Score è almeno 60 o il titolo indica un lavoro strutturato (soglia, intervalli, VO2…).',
    ],
  },
} satisfies Record<string, Explanation>;
