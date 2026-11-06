// Il server di autenticazione vero, avviato con Node in questo container: Strava è
// simulato (fake-strava.ts) e i token stanno nel file /data/strava-tokens.json,
// come nel container auth.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SERVER = fileURLToPath(new URL('../../../docker/auth/server.ts', import.meta.url));
const FAKE = fileURLToPath(new URL('./fake-strava.ts', import.meta.url));
const BASE = 'http://localhost:8080';
const TOKENS_FILE = '/data/strava-tokens.json';
const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-strava-'));
const now = (): number => Math.floor(Date.now() / 1000);

interface FakeReply { status?: number; body?: unknown; unreachable?: boolean; delayMs?: number }
interface StravaCall { url: string; body: Record<string, unknown> }

function stravaReplies(reply: FakeReply): void {
  fs.writeFileSync(path.join(fakeDir, 'reply.json'), JSON.stringify(reply));
}

function stravaCalls(): StravaCall[] {
  const log = path.join(fakeDir, 'calls.log');
  if (!fs.existsSync(log)) return [];
  return fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

function saveTokens(tokens: unknown): void {
  fs.writeFileSync(TOKENS_FILE, typeof tokens === 'string' ? tokens : JSON.stringify(tokens));
}

const savedTokens = (): unknown => (fs.existsSync(TOKENS_FILE) ? JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) : null);

const call = (route: string, init: RequestInit = {}): Promise<Response> =>
  fetch(BASE + route, { redirect: 'manual', ...init });

async function startServer(env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', FAKE, SERVER], {
    env: { PATH: process.env.PATH, WEB_PORT: '5050', FAKE_STRAVA_DIR: fakeDir, ...env },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(BASE + '/auth/status').then(() => true, () => false)) return child;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('il server di autenticazione non è partito');
}

