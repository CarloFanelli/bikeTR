import { describe, expect, it } from 'vitest';
import { activityLoad, hikeSpecificLoad, isHard, muscularFatigueScore, typeWeight } from '../../src/core/load.ts';
import { displayed, expected, NOW, rides, scenario, scenarios } from './reference.ts';

describe('carico delle attività', () => {
  it('peso di un tipo di attività dato per nome', () => {
    expect(['Ride', 'Hike', 'Sconosciuto', null].map(t => typeWeight(t))).toEqual(expected.typeWeights);
  });

  it('carico di escursioni e camminate con e senza FC e soglia', () => {
    const hikes = rides.activities.filter((a: { type: string }) => a.type === 'Hike' || a.type === 'Walk');
    const loads = hikes.flatMap((a: never) => [[186, 166], [190, null], [null, null]].map(([hrMax, hrLthr]) =>
      ({ hrMax, hrLthr, load: hikeSpecificLoad(a, hrMax, hrLthr) })));
    expect(displayed(loads)).toEqual(displayed(expected.hikeLoads));
  });

  describe.each(scenarios)('scenario $name', sc => {
    const { acts, profile, expected: exp } = scenario(sc);

    it('peso, carico e sessione dura di ogni attività', () => {
      const perActivity = Object.fromEntries(acts.map(a => [a.id, {
        typeWeight: typeWeight(a),
        load: activityLoad(a, profile.hrMax, profile.hrLthr, profile.ftp),
        hard: isHard(a, profile.hrLthr, profile.ftp),
      }]));
      expect(displayed(perActivity)).toEqual(displayed(exp.activities));
    });

    it('fatica muscolare su 7 e 14 giorni', () => {
      expect({ 7: muscularFatigueScore(acts, 7, NOW), 14: muscularFatigueScore(acts, 14, NOW) })
        .toEqual(exp.muscularFatigue);
    });
  });
});
