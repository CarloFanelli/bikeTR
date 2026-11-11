// Spiegazioni di Impostazioni: l'aiuto dei campi e come usare l'Ollama del computer, con
// file e comandi nella parte tecnica.

import type { Explanation } from './types.ts';

export const SETTINGS_EXPLANATIONS = {
  goal: {
    title: 'Obiettivo',
    short: 'Il consiglio di ogni giorno punta a migliorare soglia e FTP. Tiene conto del carico degli ultimi 7 e 28 giorni e del recupero.',
  },
  availableDays: {
    title: 'Giorni disponibili per allenarmi',
    short: 'I giorni che non scegli diventano riposo nel piano.',
  },
  longRideDays: {
    title: 'Giorni per uscita lunga',
    short: 'Solo questi giorni possono avere l\'uscita lunga nel piano della settimana. Di base è il sabato.',
  },
  longRideMaxMin: {
    title: 'Durata massima dell\'uscita lunga',
    short: 'L\'uscita lunga del piano si accorcia a questa durata. Se il campo è vuoto vale 180 minuti.',
  },
  race: {
    title: 'Gara',
    short: 'Con una data, le tre settimane prima diventano scarico: meno volume, stessa intensità.',
    lead: [
      'Lo scarico (taper) toglie volume settimana dopo settimana ma tiene le ripetute intense, così arrivi fresco senza perdere forma.',
      'Le percentuali vengono da una revisione di Mujika (2018).',
    ],
    rows: [['3 settimane prima', 'volume −20%'], ['2 settimane prima', 'volume −40%'], ['Ultima settimana', 'volume −55%']],
  },
  recovery: {
    title: 'Recupero',
    short: 'Se li hai, i giorni di recupero e il dopo-allenamento dei giorni duri includono le note per usarli.',
    lead: [
      'Compressione e massage gun agiscono su cose diverse: la prima aiuta il ritorno di sangue e linfa, il secondo il tono dei muscoli, quindi usarli insieme probabilmente somma i benefici.',
      'Il massage gun non va usato subito prima di sprint o forza esplosiva: per poco tempo riduce la prontezza dei muscoli.',
    ],
  },
  chatModel: {
    title: 'Modello chat',
    short: 'Il modello che scrive il workout del Coach. Si sceglie nella configurazione del servizio Coach.',
    lead: ['Un modello locale (Ollama) tiene tutto sul computer; uno cloud manda i numeri dell\'allenamento al provider e costa per ogni risposta.'],
    technical: ['Il modello si sceglie nel file .env (righe d\'esempio in .env.example), poi si esegue di nuovo docker compose up -d.'],
  },
  ollama: {
    title: 'Usare l\'Ollama del computer',
    short: 'Di base il Coach usa l\'Ollama avviato da Docker, senza configurare nulla. Puoi usare quello installato sul computer, per esempio per sfruttare la GPU del Mac.',
    lead: [
      'Al primo avvio Docker scarica il modello chat, circa 5 GB.',
      'Per passare all\'Ollama del computer si cambiano due righe di configurazione e si riavvia; i passi sono qui sotto.',
    ],
    technical: [
      'L\'avanzamento del primo download è in docker compose logs -f ollama-pull.',
      'Nel file .env togli il # da OLLAMA_CONTAINERS=0 e da OLLAMA_URL=http://host.docker.internal:11434, poi esegui di nuovo docker compose up -d.',
      'Scarica il modello chat sul computer con ollama pull qwen2.5:7b.',
      'Se la verifica non risponde, avvia Ollama in ascolto su tutte le interfacce: OLLAMA_HOST=0.0.0.0 ollama serve.',
    ],
  },
} satisfies Record<string, Explanation>;
