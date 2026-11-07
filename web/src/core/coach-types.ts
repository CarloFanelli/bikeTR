// Cosa il browser invia al servizio Coach e cosa riceve: il flusso di eventi di
// docker/coach/app/workout.py, una riga JSON per evento.

// Profilo atleta: i valori mancanti viaggiano come null e il servizio usa i suoi default.
export interface AthleteProfile {
  ftp: number | null;
  lthr: number | null;
  hrMax: number | null;
  weight: number | null;
  weeklyHours: number | null;
  weeklyDays: number | null;
}

export interface WorkoutRequest {
  duration: number;
  model: string;
  timeZone: string;
  profile: AthleteProfile;
}

export interface PaperRef {
  pmid: string;
  title: string;
  authors: string;
  year: string;
  journal?: string | null;
}

export interface RetrievedPaper extends PaperRef {
  score: number;
}

export interface CoachWorkout {
  protocolId: string;
  title: string;
  targetWatt: string;
  struttura: string[];
  razionale: string;
  paperRefs: PaperRef[];
  retrievedPapers: RetrievedPaper[];
  fellBack: boolean;
  model: string;
  seconds: number;
  evalCount: number | null;
  modelRaw: string;
  // Da dove vengono le corse: salvate (Strava non raggiungibile) e quante senza dettagli.
  rides: { fromSaved: boolean; downloadedAt: string | number | null; missingDetails: number };
}

// Richiesta rifiutata o fallita: il codice (no_ftp, retrieval, model…) sceglie la spiegazione.
export interface CoachRefusal {
  error?: string;
  message: string;
}

export type CoachEvent =
  | { type: 'step'; step?: string; message: string }
  | { type: 'context'; context: unknown }
  | { type: 'token'; text: string }
  | ({ type: 'result' } & CoachWorkout)
  | ({ type: 'error' } & CoachRefusal);
