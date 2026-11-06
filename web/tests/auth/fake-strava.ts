// Precaricato nel processo del server di autenticazione (node --import): le richieste
// a Strava non escono dal container. Ognuna riceve la risposta che il test ha scritto
// in reply.json della cartella FAKE_STRAVA_DIR, e viene annotata in calls.log.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.FAKE_STRAVA_DIR ?? '';
const realFetch = globalThis.fetch;

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith('https://www.strava.com/')) return realFetch(input, init);
  fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify({ url, body: JSON.parse(String(init?.body)) }) + '\n');
  const reply = JSON.parse(fs.readFileSync(path.join(dir, 'reply.json'), 'utf8'));
  if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
  if (reply.unreachable) throw new TypeError('fetch failed');
  return Response.json(reply.body, { status: reply.status });
};
