import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allActivities, ensureAllActivities, forgetAllActivities, loadAllActivities, refreshAllActivities,
} from '../../src/app/all-activities.ts';
import type { Activity } from '../../src/core/strava-types.ts';
import { savedActivities } from '../../src/data/coach.ts';

vi.mock('../../src/data/coach.ts', () => ({ savedActivities: vi.fn() }));

const acts = (...ids: number[]) => ids.map(id => ({ id }) as Activity);
const answer = (...ids: number[]) => ({ ok: true as const, value: acts(...ids) });

beforeEach(() => {
  vi.clearAllMocks();
  forgetAllActivities();
});

describe('tutte le attività', () => {
  it('lette una volta, la prima volta che una schermata le chiede, senza limite', async () => {
    vi.mocked(savedActivities).mockResolvedValue(answer(1, 2, 3));
    ensureAllActivities();
    await vi.waitFor(() => expect(allActivities.list).toEqual(acts(1, 2, 3)));
    ensureAllActivities();
    expect(savedActivities).toHaveBeenCalledTimes(1);
    expect(savedActivities).toHaveBeenCalledWith();
  });

  it('dopo un aggiornamento da Strava si rileggono, ma solo se una schermata le ha chieste', async () => {
    refreshAllActivities();
    expect(savedActivities).not.toHaveBeenCalled();
    vi.mocked(savedActivities).mockResolvedValue(answer(1));
    await loadAllActivities();
    vi.mocked(savedActivities).mockResolvedValue(answer(2, 1));
    refreshAllActivities();
    await vi.waitFor(() => expect(allActivities.list).toEqual(acts(2, 1)));
  });

  it('una lettura più vecchia che finisce dopo non sovrascrive la più nuova', async () => {
    let releaseOld = () => {};
    vi.mocked(savedActivities)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOld = () => resolve(answer(1)); }))
      .mockResolvedValueOnce(answer(2, 1));
    const old = loadAllActivities();
    await loadAllActivities();
    releaseOld();
    await old;
    expect(allActivities.list).toEqual(acts(2, 1));
  });

  it('un errore resta da mostrare, con l\'elenco di prima', async () => {
    vi.mocked(savedActivities).mockResolvedValue(answer(1));
    await loadAllActivities();
    vi.mocked(savedActivities).mockResolvedValue({ ok: false, msg: 'Coach non raggiungibile' });
    await loadAllActivities();
    expect(allActivities).toEqual({ list: acts(1), error: 'Coach non raggiungibile' });
  });

  it('una nuova sessione dimentica l\'atleta di prima', async () => {
    vi.mocked(savedActivities).mockResolvedValue(answer(1));
    await loadAllActivities();
    forgetAllActivities();
    refreshAllActivities();
    expect(allActivities.list).toBeNull();
    expect(savedActivities).toHaveBeenCalledTimes(1);
  });
});
