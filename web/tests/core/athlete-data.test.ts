import { describe, expect, it } from 'vitest';
import { cleanForServer } from '../../src/core/athlete-data.ts';

describe('dati del browser puliti prima di mandarli al server', () => {
  it('impostazioni: ogni campo che la schermata salva resta, gli altri no', () => {
    const full = {
      hrMax: 190, hrLthr: 168, lthrSource: 'declared', ftpDeclared: 250, ftpSource: 'declared', weeklyHours: 7.5,
      weeklyDays: 4, longRides: 1, weight: 72.5, strengthLevel: 2, longRideMaxMin: 240, availableDays: [1, 3, 6],
      longRideDays: [6], raceDate: '2027-05-10', raceName: 'Gran fondo', hasCompression: true, hasMassageGun: false,
    };
    expect(cleanForServer('settings', { ...full, sidebarCollapsed: true })).toEqual(full);
    expect(cleanForServer('settings', { hrMax: '190', weight: null, availableDays: [1, 'lun'] })).toEqual({});
    expect(cleanForServer('settings', [1, 2])).toBeNull();
  });

  it('Coach: indirizzo di Ollama e modello delle versioni vecchie non passano', () => {
    expect(cleanForServer('coachSettings', { endpoint: 'http://localhost:11434', model: 'llama3.1:8b', lastDuration: 90 }))
      .toEqual({ lastDuration: 90 });
  });

  it('giorni: solo date AAAA-MM-GG', () => {
    expect(cleanForServer('plannedRests', ['2026-11-06', 'domani', 7])).toEqual(['2026-11-06']);
    expect(cleanForServer('rainyDays', { a: 1 })).toBeNull();
  });

  it('storico FTP: i punti completi, senza campi in più', () => {
    expect(cleanForServer('ftpHistory', [
      { date: '2026-10-30', ftp: 245, source: 'declared', meso: 'base' }, { date: '2026-11-06', ftp: 'x', source: 'e' },
    ])).toEqual([{ date: '2026-10-30', ftp: 245, source: 'declared' }]);
  });

  it('mesociclo: intero o niente; blocchi e punti FTP rovinati si tolgono', () => {
    const meso = { startDate: '2026-10-26', blockIndex: 0, blockId: 'base', weekInBlock: 2 };
    expect(cleanForServer('mesocycle', {
      ...meso, extra: 1,
      blockHistory: [{ blockId: 'base', startDate: '2026-09-01', endDate: '2026-10-25', weeks: 8 }, { blockId: 'x' }],
      ftpHistory: [{ date: '2026-11-02', ftp: 248, source: 'x' }],
    })).toEqual({
      ...meso,
      blockHistory: [{ blockId: 'base', startDate: '2026-09-01', endDate: '2026-10-25', weeks: 8 }],
      ftpHistory: [{ date: '2026-11-02', ftp: 248 }],
    });
    expect(cleanForServer('mesocycle', { ...meso })).toEqual({ ...meso, blockHistory: [], ftpHistory: [] });
    expect(cleanForServer('mesocycle', { ...meso, blockIndex: 0.5 })).toBeNull();
    expect(cleanForServer('mesocycle', { startDate: '2026-10-26' })).toBeNull();
  });

  it('segmenti: tentativi e segmento come li dà Strava, il resto no', () => {
    expect(cleanForServer('segmentCache', {
      12: { efforts: [{ id: 1 }], _fetched: 1, _segment: { distance: 1200 }, nota: 'x' }, 13: 'rotto',
    })).toEqual({ 12: { efforts: [{ id: 1 }], _fetched: 1, _segment: { distance: 1200 } } });
  });
});
