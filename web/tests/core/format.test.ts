import { describe, expect, it } from 'vitest';
import { fmtDate, fmtKm, fmtTime, isoDay } from '../../src/core/format.ts';

describe('formattazione', () => {
  it('distanze in km con un decimale', () => {
    expect(fmtKm(42195)).toBe('42.2 km');
    expect(fmtKm(0)).toBe('0.0 km');
  });

  it('durate in ore e minuti, senza ore sotto l\'ora', () => {
    expect(fmtTime(3900)).toBe('1h 5m');
    expect(fmtTime(3599)).toBe('59m');
    expect(fmtTime(7200)).toBe('2h 0m');
  });

  it('date in italiano, con anno intero o a due cifre', () => {
    const d = new Date(2026, 4, 7, 10, 30);
    expect(fmtDate(d)).toBe('07 mag 2026');
    expect(fmtDate(d, { year: '2-digit' })).toBe('07 mag 26');
    expect(fmtDate('2026-11-06T08:00:00')).toBe('06 nov 2026');
  });

  it('il giorno locale di una data', () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(isoDay('2026-11-06T00:30:00')).toBe('2026-11-06');
  });
});
