import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, getAuthStatus } from '../../src/data/auth.ts';
import {
  fetchActivities, fetchActivity, fetchActivityStreams, fetchAthlete, fetchStarredSegments,
} from '../../src/data/strava.ts';

interface Seen { url: string; auth: string | null }

// fetch simulato: /auth/token dà un token nuovo a ogni richiesta (t1, t2, …), Strava
// risponde con `strava(url)`; ogni richiesta è annotata con il suo token.
function fakeNetwork(strava: (url: string) => Response = () => Response.json([])): Seen[] {
  const seen: Seen[] = [];
  let issued = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    seen.push({ url, auth: new Headers(init?.headers).get('Authorization') });
    if (url === '/auth/token') return Response.json({ access_token: `t${++issued}` });
    return strava(url);
  });
  return seen;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('richieste a Strava', () => {
  it('ogni richiesta chiede un token appena prima di partire e usa quello', async () => {
    const seen = fakeNetwork(() => Response.json({ id: 1 }));
    await fetchAthlete();
    await fetchActivities(60);
    await fetchActivity(42, { allEfforts: true });
    expect(seen).toEqual([
      { url: '/auth/token', auth: null },
      { url: 'https://www.strava.com/api/v3/athlete', auth: 'Bearer t1' },
      { url: '/auth/token', auth: null },
      { url: 'https://www.strava.com/api/v3/athlete/activities?per_page=60&page=1', auth: 'Bearer t2' },
      { url: '/auth/token', auth: null },
      { url: 'https://www.strava.com/api/v3/activities/42?include_all_efforts=true', auth: 'Bearer t3' },
    ]);
  });

  it('un errore di Strava nomina la richiesta e il codice HTTP', async () => {
    fakeNetwork(() => new Response('{}', { status: 404 }));
    await expect(fetchAthlete()).rejects.toThrow('API /athlete: 404');
    await expect(fetchActivityStreams(7)).rejects.toThrow('streams 7: 404');
  });

  it('l\'errore porta il codice HTTP: 404 vuol dire attività inesistente o non visibile', async () => {
    fakeNetwork(() => new Response('{}', { status: 404 }));
    await expect(fetchActivity(99)).rejects.toMatchObject({ status: 404, message: 'API /activities/99: 404' });
  });

  it('gli stream chiedono di default le serie per le metriche, oppure quelle indicate', async () => {
    const seen = fakeNetwork(() => Response.json({}));
    await fetchActivityStreams(7);
    await fetchActivityStreams(7, 'time,altitude');
    expect(seen.filter((s) => s.url.startsWith('https')).map((s) => s.url)).toEqual([
      'https://www.strava.com/api/v3/activities/7/streams?keys=time,heartrate,watts,cadence&key_by_type=true',
      'https://www.strava.com/api/v3/activities/7/streams?keys=time,altitude&key_by_type=true',
    ]);
  });

  it('i segmenti preferiti si leggono a pagine da 50, fino a una pagina incompleta', async () => {
    const page = (n: number, size: number) => Array.from({ length: size }, (_, i) => ({ id: n * 100 + i }));
    const seen = fakeNetwork((url) => {
      const n = Number(new URL(url).searchParams.get('page'));
      return Response.json(page(n, n < 3 ? 50 : 7));
    });
    const segments = await fetchStarredSegments();
    expect(segments).toHaveLength(107);
    expect(seen.filter((s) => s.url.startsWith('https')).map((s) => new URL(s.url).search))
      .toEqual(['?per_page=50&page=1', '?per_page=50&page=2', '?per_page=50&page=3']);
  });

  it('i segmenti preferiti si fermano a 10 pagine', async () => {
    fakeNetwork(() => Response.json(Array.from({ length: 50 }, (_, i) => ({ id: i }))));
    expect(await fetchStarredSegments()).toHaveLength(500);
  });

  it('scollegati da un\'altra scheda: la richiesta fallisce con il codice not_connected', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return Response.json({ error: 'not_connected' }, { status: 401 });
    });
    const err = await fetchAthlete().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toMatchObject({ code: 'not_connected', message: 'Non connesso a Strava.' });
    expect(seen).toEqual(['/auth/token']);
  });

  it('server di autenticazione spento: il messaggio che lo spiega, senza chiamare Strava', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https')) throw new Error('Strava non andava chiamato');
      return new Response('<html>502 Bad Gateway</html>', { status: 502 });
    });
    await expect(fetchAthlete()).rejects.toMatchObject({
      code: 'unreachable',
      message: 'Server di autenticazione non raggiungibile. Controlla i log con: docker compose logs auth',
    });
    await expect(getAuthStatus()).rejects.toMatchObject({ code: 'unreachable' });
  });
});
