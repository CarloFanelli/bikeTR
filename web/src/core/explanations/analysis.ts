// Spiegazioni di Analisi: una per card, con il metodo di polarizzazione e quello di FTP e
// LTHR nella parte tecnica. Il carico giornaliero sta in charts.ts.

import type { Explanation } from './types.ts';

export const ANALYSIS_EXPLANATIONS = {
  segmentPredictions: {
    title: 'Previsioni sui segmenti',
    short: 'Per ogni segmento con la stella su Strava: come vanno gli ultimi 10 tentativi e il tempo stimato al prossimo, con la forma di oggi.',
    lead: [
      'La previsione guarda a circa due settimane da oggi e tiene conto di quanto sei fresco: più forma, tempo migliore.',
      '"Completa da dettagli attività" recupera i tentativi che Strava non elenca, leggendoli dalle tue uscite.',
    ],
    technical: [
      'La lista dei tentativi di Strava lascia fuori le uscite visibili solo ai follower: il completamento legge il dettaglio di ogni uscita recente e unisce i tentativi trovati, senza cancellare quelli già salvati.',
      '"Svuota cache e ricarica" butta i segmenti salvati nel browser e li riscarica tutti da Strava.',
    ],
  },
  formTrend: {
    title: 'Trend della forma',
    short: 'Fitness, fatica e forma degli ultimi 90 giorni. La forma è la fitness meno la fatica: sopra zero sei fresco.',
    lead: [
      'La fitness (CTL) cresce lentamente con il volume di settimane e mesi; la fatica (ATL) sale in fretta nei giorni duri.',
      'Una forma negativa vuol dire che stai costruendo; positiva che sei pronto a dare il massimo.',
    ],
    technical: [
      'CTL: media del carico giornaliero (TSS) degli ultimi 42 giorni, con più peso ai giorni recenti. ATL: la stessa media sugli ultimi 7 giorni. TSB = CTL − ATL.',
    ],
    rows: [['Fresco', 'forma sopra +5'], ['Neutro', 'da −10 a +5'], ['Affaticato', 'da −20 a −10'], ['Sovraccarico', 'sotto −20']],
  },
  hrZones: {
    title: 'Zone di frequenza cardiaca',
    short: 'I minuti delle ultime 4 settimane nelle cinque zone, e quanta parte è facile o dura. L\'ideale è circa 80% facile e 20% duro.',
    lead: [
      'Ogni uscita conta come facile o dura dalla sua frequenza cardiaca media rispetto alla tua soglia (LTHR).',
      'Da 75% di facile in su va bene, 80-85% è l\'ideale; sotto il 70% c\'è troppa intensità e il miglioramento rischia di fermarsi.',
    ],
    technical: [
      'Minuti di ogni uscita = tempo in movimento × peso dello sport (bici e corsa 1, forza 0,5, camminata 0,2).',
      'Facile se la frequenza media è sotto l\'88% della LTHR, duro dall\'88% in su; un\'uscita senza frequenza conta come facile.',
      'Limite: si usa la media dell\'uscita, non i minuti reali in ogni zona. 20 minuti a soglia dentro 80 minuti facili contano tutti come facili; con i dati secondo per secondo il conto sarebbe esatto.',
    ],
    rows: [['Buono', '75% facile o più'], ['Ideale', '80-85% facile'], ['Troppo volume', 'oltre 85% facile'], ['Troppa intensità', 'sotto 70% facile']],
  },
  powerCurve: {
    title: 'Curva di potenza',
    short: 'La tua potenza migliore per ogni durata, da pochi secondi a un\'ora, e la FTP usata in tutta l\'app con le sue fonti.',
    lead: [
      'La FTP che inserisci in Impostazioni vale su tutto; senza, l\'app usa la stima più alta fra uscite e segmenti.',
      'Per il valore più preciso serve un test dedicato: 20 minuti al massimo.',
    ],
    technical: [
      'Da uscite: miglior potenza media pesata di 20-60 minuti × 0,95. Da segmenti: miglior potenza media di 15-30 minuti × 0,95.',
      'Ogni durata della curva porta all\'uscita da cui viene.',
    ],
  },
  powerProfile: {
    title: 'Profilo di potenza',
    short: 'La tua curva confrontata con i rapporti ideali fra durate, per vedere dove sei forte e dove migliorare.',
    lead: [
      'Ogni barra confronta la tua potenza per chilo con un riferimento: verde è un punto di forza, arancione un deficit.',
      'Per ogni deficit c\'è il tipo di allenamento che lo corregge; il focus consigliato è il primo da affrontare.',
    ],
    technical: ['Servono potenza e peso corporeo (in Impostazioni). I rapporti confrontano fra loro le potenze migliori su durate diverse.'],
  },
  ftpTrend: {
    title: 'FTP nel tempo',
    short: 'La FTP stimata settimana per settimana, con il picco storico. Un plateau è una FTP ferma da diverse settimane.',
    lead: [
      'Ogni settimana l\'app salva la FTP del momento; servono almeno due settimane per vedere un andamento.',
      'Quando la FTP si ferma, cambiare tipo di allenamento aiuta a sbloccarla: il profilo di potenza indica da dove partire.',
    ],
  },
  ftpLthr: {
    title: 'Come si arriva a FTP e LTHR',
    short: 'Quale uscita e quale calcolo hanno dato la FTP e la LTHR usate in tutta l\'app. Un valore dichiarato vale su ogni stima.',
    lead: [
      'Per la FTP l\'app cerca il miglior sforzo in ogni fascia di durata e lo corregge: uno sforzo breve è sopra la FTP, uno lungo ci è vicino.',
      'Per la LTHR prende la più alta fra tre stime indipendenti, così una stima senza dati non blocca le altre.',
    ],
    technical: [
      'FTP da uscite: per ogni fascia la miglior potenza media pesata, che conta meno quanto più è vecchia (dimezza in 12 settimane), moltiplicata per il fattore della fascia. Vince la candidata più alta.',
      'FTP da segmenti: miglior potenza media su segmenti di 15-30 minuti × 0,95. La FTP stimata è la più alta fra uscite e segmenti.',
      'LTHR: frequenza massima × 0,91; miglior media di uscite di 20-60 minuti × 0,98 quando si è vicini al massimo; miglior media su segmenti di 15-45 minuti × 0,98.',
    ],
  },
  segmentWorkouts: {
    title: 'Allenamenti per i segmenti',
    short: 'Ripetute costruite sulla potenza e sulla durata dei tuoi segmenti preferiti, per migliorare il tempo.',
    lead: ['Servono almeno 3 tentativi su un segmento. Ogni allenamento indica l\'obiettivo e perché è fatto così.'],
  },
} satisfies Record<string, Explanation>;
