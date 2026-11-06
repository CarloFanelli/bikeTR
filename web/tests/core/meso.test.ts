import { describe, expect, it } from 'vitest';
import { buildFormTrend } from '../../src/core/form.ts';
import { nextFtpHistory, type FtpPoint } from '../../src/core/ftp.ts';
import {
  athleteResponseCheck, chooseNextBlock, deficitToBlock, getTaperPhase, getWeekRoleInBlock, mesoPhaseForWeek,
  mesoSummary, nextMesocycle, withFtpPoint, type Mesocycle,
} from '../../src/core/meso.ts';
import { mesocycleOf, plan, planExpected, settingsOf, throws } from './plan-reference.ts';
import { activities, displayed, expected, NOW, rides, scenario, scenarios } from './reference.ts';

const recorded = planExpected.meso;
const meso = (blockId: string, weekInBlock: number | null) =>
  (weekInBlock == null ? { blockId } : { blockId, weekInBlock });

describe('mesociclo e taper', () => {
  it('taper nelle 3 settimane prima della gara', () => {
    const taper: { race: string | null; week: string | null }[] = recorded.taper;
    expect(displayed(taper.map(t => ({ ...t, phase: getTaperPhase(t.race, t.week) })))).toEqual(displayed(recorded.taper));
  });

  it('ruolo di ogni settimana nel blocco', () => {
    const roles: { blockId: string | null; weekInBlock: number | null; offset: number }[] = recorded.weekRoles;
    expect(displayed(roles.map(r =>
      ({ ...r, role: getWeekRoleInBlock(r.blockId ? meso(r.blockId, r.weekInBlock) : null, r.offset) }))))
      .toEqual(displayed(recorded.weekRoles));
  });

  it('blocco scelto dal deficit, blocco successivo, fase della settimana', () => {
    const p = plan.meso;
    expect(p.deficits.map(deficitToBlock)).toEqual(recorded.deficits);
    expect(p.nextBlock.blocks.flatMap((blockId: string) => p.nextBlock.deficits.map((area: string | null) =>
      chooseNextBlock({ blockId }, area ? { primaryDeficit: { area } } : null)))).toEqual(recorded.nextBlock);
    expect(p.weekRoles.blocks.flatMap((blockId: string) =>
      [0, 1, 3, 5].map(w => mesoPhaseForWeek({ blockId, weekInBlock: w })))).toEqual(recorded.phases);
  });

  const inits: { now: string; mesocycle: string | null; settings: string; result: unknown; stored: unknown }[] = recorded.inits;
  it.each(inits)('mesociclo $mesocycle il $now con impostazioni $settings', i => {
    const stored = mesocycleOf(i.mesocycle);
    const update = () => nextMesocycle(stored, activities(), settingsOf(i.settings), new Date(i.now));
    if (throws(i.result)) {
      expect(update).toThrow(TypeError);
      expect(i.stored).toEqual(stored);
      return;
    }
    const { meso: next, changed } = update();
    expect(displayed(next)).toEqual(displayed(i.result));
    expect(displayed(changed ? next : stored)).toEqual(displayed(i.stored));
  });
});

// La card Forma e il punto FTP di oggi (registrati con i calcoli della tab Analisi).
describe('mesociclo nella tab Analisi', () => {
  describe.each(scenarios)('scenario $name', sc => {
    const { acts, profile, expected: exp } = scenario(sc);
    const stored: Mesocycle | null = sc.mesocycle ? rides.mesocycles[sc.mesocycle] : null;

    it('blocco in corso e risposta dell\'atleta', () => {
      expect(mesoSummary(stored)).toEqual(exp.insightContext.meso);
      expect(displayed(athleteResponseCheck(buildFormTrend(acts, profile, NOW), stored)))
        .toEqual(displayed(exp.insightContext.response));
    });
  });

  const pointCases: { scenario: string; ftpHistory: string; mesocycle?: string }[] = rides.ftpPointCases;
  it.each(pointCases.map((c, i) => ({ ...c, i })))('punto FTP nel mesociclo, scenario $scenario con storico $ftpHistory', c => {
    const { profile } = scenario(scenarios.find(sc => sc.name === c.scenario)!);
    const stored: Mesocycle | null = c.mesocycle ? rides.mesocycles[c.mesocycle] : null;
    const history = nextFtpHistory(rides.ftpHistories[c.ftpHistory] as FtpPoint[], profile, NOW);
    const last = history?.[history.length - 1];
    const saved = stored && last ? withFtpPoint(stored, last.date, last.ftp) : stored;
    expect(saved).toEqual(expected.ftpPoints[c.i].mesocycle);
  });
});
