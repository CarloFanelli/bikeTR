import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutRequest } from '../../src/core/coach-types.ts';
import { COACH_INTERRUPTED, COACH_UNREACHABLE } from '../../src/data/coach.ts';

type Run = typeof import('../../src/app/coach-run.ts');
let coachRun: Run['coachRun'];
let generateWorkout: Run['generateWorkout'];
let stopWorkout: Run['stopWorkout'];

const request: WorkoutRequest = {
  duration: 60, model: 'qwen2.5:7b', timeZone: 'Europe/Rome',
  profile: { ftp: 250, lthr: 165, hrMax: 190, weight: 72, weeklyHours: 6, weeklyDays: 4 },
};
const workout = {
  protocolId: 'z2_endurance', title: 'Z2 lungo', targetWatt: '160-190 W', struttura: ['60 min Z2'],
  razionale: 'TSB negativo', paperRefs: [], retrievedPapers: [], fellBack: false, model: 'qwen2.5:7b',
  seconds: 12.3, evalCount: 80, modelRaw: '{}', rides: { fromSaved: false, downloadedAt: null, missingDetails: 0 },
};

// Una richiesta al servizio finto: il test decide quando arriva la risposta e cosa
// manda il flusso. Il flusso NON si chiude da solo quando la richiesta è interrotta,
// come i pezzi già arrivati prima dell'interruzione: chi legge deve ignorarli.
interface FakeCall {
  body: WorkoutRequest;
  signal: AbortSignal;
  // Il flusso della risposta, scritto da send/end/breakStream.
  stream: ReadableStream<Uint8Array>;
  respond(res: Response): void;
  fail(e: Error): void;
  send(ev: object): void;
  end(): void;
  breakStream(e: Error): void;
}
let calls: FakeCall[];

function fakeFetch(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    calls.push({
      body: JSON.parse(init.body as string),
      signal: init.signal as AbortSignal,
      stream: new ReadableStream<Uint8Array>({ start: (c) => { writer = c; } }),
      respond: resolve,
      fail: reject,
      send: (ev) => writer.enqueue(new TextEncoder().encode(JSON.stringify(ev) + '\n')),
      end: () => writer.close(),
      breakStream: (e) => writer.error(e),
    });
  });
}

const call = (i: number) => calls[i];
const answer = (i: number) => call(i).respond(new Response(call(i).stream, { status: 200 }));
// Lascia girare promesse e letture del flusso.
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.resetModules();
  ({ coachRun, generateWorkout, stopWorkout } = await import('../../src/app/coach-run.ts'));
});
afterEach(() => vi.unstubAllGlobals());

