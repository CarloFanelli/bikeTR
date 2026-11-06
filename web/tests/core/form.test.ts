import { describe, expect, it } from 'vitest';
import { buildFormTrend, compositeFatigueScore, crossTrainingInsights, formInsights } from '../../src/core/form.ts';
import { buildFtpTrend } from '../../src/core/ftp.ts';
import { resolveHr } from '../../src/core/hr.ts';
import { displayed, NOW, scenario, scenarios } from './reference.ts';

describe('forma', () => {
  describe.each(scenarios)('scenario $name', sc => {
    const { acts, segmentEstimates, profile, ftpHistory, expected: exp } = scenario(sc);
    const form = buildFormTrend(acts, profile, NOW);

    it('fitness, fatica e freschezza dei 90 giorni', () => {
      expect(displayed(form)).toEqual(displayed(exp.form));
    });

    it('osservazioni sulla forma', () => {
      // Come la card Forma: soglia e FTP senza le stime dalle attività.
      const { hrLthr, ftp } = resolveHr(sc.settings, undefined, segmentEstimates, NOW);
      // Mesociclo e risposta al blocco vengono dal piano di allenamento: valori registrati.
      const { meso, response } = exp.insightContext;
      const insights = formInsights(form, acts, { hrLthr, ftp, now: NOW, ftpTrend: buildFtpTrend(ftpHistory), meso, response });
      expect(displayed(insights)).toEqual(displayed(exp.formInsights));
    });

    it('fatica complessiva e attività diverse dalla bici', () => {
      expect(displayed(compositeFatigueScore(form, acts, NOW))).toEqual(displayed(exp.compositeFatigue));
      expect(displayed(crossTrainingInsights(acts, NOW))).toEqual(displayed(exp.crossTraining));
    });
  });

  it('non cambia la data ricevuta', () => {
    const now = new Date(NOW);
    const { acts, profile } = scenario(scenarios[0]);
    buildFormTrend(acts, profile, now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});
