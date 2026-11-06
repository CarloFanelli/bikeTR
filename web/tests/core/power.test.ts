import { describe, expect, it } from 'vitest';
import { buildPowerCurve, buildPowerProfile } from '../../src/core/power.ts';
import { displayed, scenario, scenarios } from './reference.ts';

describe('curva e profilo di potenza', () => {
  describe.each(scenarios)('scenario $name', sc => {
    const { acts, expected: exp } = scenario(sc);

    it('miglior potenza per durata e profilo', () => {
      expect(displayed(buildPowerCurve(acts, sc.settings.weight))).toEqual(displayed(exp.powerCurve));
      expect(displayed(buildPowerProfile(acts, sc.settings.weight))).toEqual(displayed(exp.powerProfile));
    });
  });

  it('senza peso niente profilo', () => {
    const { acts } = scenario(scenarios[0]);
    expect(buildPowerProfile(acts, undefined)).toBeNull();
  });
});
