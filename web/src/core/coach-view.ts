// Testi del Coach AI: il profilo atleta inviato al servizio, la durata di partenza, le righe
// della card del workout e il modello in uso. Ricevono i dati e restituiscono testi o valori,
// senza leggere il browser.

import type {
  AthleteProfile, CoachStatus, CoachWorkout, ConnectionCheck, PaperRef, PassageQuote,
} from './coach-types.ts';
import type { HrProfile } from './hr.ts';
import type { Settings } from './settings.ts';

// Le stesse FTP e soglie del resto dell'app; i valori mancanti viaggiano come null.
export function coachProfile(hr: HrProfile, settings: Settings): AthleteProfile {
  return {
    ftp: hr.ftp || null,
    lthr: hr.hrLthr || null,
    hrMax: hr.hrMax || null,
    weight: settings.weight || null,
    weeklyHours: settings.weeklyHours || null,
    weeklyDays: settings.weeklyDays || null,
  };
}

// Le durate che il servizio Coach accetta: rifiuta le altre.
export const MIN_DURATION = 30;
export const MAX_DURATION = 240;

// La durata con cui si apre il Coach: l'ultima chiesta, portata dentro i limiti, così il primo
// clic non viene rifiutato; 60 quando non ce n'è una.
export function openingDuration(saved: unknown): number {
  if (typeof saved !== 'number' || !saved) return 60;
  return Math.min(Math.max(saved, MIN_DURATION), MAX_DURATION);
}

export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

export const paperCitation = (p: Pick<PaperRef, 'authors' | 'year' | 'title'>) => `${p.authors} (${p.year}). ${p.title}`;

// Un paper citato come lo mostra la card: i passaggi da citare sotto il titolo e la licenza da
// accreditare accanto agli autori.
interface CitedPaper {
  paper: PaperRef;
  quotes: PassageQuote[];
  license: { name: string; url: string } | null;
}

// La licenza ha un link solo se è un indirizzo web: mai un altro tipo di link nella pagina.
export const licenseLink = (name?: string | null, url?: string | null) =>
  name && url && /^https?:\/\//.test(url) ? { name, url } : null;

export function citedPapers(refs: PaperRef[]): CitedPaper[] {
  return refs.map((paper) => ({
    paper,
    quotes: paper.passages ?? [],
    license: licenseLink(paper.license, paper.licenseUrl),
  }));
}

// Da dove vengono le corse, quando non è il solito download completo.
export function ridesNotes(rides: CoachWorkout['rides']): string[] {
  const notes: string[] = [];
  if (rides.fromSaved && rides.downloadedAt != null) {
    const when = new Date(rides.downloadedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    notes.push(`⚠️ Strava non raggiungibile: uso le corse salvate il ${when}.`);
  }
  if (rides.missingDetails > 0) {
    notes.push(`ℹ️ ${rides.missingDetails} uscite senza dettagli secondo per secondo: per loro uso le cifre di riepilogo.`);
  }
  return notes;
}

// Quante bozze ci sono volute, se più di una, e le citazioni tolte dalla scheda.
export function draftsNotes(w: CoachWorkout): string[] {
  const notes: string[] = [];
  const drafts = w.drafts?.length ?? 1;
  if (drafts > 1) notes.push(`🔁 Ci sono voluti ${drafts} tentativi del modello.`);
  if (w.citationsDropped?.length) {
    notes.push(`✂️ Tolte le citazioni a passaggi non forniti al modello: ${w.citationsDropped.join(', ')}.`);
  }
  return notes;
}

// Locale o cloud, modello, secondi, token letti e scritti e, per il cloud, il costo in dollari
// con 4 decimali ("—" per ciò che il provider non dice). Ollama non costa nulla: nessun costo.
const tokens = (n: number | null) => (n == null ? '—' : String(n));
const cost = (w: CoachWorkout) =>
  w.provider === 'cloud' ? ` · costo: ${w.cost == null ? '—' : `$${w.cost.toFixed(4)}`}` : '';
export const metaLine = (w: CoachWorkout) =>
  `⚡ ${w.provider === 'cloud' ? 'cloud' : 'locale'} · ${w.model} · ${w.seconds.toFixed(1)}s · ` +
  `token: ${tokens(w.inputTokens)} in, ${tokens(w.outputTokens)} out${cost(w)}`;

// Il modello chat scelto nel .env del servizio.
export const modelLine = (s: CoachStatus) => `${s.provider === 'cloud' ? 'cloud' : 'locale (Ollama)'} · ${s.model}`;

// Dollari con 2 decimali; sotto il centesimo 4, perché una risposta può costare meno.
const dollars = (n: number) => `$${n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

// Spesa e tetto, solo per un modello cloud: Ollama non costa nulla.
export const spendingLine = (s: CoachStatus) =>
  s.provider === 'cloud' && s.spent != null && s.limit != null
    ? `Spesi ${dollars(s.spent)} su un limite di ${dollars(s.limit)}`
    : '';

// Dove vanno i dati dell'atleta: fuori dal computer solo con un modello cloud.
export const dataLine = (s: CoachStatus) =>
  s.provider === 'cloud'
    ? `Modello cloud ${s.model}: questi dati vengono inviati al provider cloud.`
    : `Modello locale ${s.model} (Ollama): tutto resta sul tuo computer, niente cloud.`;

// L'esito della verifica della connessione; se manca un modello di Ollama, il comando segue a parte.
export function checkLine(c: ConnectionCheck): string {
  if (c.provider === 'cloud') {
    return c.found
      ? `✅ Il provider risponde, accetta la chiave e ha ${c.model}.`
      : `⚠️ Il provider risponde e accetta la chiave, ma ${c.model} non è nel suo elenco: controlla CLOUD_MODEL in .env.`;
  }
  return c.found ? `✅ Ollama risponde e ha ${c.model}.` : `⚠️ ${c.model} mancante in Ollama: scaricalo con`;
}

// Il titolo di un errore che non ha una spiegazione sua (FTP mancante, ricerca dei paper).
export const errorHeading = (code?: string) => (code === 'model' ? 'Errore chiamata modello' : 'Workout non generato');
