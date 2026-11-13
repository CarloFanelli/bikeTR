import { describe, expect, it } from 'vitest';
import { at, syncNotice, syncResult } from '../../src/core/sync-view.ts';

const now = new Date(2026, 10, 13, 15, 0);
const ms = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m).getTime();

describe('frasi dell\'aggiornamento da Strava', () => {
  it('l\'ora sola oggi, anche il giorno un altro giorno', () => {
    expect(at(ms(13, 9, 5), now)).toBe('alle 09:05');
    expect(at(ms(12, 21, 40), now)).toBe('il 12/11 alle 21:40');
  });

  it('nessun avviso quando la sincronizzazione è andata bene', () => {
    expect(syncNotice({ status: 'updated', syncedAt: ms(13, 14, 0), retryAt: null }, now)).toBeNull();
    expect(syncNotice({ status: 'recent', syncedAt: ms(13, 14, 0), retryAt: null }, now)).toBeNull();
  });

  it('Strava non raggiungibile o in pausa: da quando sono i dati, o quando si riprova', () => {
    expect(syncNotice({ status: 'unreachable', syncedAt: ms(13, 14, 0), retryAt: null }, now))
      .toBe('Dati aggiornati alle 14:00: Strava non raggiungibile');
    expect(syncNotice({ status: 'unreachable', syncedAt: null, retryAt: null }, now)).toBe('Strava non raggiungibile');
    expect(syncNotice({ status: 'paused', syncedAt: ms(13, 14, 0), retryAt: ms(13, 15, 15) }, now))
      .toBe('Strava ha chiesto una pausa: riprovo alle 15:15');
  });

  it('il risultato di "Aggiorna da Strava"', () => {
    expect(syncResult({ status: 'updated', syncedAt: ms(13, 14, 59), retryAt: null }, now)).toBe('Aggiornato alle 14:59');
    expect(syncResult({ status: 'unreachable', syncedAt: ms(12, 8, 0), retryAt: null }, now))
      .toBe('Dati aggiornati il 12/11 alle 08:00: Strava non raggiungibile');
  });
});
