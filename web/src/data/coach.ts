// Servizio Coach (/coach/, dietro nginx): parla con Ollama e tiene le corse scaricate da Strava.

export const COACH_DEFAULT_MODEL = 'qwen2.5:7b';
export const COACH_UNREACHABLE = 'Coach non raggiungibile: avvia BikeTR con docker compose up -d';

// Un modello che manca a Ollama, con il comando che lo scarica.
interface MissingModel {
  model: string;
  command: string;
}

export type PingResult =
  | { ok: true; models: string[]; missing: MissingModel[] }
  | { ok: false; msg: string };

// Il servizio controlla Ollama e risponde {models, missing} oppure {error, message}.
// Senza una risposta del servizio, il Coach non è avviato.
export async function pingOllama(model: string): Promise<PingResult> {
  let res: Response;
  try {
    res = await fetch('/coach/ping?model=' + encodeURIComponent(model));
  } catch {
    return { ok: false, msg: COACH_UNREACHABLE };
  }
  const body: { models: string[]; missing: MissingModel[]; message?: string } | null = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, msg: body?.message || COACH_UNREACHABLE };
  return { ok: true, models: body.models, missing: body.missing };
}

// Le corse salvate dal servizio appartengono al collegamento con Strava: dopo lo
// scollegamento nessuna richiesta del Coach può ottenere un nuovo token.
export async function forgetCoachRides(): Promise<void> {
  await fetch('/coach/forget', { method: 'POST' }).catch(() => {});
}
