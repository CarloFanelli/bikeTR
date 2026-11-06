import { describe, expect, it } from 'vitest';
import { buildProfile, consistencyScore, levelFromKm, personalRecords } from '../../src/core/profile.ts';
import { displayed, expected, NOW, rides, scenario, scenarios } from './reference.ts';

describe('profilo dell\'atleta', () => {
  it('livello dai km totali, ai limiti di ogni fascia', () => {
    expect(rides.levelKm.map(levelFromKm)).toEqual(expected.levels);
  });

  describe.each(scenarios)('scenario $name', sc => {
    const { acts, expected: exp } = scenario(sc);

    it('costanza, profilo e record', () => {
      expect(consistencyScore(acts, NOW)).toEqual(exp.consistency);
      expect(displayed(buildProfile(rides.stats[sc.stats], acts, sc.settings, NOW))).toEqual(displayed(exp.athleteProfile));
      expect(displayed(personalRecords(acts))).toEqual(displayed(exp.records));
    });
  });
});