async function stopServer(child: ChildProcess): Promise<void> {
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

// Un login completo fino al ritorno da Strava, con lo `state` emesso dal server.
async function loginState(): Promise<string> {
  const res = await call('/auth/login');
  return new URL(res.headers.get('location') ?? '').searchParams.get('state') ?? '';
}

beforeAll(() => {
  fs.mkdirSync('/data', { recursive: true });
});

beforeEach(() => {
  fs.rmSync(TOKENS_FILE, { force: true });
  fs.rmSync(path.join(fakeDir, 'calls.log'), { force: true });
  stravaReplies({ status: 500, body: {} });
});

describe('server di autenticazione con le credenziali Strava', { timeout: 20_000 }, () => {
  let server: ChildProcess;
  beforeAll(async () => {
    server = await startServer({ STRAVA_CLIENT_ID: '12345', STRAVA_CLIENT_SECRET: 'segreto' });
  }, 20_000);
  afterAll(() => stopServer(server));

  it('status: non collegato senza token, collegato con token validi', async () => {
    let res = await call('/auth/status');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ missing: [], connected: false });

    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() + 3600 });
    res = await call('/auth/status');
    expect(await res.json()).toEqual({ missing: [], connected: true });
  });

  it('status: un file token rovinato o incompleto vale "non collegato"', async () => {
    for (const broken of ['{"access_token": "a1", "refr', { access_token: 'a1', refresh_token: 'r1' }]) {
      saveTokens(broken);
      expect(await (await call('/auth/status')).json()).toEqual({ missing: [], connected: false });
    }
  });

  it('token: 401 not_connected senza collegamento', async () => {
    const res = await call('/auth/token');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_connected' });
  });

  it('token: dà solo il token di accesso ancora valido, senza chiamare Strava', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() + 3600 });
    const res = await call('/auth/token');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ access_token: 'a1' });
    expect(stravaCalls()).toEqual([]);
  });

  it('token: rinnova un token che scade entro un minuto e salva solo i tre campi', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() + 30 });
    stravaReplies({ status: 200, body: { access_token: 'a2', refresh_token: 'r2', expires_at: now() + 21600, token_type: 'Bearer' } });
    const res = await call('/auth/token');
    expect(await res.json()).toEqual({ access_token: 'a2' });
    expect(stravaCalls()).toEqual([{
      url: 'https://www.strava.com/api/v3/oauth/token',
      body: { client_id: '12345', client_secret: 'segreto', grant_type: 'refresh_token', refresh_token: 'r1' },
    }]);
    expect(savedTokens()).toEqual({ access_token: 'a2', refresh_token: 'r2', expires_at: expect.any(Number) });
  });

  it('token: senza un nuovo refresh token da Strava tiene quello di prima', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() - 10 });
    stravaReplies({ status: 200, body: { access_token: 'a2', expires_at: now() + 21600 } });
    await call('/auth/token');
    expect(savedTokens()).toMatchObject({ access_token: 'a2', refresh_token: 'r1' });
  });

  it('token: molte richieste insieme fanno un solo rinnovo e ricevono lo stesso token', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() - 10 });
    stravaReplies({ status: 200, body: { access_token: 'a2', refresh_token: 'r2', expires_at: now() + 21600 }, delayMs: 300 });
    const answers = await Promise.all(Array.from({ length: 6 }, () => call('/auth/token').then((r) => r.json())));
    expect(answers).toEqual(Array(6).fill({ access_token: 'a2' }));
    expect(stravaCalls()).toHaveLength(1);
  });

  it('token: un rinnovo rifiutato da Strava cancella i token e risponde 401', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() - 10 });
    stravaReplies({ status: 401, body: { message: 'Authorization Error' } });
    const res = await call('/auth/token');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_connected' });
    expect(savedTokens()).toBeNull();
  });

  it('token: Strava irraggiungibile durante il rinnovo risponde 502 e conserva i token', async () => {
    const tokens = { access_token: 'a1', refresh_token: 'r1', expires_at: now() - 10 };
    saveTokens(tokens);
    stravaReplies({ unreachable: true });
    const res = await call('/auth/token');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'strava_unreachable' });
    expect(savedTokens()).toEqual(tokens);
  });

  it('login: rimanda all\'autorizzazione di Strava con uno state casuale', async () => {
    const res = await call('/auth/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const url = new URL(res.headers.get('location') ?? '');
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/authorize');
    const { state, ...params } = Object.fromEntries(url.searchParams);
    expect(params).toEqual({
      client_id: '12345',
      redirect_uri: 'http://localhost:5050/auth/callback',
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all,profile:read_all',
    });
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('callback: salva i tre campi dei token e torna all\'app; lo state vale una volta', async () => {
    const state = await loginState();
    stravaReplies({ status: 200, body: { access_token: 'a1', refresh_token: 'r1', expires_at: 1900000000, athlete: { id: 7 } } });
    let res = await call(`/auth/callback?state=${state}&code=c0de&scope=read`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(stravaCalls().map((c) => c.body)).toEqual([
      { client_id: '12345', client_secret: 'segreto', grant_type: 'authorization_code', code: 'c0de' },
    ]);
    expect(savedTokens()).toEqual({ access_token: 'a1', refresh_token: 'r1', expires_at: 1900000000 });

    // Ricaricare l'indirizzo di ritorno quando il collegamento c'è già torna all'app.
    res = await call(`/auth/callback?state=${state}&code=c0de`);
    expect(res.headers.get('location')).toBe('/');
  });

  it('callback: state sconosciuto, accesso negato, Strava che rifiuta o non risponde', async () => {
    let res = await call('/auth/callback?state=sconosciuto&code=c0de');
    expect(res.headers.get('location')).toBe('/?auth_error=state');

    res = await call(`/auth/callback?state=${await loginState()}&error=access_denied`);
    expect(res.headers.get('location')).toBe('/?auth_error=denied');

    stravaReplies({ status: 400, body: { errors: [{ resource: 'Application', field: 'client_secret', code: 'invalid' }] } });
    res = await call(`/auth/callback?state=${await loginState()}&code=c0de`);
    expect(res.headers.get('location')).toBe('/?auth_error=rejected&detail=HTTP%20400%20%C2%B7%20client_secret%20invalid');

    stravaReplies({ unreachable: true });
    res = await call(`/auth/callback?state=${await loginState()}&code=c0de`);
    expect(res.headers.get('location')).toBe('/?auth_error=unreachable');
    expect(savedTokens()).toBeNull();
  });

  it('logout: solo POST dalla pagina dell\'app, poi i token spariscono', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() + 3600 });
    expect((await call('/auth/logout')).status).toBe(405);
    const crossSite = await call('/auth/logout', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: 'forbidden' });
    expect(savedTokens()).not.toBeNull();

    const res = await call('/auth/logout', { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin' } });
    expect(res.status).toBe(204);
    expect(savedTokens()).toBeNull();
  });

  it('un indirizzo sconosciuto risponde 404', async () => {
    const res = await call('/auth/altro');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

describe('server di autenticazione senza credenziali Strava', { timeout: 20_000 }, () => {
  let server: ChildProcess;
  beforeAll(async () => {
    server = await startServer({});
  }, 20_000);
  afterAll(() => stopServer(server));

  it('nomina le impostazioni mancanti e non dà token né login', async () => {
    saveTokens({ access_token: 'a1', refresh_token: 'r1', expires_at: now() + 3600 });
    expect(await (await call('/auth/status')).json())
      .toEqual({ missing: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'], connected: true });
    expect((await call('/auth/token')).status).toBe(401);
    expect((await call('/auth/login')).headers.get('location')).toBe('/');
  });
});
