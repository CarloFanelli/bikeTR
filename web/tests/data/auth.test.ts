import { describe, expect, it } from 'vitest';
import { authCallbackMessage } from '../../src/data/auth.ts';

describe('ritorno da Strava con un errore', () => {
  it('nessun errore nell\'indirizzo: nessun messaggio', () => {
    expect(authCallbackMessage('')).toBeNull();
    expect(authCallbackMessage('?altro=1')).toBeNull();
  });

  it('ogni errore noto ha il suo messaggio', () => {
    expect(authCallbackMessage('?auth_error=denied'))
      .toBe('Autorizzazione negata su Strava: BikeTR non è stato collegato.');
    expect(authCallbackMessage('?auth_error=state'))
      .toBe('Ritorno da Strava non valido o scaduto: riprova con "Collega Strava".');
    expect(authCallbackMessage('?auth_error=unreachable'))
      .toBe('Strava non raggiungibile durante il collegamento. Riprova tra poco.');
  });

  it('la risposta di Strava si aggiunge al messaggio', () => {
    expect(authCallbackMessage('?auth_error=rejected&detail=HTTP%20401%20%C2%B7%20invalid'))
      .toBe('Strava ha rifiutato il collegamento. Controlla STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET nel file .env, '
        + 'poi esegui di nuovo docker compose up -d. Risposta di Strava: HTTP 401 · invalid.');
  });

  it('un errore sconosciuto si mostra com\'è', () => {
    expect(authCallbackMessage('?auth_error=boh')).toBe('boh');
  });
});