describe('richiesta al Coach', () => {
  it('invia la richiesta e mostra passo, contesto, testo dal vivo e risultato', async () => {
    void generateWorkout(request);
    expect(coachRun).toMatchObject({ running: true, step: '⏳ Richiesta al Coach…', live: '', result: null });
    expect(fetch).toHaveBeenCalledWith('/coach/workout', expect.objectContaining({ method: 'POST' }));
    expect(call(0).body).toEqual(request);

    answer(0);
    call(0).send({ type: 'step', step: 'rides', message: 'Scarico le corse da Strava…' });
    call(0).send({ type: 'context', context: { tsb: -5 } });
    call(0).send({ type: 'token', text: 'Ciao' });
    call(0).send({ type: 'token', text: ' mondo' });
    await settle();
    expect(coachRun).toMatchObject({
      running: true, step: '⏳ Scarico le corse da Strava…', context: { tsb: -5 }, live: 'Ciao mondo',
    });

    call(0).send({ type: 'result', ...workout });
    await settle();
    expect(coachRun).toMatchObject({ running: false, error: null, stopped: false });
    expect(coachRun.result).toMatchObject({ title: 'Z2 lungo', targetWatt: '160-190 W' });
  });

  it('errore durante il flusso: la spiegazione del servizio', async () => {
    void generateWorkout(request);
    answer(0);
    call(0).send({ type: 'error', error: 'model', message: 'Ollama ha risposto 500' });
    await settle();
    expect(coachRun).toMatchObject({ running: false, result: null, error: { error: 'model', message: 'Ollama ha risposto 500' } });
  });

  it('il flusso finisce senza risultato né errore: connessione interrotta', async () => {
    void generateWorkout(request);
    answer(0);
    call(0).send({ type: 'token', text: 'a metà' });
    call(0).end();
    await settle();
    expect(coachRun).toMatchObject({ running: false, live: 'a metà', error: { message: COACH_INTERRUPTED } });
  });

  it('la connessione cade durante il flusso: connessione interrotta', async () => {
    void generateWorkout(request);
    answer(0);
    call(0).breakStream(new TypeError('network error'));
    await settle();
    expect(coachRun.error).toEqual({ message: COACH_INTERRUPTED });
  });

  it('nessuna risposta: Coach non raggiungibile', async () => {
    void generateWorkout(request);
    call(0).fail(new TypeError('Failed to fetch'));
    await settle();
    expect(coachRun).toMatchObject({ running: false, error: { message: COACH_UNREACHABLE } });
  });

  it('rifiuto del servizio con spiegazione, o di nginx senza JSON', async () => {
    void generateWorkout(request);
    call(0).respond(Response.json({ error: 'no_ftp', message: 'FTP mancante' }, { status: 422 }));
    await settle();
    expect(coachRun).toMatchObject({ running: false, error: { error: 'no_ftp', message: 'FTP mancante' } });

    void generateWorkout(request);
    call(1).respond(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    await settle();
    expect(coachRun.error).toEqual({ message: COACH_UNREACHABLE });
  });
});

describe('una nuova richiesta interrompe la precedente', () => {
  it('gli eventi tardivi della vecchia non si disegnano', async () => {
    void generateWorkout(request);
    answer(0);
    call(0).send({ type: 'token', text: 'vecchio' });
    await settle();

    void generateWorkout({ ...request, duration: 90 });
    expect(call(0).signal.aborted).toBe(true);
    expect(coachRun).toMatchObject({ running: true, live: '', step: '⏳ Richiesta al Coach…' });

    call(0).send({ type: 'step', message: 'vecchio passo' });
    call(0).send({ type: 'token', text: 'tardi' });
    call(0).send({ type: 'result', ...workout, title: 'Vecchio' });
    call(0).end();
    await settle();
    expect(coachRun).toMatchObject({ running: true, live: '', step: '⏳ Richiesta al Coach…', result: null, error: null });

    answer(1);
    call(1).send({ type: 'result', ...workout, title: 'Nuovo' });
    await settle();
    expect(coachRun.result?.title).toBe('Nuovo');
  });

  it('il rifiuto della vecchia, letto dopo l\'interruzione, non copre la nuova', async () => {
    void generateWorkout(request);
    // Rifiuto il cui corpo arriva solo dopo la nuova richiesta.
    call(0).respond(new Response(call(0).stream, { status: 422 }));
    await settle();

    void generateWorkout(request);
    call(0).send({ error: 'no_ftp', message: 'FTP mancante' });
    call(0).end();
    await settle();
    expect(coachRun).toMatchObject({ running: true, error: null });
  });

  it('la caduta della vecchia connessione non mostra errori sulla nuova', async () => {
    void generateWorkout(request);
    answer(0);
    await settle();
    void generateWorkout(request);
    call(0).breakStream(new DOMException('Aborted', 'AbortError'));
    await settle();
    expect(coachRun).toMatchObject({ running: true, error: null });
  });
});

describe('Stop', () => {
  it('ferma la richiesta e tiene il testo scritto finora, senza card', async () => {
    void generateWorkout(request);
    answer(0);
    call(0).send({ type: 'token', text: 'Scaldati 10' });
    await settle();

    stopWorkout();
    expect(call(0).signal.aborted).toBe(true);
    expect(coachRun).toMatchObject({ running: false, stopped: true, live: 'Scaldati 10' });

    call(0).send({ type: 'token', text: ' minuti' });
    call(0).send({ type: 'result', ...workout });
    call(0).end();
    await settle();
    expect(coachRun).toMatchObject({ running: false, stopped: true, live: 'Scaldati 10', result: null, error: null });
  });

  it('la connessione chiusa da Stop non è un errore', async () => {
    void generateWorkout(request);
    answer(0);
    await settle();
    stopWorkout();
    call(0).breakStream(new DOMException('Aborted', 'AbortError'));
    await settle();
    expect(coachRun).toMatchObject({ stopped: true, error: null });
  });

  it('Stop prima della risposta: la risposta tardiva non si legge', async () => {
    void generateWorkout(request);
    stopWorkout();
    call(0).respond(Response.json({ error: 'no_ftp', message: 'FTP mancante' }, { status: 422 }));
    await settle();
    expect(coachRun).toMatchObject({ running: false, stopped: true, error: null });
  });

  it('risultato e Stop insieme: vince il primo, nessun errore', async () => {
    void generateWorkout(request);
    answer(0);
    call(0).send({ type: 'result', ...workout });
    await settle();
    stopWorkout();
    expect(coachRun).toMatchObject({ running: false, stopped: false, error: null });
    expect(coachRun.result?.title).toBe('Z2 lungo');
  });

  it('senza nessuna richiesta in corso non fa niente', () => {
    stopWorkout();
    expect(coachRun).toMatchObject({ running: false, stopped: false });
  });

  it('una nuova richiesta dopo Stop riparte da capo', async () => {
    void generateWorkout(request);
    stopWorkout();
    void generateWorkout(request);
    expect(coachRun).toMatchObject({ running: true, stopped: false, live: '' });
    expect(call(1).signal.aborted).toBe(false);
  });
});
