// Server di autenticazione Strava: tiene Client ID, client secret e refresh token,
// fa il login OAuth e dà al browser solo token di accesso a breve durata.
// Node senza pacchetti, che esegue direttamente questo TypeScript (toglie i tipi
// all'avvio); gira nel container `auth`, raggiunto da nginx su /auth/.
//
// Rotte:
//   GET  /auth/status   → { missing: [impostazioni .env mancanti], connected }
//   GET  /auth/login    → redirect alla pagina di autorizzazione di Strava
//   GET  /auth/callback → ritorno da Strava: salva i token, redirect all'app
//   GET  /auth/token    → { access_token } valido almeno un altro minuto
//   POST /auth/logout   → cancella i token salvati

import http from 'node:http';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// Risposta dell'endpoint token di Strava: campi presenti solo se Strava li manda.
interface StravaReply {
  status: number;
  body: { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown; errors?: unknown };
}

type Route = (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => void | Promise<void>;

const PORT = 8080;
const CLIENT_ID = (process.env.STRAVA_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.STRAVA_CLIENT_SECRET || '').trim();
const MISSING = ([['STRAVA_CLIENT_ID', CLIENT_ID], ['STRAVA_CLIENT_SECRET', CLIENT_SECRET]] as const)
  .filter(([, value]) => !value).map(([name]) => name);
// Deve avere il dominio scritto nell'app Strava come "Authorization Callback Domain".
const REDIRECT_URI = `http://localhost:${process.env.WEB_PORT || 5050}/auth/callback`;
const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/api/v3/oauth/token';
const SCOPE = 'read,activity:read_all,profile:read_all';
const TOKENS_FILE = '/data/strava-tokens.json';
const MIN_VALIDITY_S = 60;
const STATE_TTL_MS = 10 * 60 * 1000;
const STRAVA_TIMEOUT_MS = 15000;

// I log non contengono mai il client secret, i token o il codice di autorizzazione.
const log = (msg: string): void => console.log(`[auth] ${msg}`);
const errorText = (e: unknown, field: 'name' | 'message'): string => (e instanceof Error ? e[field] : String(e));

// ---- Token salvati nel volume /data ----

const isTokens = (t: Record<string, unknown>): t is Record<string, unknown> & Tokens =>
  typeof t.access_token === 'string' && typeof t.refresh_token === 'string' && Number.isFinite(t.expires_at);

async function readTokens(): Promise<Tokens | null> {
  try {
    const t: unknown = JSON.parse(await fs.readFile(TOKENS_FILE, 'utf8'));
    return t !== null && typeof t === 'object' && isTokens(t as Record<string, unknown>) ? t as Tokens : null;
  } catch {
    // File assente, illeggibile o corrotto: l'utente risulta non collegato.
    return null;
  }
}

// File temporaneo + rename: un'interruzione a metà scrittura non lascia un file troncato.
async function writeTokens(t: Tokens): Promise<void> {
  const tmp = TOKENS_FILE + '.tmp';
  const data: Tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
  await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fs.rename(tmp, TOKENS_FILE);
}

const deleteTokens = (): Promise<void> => fs.rm(TOKENS_FILE, { force: true });

// ---- Strava ----

// Chiama l'endpoint token di Strava; lancia un errore se Strava non risponde.
async function stravaToken(params: Record<string, string>): Promise<StravaReply> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
  });
  const body: unknown = await res.json().catch(() => ({}));
  return { status: res.status, body: body !== null && typeof body === 'object' ? body : {} };
}

// Testo dell'errore di Strava da mostrare all'utente, es. "HTTP 401 · client_secret invalid".
function stravaErrorText({ status, body }: StravaReply): string {
  const errors: { field?: unknown; code?: unknown }[] = Array.isArray(body.errors) ? body.errors : [];
  return [`HTTP ${status}`, ...errors.map(e => `${e.field} ${e.code}`)].join(' · ');
}

// Una sola rinnovazione alla volta: Strava può sostituire il refresh token a ogni
// rinnovo, e due rinnovi in parallelo ne lascerebbero salvato uno già scaduto.
let renewing: Promise<Tokens | null> | null = null;

const isFresh = (t: Tokens): boolean => t.expires_at - MIN_VALIDITY_S > Date.now() / 1000;

