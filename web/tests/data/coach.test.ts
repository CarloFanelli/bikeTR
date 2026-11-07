import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConnection, COACH_UNREACHABLE, coachStatus, forgetCoachRides } from '../../src/data/coach.ts';

// fetch simulato: annota le richieste e risponde con `reply`.
function fakeCoach(reply: () => Response | Promise<Response>): string[] {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    seen.push(`${init?.method ?? 'GET'} ${url}`);
    return reply();
  });
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('servizio Coach', () => {
  it('il modello in uso lo dice il servizio, con spesa e tetto per il cloud', async () => {
    const seen = fakeCoach(() => Response.json({ provider: 'cloud', model: 'claude-x', spent: 0.25, limit: 5 }));
    expect(await coachStatus()).toEqual({ ok: true, value: { provider: 'cloud', model: 'claude-x', spent: 0.25, limit: 5 } });
    expect(seen).toEqual(['GET /coach/status']);
  });

  it('la verifica della connessione non manda nessun modello: lo sceglie .env', async () => {
    const check = { provider: 'ollama', model: 'qwen2.5:7b', found: false, command: 'ollama pull qwen2.5:7b' };
    const seen = fakeCoach(() => Response.json(check));
    expect(await checkConnection()).toEqual({ ok: true, value: check });
    expect(seen).toEqual(['GET /coach/ping']);
  });

  it('un rifiuto del servizio o del provider: il suo messaggio', async () => {
    fakeCoach(() => Response.json({ error: 'provider', message: 'Il provider cloud ha rifiutato la chiave' }, { status: 502 }));
    expect(await checkConnection()).toEqual({ ok: false, msg: 'Il provider cloud ha rifiutato la chiave' });
    fakeCoach(() => Response.json({ error: 'invalid_settings', message: 'Con COACH_PROVIDER=cloud manca in .env: CLOUD_MODEL' }, { status: 500 }));
    expect(await coachStatus()).toEqual({ ok: false, msg: 'Con COACH_PROVIDER=cloud manca in .env: CLOUD_MODEL' });
  });

  it('servizio Coach spento: "Coach non raggiungibile"', async () => {
    fakeCoach(() => new Response('Bad Gateway', { status: 502 }));
    expect(await coachStatus()).toEqual({ ok: false, msg: COACH_UNREACHABLE });
    fakeCoach(() => { throw new TypeError('Failed to fetch'); });
    expect(await checkConnection()).toEqual({ ok: false, msg: COACH_UNREACHABLE });
  });

  it('allo scollegamento il servizio dimentica le corse; se è spento non blocca', async () => {
    const seen = fakeCoach(() => Response.json({}));
    await forgetCoachRides();
    expect(seen).toEqual(['POST /coach/forget']);
    fakeCoach(() => { throw new TypeError('Failed to fetch'); });
    await expect(forgetCoachRides()).resolves.toBeUndefined();
  });
});
