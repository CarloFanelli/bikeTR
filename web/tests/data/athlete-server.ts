// Il server dei dati dell'atleta finto, per i test: risponde a /coach/athlete-data come il
// servizio Coach (docker/coach/app/athlete_data.py), senza i controlli dei campi. Con `initial`
// i dati sono già lì, e il browser li ha letti come all'apertura dell'app.

import { vi } from 'vitest';
import { loadAthleteData } from '../../src/data/athlete-data.ts';

export interface AthleteServer {
  saved: Map<string, unknown>;
  // Le richieste ricevute, "METODO percorso".
  requests: string[];
  // Il codice HTTP dei prossimi salvataggi (PUT); 0 = server spento.
  failSaves: number | null;
  // Una chiave i cui salvataggi il server rifiuta (500), le altre si salvano.
  failKey: string | null;
}

export async function athleteServer(initial: Record<string, unknown> = {}): Promise<AthleteServer> {
  const server: AthleteServer = {
    saved: new Map(Object.entries(initial)), requests: [], failSaves: null, failKey: null,
  };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    server.requests.push(`${method} ${url}`);
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    if (url === '/coach/athlete-data' && method === 'GET') return Response.json(Object.fromEntries(server.saved));
    if (url === '/coach/athlete-data/import') {
      if (server.saved.size) return Response.json({ error: 'not_empty', message: 'pieno' }, { status: 409 });
      for (const [k, v] of Object.entries(body)) server.saved.set(k, v);
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('/coach/athlete-data/') && method === 'PUT') {
      if (server.failSaves === 0) throw new TypeError('Failed to fetch');
      const key = url.split('/').pop()!;
      const status = server.failSaves || (key === server.failKey ? 500 : null);
      if (status) return Response.json({ error: 'x', message: 'Salvataggio rifiutato' }, { status });
      server.saved.set(key, body);
      return new Response(null, { status: 204 });
    }
    throw new Error(`richiesta inattesa: ${method} ${url}`);
  });
  await loadAthleteData();
  server.requests.length = 0;
  return server;
}
