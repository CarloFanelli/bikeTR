import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACH_UNREACHABLE, forgetCoachRides, pingOllama } from '../../src/data/coach.ts';

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
  it('"Ping Ollama" chiede al servizio il modello scelto e riporta modelli e mancanti', async () => {
    const seen = fakeCoach(() => Response.json({
      models: ['qwen2.5:7b'], missing: [{ model: 'nomic-embed-text', command: 'ollama pull nomic-embed-text' }],
    }));
    expect(await pingOllama('qwen2.5:7b')).toEqual({
      ok: true, models: ['qwen2.5:7b'], missing: [{ model: 'nomic-embed-text', command: 'ollama pull nomic-embed-text' }],
    });
    expect(seen).toEqual(['GET /coach/ping?model=qwen2.5%3A7b']);
  });

  it('Ollama spento: il messaggio del servizio', async () => {
    fakeCoach(() => Response.json({ error: 'ollama_unreachable', message: 'Ollama non raggiungibile' }, { status: 502 }));
    expect(await pingOllama('qwen2.5:7b')).toEqual({ ok: false, msg: 'Ollama non raggiungibile' });
  });

  it('servizio Coach spento: come oggi, "Coach non raggiungibile"', async () => {
    fakeCoach(() => new Response('Bad Gateway', { status: 502 }));
    expect(await pingOllama('qwen2.5:7b')).toEqual({ ok: false, msg: COACH_UNREACHABLE });
    fakeCoach(() => { throw new TypeError('Failed to fetch'); });
    expect(await pingOllama('qwen2.5:7b')).toEqual({ ok: false, msg: COACH_UNREACHABLE });
  });

  it('allo scollegamento il servizio dimentica le corse; se è spento non blocca', async () => {
    const seen = fakeCoach(() => Response.json({}));
    await forgetCoachRides();
    expect(seen).toEqual(['POST /coach/forget']);
    fakeCoach(() => { throw new TypeError('Failed to fetch'); });
    await expect(forgetCoachRides()).resolves.toBeUndefined();
  });
});