// Ritorna token validi, rinnovati se serve, oppure null se non ci sono o se Strava
// rifiuta il rinnovo (accesso revocato). Rilegge il file: una richiesta che lo aveva
// letto prima della fine del rinnovo precedente trova qui i token già rinnovati.
async function renew(): Promise<Tokens | null> {
  const tokens = await readTokens();
  if (!tokens) return null;
  if (isFresh(tokens)) return tokens;
  const r = await stravaToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  if (r.status === 400 || r.status === 401) {
    log(`rinnovo rifiutato da Strava (HTTP ${r.status}): token cancellati, serve un nuovo collegamento`);
    await deleteTokens();
    return null;
  }
  const next = { ...r.body, refresh_token: r.body.refresh_token || tokens.refresh_token };
  if (r.status !== 200 || !next.access_token || !isTokens(next)) throw new Error(`Strava HTTP ${r.status}`);
  await writeTokens(next);
  log('token di accesso rinnovato');
  return next;
}

// ---- Valori `state` del login: ognuno vale una volta sola, per 10 minuti ----

const pendingStates = new Map<string, number>();

function issueState(): string {
  const now = Date.now();
  for (const [s, expiry] of pendingStates) if (expiry < now) pendingStates.delete(s);
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, now + STATE_TTL_MS);
  return state;
}

function takeState(state: string | null): boolean {
  if (!state) return false;
  const expiry = pendingStates.get(state);
  pendingStates.delete(state);
  return expiry !== undefined && expiry >= Date.now();
}

// ---- Rotte ----

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res: http.ServerResponse, location: string): void {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

const status: Route = async (req, res) => {
  json(res, 200, { missing: MISSING, connected: Boolean(await readTokens()) });
};

const login: Route = (req, res) => {
  if (MISSING.length) return redirect(res, '/');
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state: issueState(),
  }).toString();
  redirect(res, url.href);
};

const callback: Route = async (req, res, url) => {
  if (!takeState(url.searchParams.get('state'))) {
    // Anche una ricarica del vecchio indirizzo di ritorno finisce qui: se il
    // collegamento c'è già, si torna all'app senza errori.
    return redirect(res, (await readTokens()) ? '/' : '/?auth_error=state');
  }
  // Se l'utente nega l'accesso, Strava manda `error=access_denied` e nessun codice.
  const code = url.searchParams.get('code');
  if (!code) return redirect(res, '/?auth_error=denied');

  let r: StravaReply;
  try {
    r = await stravaToken({ grant_type: 'authorization_code', code });
  } catch (e) {
    log(`Strava non raggiungibile durante il collegamento (${errorText(e, 'name')})`);
    return redirect(res, '/?auth_error=unreachable');
  }
  if (r.status !== 200 || !isTokens(r.body)) {
    log(`collegamento rifiutato da Strava (HTTP ${r.status})`);
    return redirect(res, `/?auth_error=rejected&detail=${encodeURIComponent(stravaErrorText(r))}`);
  }
  await writeTokens(r.body);
  log('collegato a Strava');
  redirect(res, '/');
};

const token: Route = async (req, res) => {
  const tokens = MISSING.length ? null : await readTokens();
  if (!tokens) return json(res, 401, { error: 'not_connected' });
  if (isFresh(tokens)) return json(res, 200, { access_token: tokens.access_token });
  let fresh: Tokens | null;
  try {
    renewing ??= renew().finally(() => { renewing = null; });
    fresh = await renewing;
  } catch (e) {
    log(`rinnovo non riuscito, token conservati (${errorText(e, 'message')})`);
    return json(res, 502, { error: 'strava_unreachable' });
  }
  if (!fresh) return json(res, 401, { error: 'not_connected' });
  json(res, 200, { access_token: fresh.access_token });
};

const logout: Route = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // Solo la pagina dell'app può scollegare: un altro sito non deve poterlo fare.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return json(res, 403, { error: 'forbidden' });
  // Un rinnovo in corso finirebbe per riscrivere i token appena cancellati.
  await renewing?.catch(() => {});
  await deleteTokens();
  log('scollegato da Strava');
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
};

const ROUTES: Partial<Record<string, Route>> = {
  '/auth/status': status,
  '/auth/login': login,
  '/auth/callback': callback,
  '/auth/token': token,
  '/auth/logout': logout,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = ROUTES[url.pathname];
  if (!route) return json(res, 404, { error: 'not_found' });
  try {
    await route(req, res, url);
  } catch (e) {
    log(`errore su ${url.pathname}: ${errorText(e, 'message')}`);
    if (!res.headersSent) json(res, 500, { error: 'internal' });
  }
}).listen(PORT, () => {
  log(`in ascolto sulla porta ${PORT}; credenziali Strava: ${MISSING.length ? 'mancano ' + MISSING.join(', ') : 'presenti'}`);
});
