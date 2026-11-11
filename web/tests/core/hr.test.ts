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

    // I colori registrati sono quelli fissi della vecchia app: ora ogni zona nomina un colore
    // del tema, quindi si confrontano minuti e fasce, e i colori a parte.
    it('minuti nelle zone FC delle ultime 4 settimane', () => {
      type Zones = { zones: { color: string }[] } | null;
      const noColor = (z: Zones) => z && { ...z, zones: z.zones.map(({ color: _, ...rest }) => rest) };
      const zones = buildHrZones(acts, withoutActivities.hrLthr, NOW);
      expect(displayed(noColor(zones))).toEqual(displayed(noColor(exp.hrZones as Zones)));
      if (zones) expect(zones.zones.map(z => z.color)).toEqual(['series-z1', 'series-z2', 'series-z3', 'series-z4', 'series-z5']);
    });
  });

  it('senza attività le stime mancano', () => {
    expect(estimateFTP(undefined, NOW)).toBeNull();
    expect(estimateLTHR([])).toBeNull();
  });
});
