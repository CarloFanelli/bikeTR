import { describe, expect, it } from 'vitest';
import { buildFtpBreakdown, buildFtpTrend, buildLthrBreakdown, nextFtpHistory, type FtpPoint } from '../../src/core/ftp.ts';
import { displayed, expected, NOW, rides, scenario, scenarios } from './reference.ts';

describe('storico e stime della FTP', () => {
  it.each(Object.keys(rides.ftpHistories))('andamento dello storico %s', name => {
    expect(displayed(buildFtpTrend(rides.ftpHistories[name]))).toEqual(displayed(expected.ftpTrends[name]));
  });

  // Lo storico salvato dopo un caricamento della pagina Allenamento.
  const pointCases: { scenario: string; ftpHistory: string; stored: FtpPoint[] }[] =
    rides.ftpPointCases.map((c: { scenario: string; ftpHistory: string }, i: number) =>
      ({ ...c, stored: expected.ftpPoints[i].ftpHistory }));
  it.each(pointCases)('punto FTP di oggi, scenario $scenario con storico $ftpHistory', c => {
    const { profile } = scenario(scenarios.find(sc => sc.name === c.scenario)!);
    const history: FtpPoint[] = rides.ftpHistories[c.ftpHistory];
    expect(nextFtpHistory(history, profile, NOW) ?? history).toEqual(c.stored);
  });

  describe.each(scenarios)('scenario $name', sc => {
    const { acts, ftpHistory, expected: exp } = scenario(sc);

    it('andamento e dettaglio delle stime', () => {
      expect(displayed(buildFtpTrend(ftpHistory))).toEqual(displayed(exp.ftpTrend));
      expect(displayed(buildFtpBreakdown(acts, NOW))).toEqual(displayed(exp.ftpBreakdown));
      expect(displayed(buildLthrBreakdown(acts))).toEqual(displayed(exp.lthrBreakdown));
    });
  });
});
