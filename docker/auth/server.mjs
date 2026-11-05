// Server di autenticazione Strava: tiene Client ID, client secret e refresh token,
// fa il login OAuth e dà al browser solo token di accesso a breve durata.
// Node senza pacchetti; gira nel container `auth`, raggiunto da nginx su /auth/.
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

const PORT = 8080;
const CLIENT_ID = (process.env.STRAVA_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.STRAVA_CLIENT_SECRET || '').trim();
const MISSING = [['STRAVA_CLIENT_ID', CLIENT_ID], ['STRAVA_CLIENT_SECRET', CLIENT_SECRET]]
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
const log = (msg) => console.log(`[auth] ${msg}`);

// ---- Token salvati nel volume /data ----

async function readTokens() {
  try {
    const t = JSON.parse(await fs.readFile(TOKENS_FILE, 'utf8'));
    const ok = typeof t.access_token === 'string' && typeof t.refresh_token === 'string'
      && Number.isFinite(t.expires_at);
    return ok ? t : null;
  } catch {
    // File assente, illeggibile o corrotto: l'utente risulta non collegato.
    return null;
  }
}

// File temporaneo + rename: un'interruzione a metà scrittura non lascia un file troncato.
async function writeTokens(t) {
  const tmp = TOKENS_FILE + '.tmp';
  const data = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
  await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fs.rename(tmp, TOKENS_FILE);
}

const deleteTokens = () => fs.rm(TOKENS_FILE, { force: true });

// ---- Strava ----

// Chiama l'endpoint token di Strava; lancia un errore se Strava non risponde.
async function stravaToken(params) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(STRAVA_TIMEOUT_MS),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Testo dell'errore di Strava da mostrare all'utente, es. "HTTP 401 · client_secret invalid".
function stravaErrorText({ status, body }) {
  const errors = Array.isArray(body.errors) ? body.errors : [];
  return [`HTTP ${status}`, ...errors.map(e => `${e.field} ${e.code}`)].join(' · ');
}

// Una sola rinnovazione alla volta: Strava può sostituire il refresh token a ogni
// rinnovo, e due rinnovi in parallelo ne lascerebbero salvato uno già scaduto.
let renewing = null;

// Ritorna i token nuovi, oppure null se Strava rifiuta il rinnovo (accesso revocato).
async function renew(tokens) {
  const r = await stravaToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  if (r.status === 400 || r.status === 401) {
    log(`rinnovo rifiutato da Strava (HTTP ${r.status}): token cancellati, serve un nuovo collegamento`);
    await deleteTokens();
    return null;
  }
  if (r.status !== 200 || !r.body.access_token) throw new Error(`Strava HTTP ${r.status}`);
  const next = {
    access_token: r.body.access_token,
    refresh_token: r.body.refresh_token || tokens.refresh_token,
    expires_at: r.body.expires_at,
  };
  await writeTokens(next);
  log('token di accesso rinnovato');
  return next;
}

// ---- Valori `state` del login: ognuno vale una volta sola, per 10 minuti ----

const pendingStates = new Map();

function issueState() {
  const now = Date.now();
  for (const [s, expiry] of pendingStates) if (expiry < now) pendingStates.delete(s);
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, now + STATE_TTL_MS);
  return state;
}

function takeState(state) {
  const expiry = state && pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(expiry) && expiry >= Date.now();
}

// ---- Rotte ----

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function status(req, res) {
  json(res, 200, { missing: MISSING, connected: Boolean(await readTokens()) });
}

function login(req, res) {
  if (MISSING.length) return redirect(res, '/');
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state: issueState(),
  });
  redirect(res, url.href);
}

async function callback(req, res, url) {
  if (!takeState(url.searchParams.get('state'))) {
    // Anche una ricarica del vecchio indirizzo di ritorno finisce qui: se il
    // collegamento c'è già, si torna all'app senza errori.
    return redirect(res, (await readTokens()) ? '/' : '/?auth_error=state');
  }
  // Se l'utente nega l'accesso, Strava manda `error=access_denied` e nessun codice.
  const code = url.searchParams.get('code');
  if (!code) return redirect(res, '/?auth_error=denied');

  let r;
  try {
    r = await stravaToken({ grant_type: 'authorization_code', code });
  } catch (e) {
    log(`Strava non raggiungibile durante il collegamento (${e.name})`);
    return redirect(res, '/?auth_error=unreachable');
  }
  if (r.status !== 200 || !r.body.refresh_token) {
    log(`collegamento rifiutato da Strava (HTTP ${r.status})`);
    return redirect(res, `/?auth_error=rejected&detail=${encodeURIComponent(stravaErrorText(r))}`);
  }
  await writeTokens(r.body);
  log('collegato a Strava');
  redirect(res, '/');
}

async function token(req, res) {
  const tokens = MISSING.length ? null : await readTokens();
  if (!tokens) return json(res, 401, { error: 'not_connected' });
  if (tokens.expires_at - MIN_VALIDITY_S > Date.now() / 1000) {
    return json(res, 200, { access_token: tokens.access_token });
  }
  let fresh;
  try {
    renewing ??= renew(tokens).finally(() => { renewing = null; });
    fresh = await renewing;
  } catch (e) {
    log(`rinnovo non riuscito, token conservati (${e.message})`);
    return json(res, 502, { error: 'strava_unreachable' });
  }
  if (!fresh) return json(res, 401, { error: 'not_connected' });
  json(res, 200, { access_token: fresh.access_token });
}

async function logout(req, res) {
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
}

const ROUTES = {
  '/auth/status': status,
  '/auth/login': login,
  '/auth/callback': callback,
  '/auth/token': token,
  '/auth/logout': logout,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = ROUTES[url.pathname];
  if (!route) return json(res, 404, { error: 'not_found' });
  try {
    await route(req, res, url);
  } catch (e) {
    log(`errore su ${url.pathname}: ${e.message}`);
    if (!res.headersSent) json(res, 500, { error: 'internal' });
  }
}).listen(PORT, () => {
  log(`in ascolto sulla porta ${PORT}; credenziali Strava: ${MISSING.length ? 'mancano ' + MISSING.join(', ') : 'presenti'}`);
});
