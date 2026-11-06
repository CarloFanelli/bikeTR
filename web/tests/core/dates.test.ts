import { describe, expect, it } from 'vitest';
import { buildDateHelpers } from '../../src/core/dates.ts';
import { expected, NOW } from './reference.ts';

describe('giorni rispetto al giorno di riferimento', () => {
  const cases: { offset: number; ref: string; ago: Record<string, number>; refIso: Record<string, string> }[] = expected.dates;
  it.each(cases)('a $offset giorni da oggi', c => {
    const { ref, ago, refIso } = buildDateHelpers(c.offset, NOW);
    expect(ref.toISOString()).toBe(c.ref);
    expect(Object.fromEntries(Object.keys(c.ago).map(iso => [iso, ago(iso)]))).toEqual(c.ago);
    expect(Object.fromEntries([-1, 0, 1, 7].map(n => [n, refIso(n)]))).toEqual(c.refIso);
  });

  it('non cambia la data ricevuta', () => {
    const now = new Date(NOW);
    buildDateHelpers(3, now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});
