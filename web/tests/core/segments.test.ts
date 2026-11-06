import { describe, expect, it } from 'vitest';
import {
  computePrediction, effortDecay, estimatesFromSegments, formAdjustedTime, generateSegmentWorkouts,
  isSegmentFTPSuitable, linearRegression, segmentTargetedWorkout, type SegmentEntry,
} from '../../src/core/segments.ts';
import { displayed, expected, NOW, rides, scenario, scenarios } from './reference.ts';

const entries: SegmentEntry[] = rides.predictions;
const exp = expected.segments;

describe('segmenti', () => {
  it('salite adatte alla stima della FTP', () => {
    const shapes = [...Object.values(rides.segmentCache).map((c: any) => c._segment || {}), ...entries.map(e => e.segment)];
    expect(shapes.map(isSegmentFTPSuitable)).toEqual(exp.suitable);
  });

  it('peso dei tentativi secondo l\'età', () => {
    const decay = entries.flatMap(e => e.efforts).map(e => effortDecay(e.start_date, NOW));
    expect(displayed(decay)).toEqual(displayed(exp.decay));
  });

  it('regressione lineare, anche con meno di due punti', () => {
    expect(displayed(rides.regressionPoints.map(linearRegression))).toEqual(displayed(exp.regression));
  });

  it('tempo corretto dalla forma', () => {
    const adjusted = rides.adjustCases.flatMap(([base, best]: [number, number]) =>
      rides.formContexts.map((ctx: never) => formAdjustedTime(base, best, ctx)));
    expect(displayed(adjusted)).toEqual(displayed(exp.adjusted));
  });

  it('previsione del prossimo tempo per ogni forma', () => {
    const predictions = entries.map(e => rides.formContexts.map((ctx: never) => computePrediction(e, ctx)));
    expect(displayed(predictions)).toEqual(displayed(exp.predictions));
  });

  it('allenamenti mirati, con e senza FTP', () => {
    const targeted = entries.map(e => [segmentTargetedWorkout(e, 250, 165), segmentTargetedWorkout(e, null, null)]);
    expect(displayed(targeted)).toEqual(displayed(exp.targeted));
    const generated = [generateSegmentWorkouts(entries, 250, 165), generateSegmentWorkouts([], 250, 165)];
    expect(displayed(generated)).toEqual(displayed(exp.generated));
  });

  it.each(scenarios)('stime di FTP e soglia dai segmenti salvati, scenario $name', sc => {
    const { segmentEstimates, expected: scExp } = scenario(sc);
    expect(displayed(segmentEstimates)).toEqual(displayed(scExp.segmentEstimates));
  });

  it('senza segmenti salvati nessuna stima', () => {
    expect(estimatesFromSegments({}, NOW).ftpFromSegments).toBeNull();
  });
});
