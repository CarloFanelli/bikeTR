import { describe, expect, it } from 'vitest';
import { readCoachEvents } from '../../src/data/coach.ts';

// Un flusso finto: i pezzi di byte arrivano esattamente come dati.
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

const bytes = (s: string) => new TextEncoder().encode(s);

// Taglia il testo in pezzi di byte alle posizioni date.
function cut(text: string, at: number[]): Uint8Array[] {
  const all = bytes(text);
  const edges = [0, ...at, all.length];
  return edges.slice(1).map((end, i) => all.slice(edges[i], end));
}

async function read(chunks: Uint8Array[]) {
  const out = [];
  for await (const ev of readCoachEvents(streamOf(chunks))) out.push(ev);
  return out;
}

describe('lettura della risposta del Coach', () => {
  it('un evento per riga, anche con più righe nello stesso pezzo e righe vuote', async () => {
    const text = '{"type":"step","message":"Scarico"}\n\n{"type":"token","text":"Ciao"}\n{"type":"token","text":"!"}\n';
    expect(await read([bytes(text)])).toEqual([
      { type: 'step', message: 'Scarico' }, { type: 'token', text: 'Ciao' }, { type: 'token', text: '!' },
    ]);
  });

  it('una riga tagliata in tre o più pezzi è un solo evento', async () => {
    const text = '{"type":"step","message":"Recupero paper rilevanti…"}\n';
    expect(await read(cut(text, [3, 10, 25, 40]))).toEqual([{ type: 'step', message: 'Recupero paper rilevanti…' }]);
  });

  it('"è" e un\'emoji tagliati tra due pezzi arrivano interi', async () => {
    const text = '{"type":"token","text":"è 🚴"}\n';
    const all = bytes(text);
    const e = all.indexOf(0xc3); // primo byte di "è" (2 byte)
    const bike = all.indexOf(0xf0); // primo byte dell'emoji (4 byte)
    const events = await read(cut(text, [e + 1, bike + 1, bike + 2, bike + 3]));
    expect(events).toEqual([{ type: 'token', text: 'è 🚴' }]);
  });

  it('l\'ultima riga senza a capo si legge lo stesso', async () => {
    expect(await read(cut('{"type":"token","text":"a"}\n{"type":"result","title":"Z2"}', [30, 35])))
      .toEqual([{ type: 'token', text: 'a' }, { type: 'result', title: 'Z2' }]);
  });

  it('un byte alla volta', async () => {
    const text = '{"type":"token","text":"Più forte 💪"}\n{"type":"step","message":"Fine"}\n';
    const all = bytes(text);
    expect(await read(Array.from(all, (b) => Uint8Array.of(b)))).toEqual([
      { type: 'token', text: 'Più forte 💪' }, { type: 'step', message: 'Fine' },
    ]);
  });
});
