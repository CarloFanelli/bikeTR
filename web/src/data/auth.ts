// Server di autenticazione (/auth/, dietro nginx): tiene client secret e refresh
// token; il browser riceve solo token di accesso a breve durata.

const AUTH_ERRORS: Record<string, string> = {
  unreachable: 'Server di autenticazione non raggiungibile. Controlla i log con: docker compose logs auth',
  not_connected: 'Non connesso a Strava.',
  strava_unreachable: 'Strava non raggiungibile per rinnovare l\'accesso. Riprova tra poco.',
};

// `code` dice al chiamante cosa fare: 'not_connected' → mostrare "Collega Strava".
export class AuthError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(AUTH_ERRORS[code] ?? `Errore del server di autenticazione (${code})`);
    this.code = code;
  }
}

async function authJson<T>(path: string): Promise<T> {
  let res: Response;
  let body: { error?: string };
  try {
    res = await fetch(path);
    body = await res.json();
  } catch {
    // Rete giù o risposta non JSON (nginx risponde 502 se il servizio è spento).
    throw new AuthError('unreachable');
  }
  if (!res.ok) throw new AuthError(String(body.error));
  return body as T;
}

export interface AuthStatus {
  missing: string[];
  connected: boolean;
}

// Impostazioni .env mancanti e stato del collegamento.
export const getAuthStatus = (): Promise<AuthStatus> => authJson<AuthStatus>('/auth/status');

// Token di accesso valido almeno un altro minuto (il server lo rinnova quando serve).
export async function getAccessToken(): Promise<string> {
  return (await authJson<{ access_token: string }>('/auth/token')).access_token;
}

// Il server di autenticazione, al ritorno da Strava, rimanda all'app con ?auth_error=…
const AUTH_CALLBACK_ERRORS: Record<string, string> = {
  denied: 'Autorizzazione negata su Strava: BikeTR non è stato collegato.',
  state: 'Ritorno da Strava non valido o scaduto: riprova con "Collega Strava".',
  rejected: 'Strava ha rifiutato il collegamento. Controlla STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET nel file .env, poi esegui di nuovo docker compose up -d.',
  unreachable: 'Strava non raggiungibile durante il collegamento. Riprova tra poco.',
};

// Messaggio per l'errore nella query dell'indirizzo (`location.search`), null se non c'è.
export function authCallbackMessage(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get('auth_error');
  if (!code) return null;
  const detail = params.get('detail');
  return (AUTH_CALLBACK_ERRORS[code] ?? code) + (detail ? ` Risposta di Strava: ${detail}.` : '');
}

// Cancella i token Strava tenuti dal server di autenticazione.
export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
}
