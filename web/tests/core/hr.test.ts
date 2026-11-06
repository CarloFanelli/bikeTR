import { describe, expect, it } from 'vitest';
import { buildHrZones, estimateFTP, estimateLTHR, resolveHr } from '../../src/core/hr.ts';
import { displayed, NOW, scenario, scenarios } from './reference.ts';

describe('FTP e soglia cardiaca', () => {
  describe.each(scenarios)('scenario $name', sc => {
    const { acts, segmentEstimates, profile, expected: exp } = scenario(sc);
    // Come le card Forma e Zone FC: solo valori dichiarati e segmenti.
    const withoutActivities = resolveHr(sc.settings, undefined, segmentEstimates, NOW);

    it('stime dalle attività', () => {
      expect(estimateFTP(acts, NOW)).toEqual(exp.ftpFromActivities);
      expect(estimateLTHR(acts)).toEqual(exp.lthrFromActivities);
    });

    it('valori usati dai calcoli, con e senza attività', () => {
      expect(displayed(profile)).toEqual(displayed(exp.profile));
      expect(displayed(withoutActivities)).toEqual(displayed(exp.profileWithoutActivities));
    });

    it('minuti nelle zone FC delle ultime 4 settimane', () => {
      expect(displayed(buildHrZones(acts, withoutActivities.hrLthr, NOW))).toEqual(displayed(exp.hrZones));
    });
  });

  it('senza attività le stime mancano', () => {
    expect(estimateFTP(undefined, NOW)).toBeNull();
    expect(estimateLTHR([])).toBeNull();
  });
});
