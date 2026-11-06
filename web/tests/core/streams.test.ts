import { describe, expect, it } from 'vitest';
import { computeStreamsMetrics } from '../../src/core/streams.ts';
import { displayed, expected, rides, streamsOf } from './reference.ts';

describe('metriche dagli stream', () => {
  const cases: { activity: number; ftp: number | null; lthr: number | null; metrics: unknown }[] = expected.streams;
  it.each(cases)('attività $activity con FTP $ftp e LTHR $lthr', ({ activity, ftp, lthr, metrics }) => {
    const streams = streamsOf(rides.streams.byActivity[activity]);
    expect(displayed(computeStreamsMetrics(streams, ftp, lthr))).toEqual(displayed(metrics));
  });

  it('senza stream non calcola niente', () => {
    expect(computeStreamsMetrics({}, 250, 165)).toEqual({});
  });
});
