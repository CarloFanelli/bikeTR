import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activityLabels, allActivities, ensureAllActivities, forgetAllActivities, loadActivityLabels, loadAllActivities,
  refreshAllActivities,
} from '../../src/app/all-activities.ts';
import type { Activity } from '../../src/core/strava-types.ts';
import { rideLabels, savedActivities } from '../../src/data/coach.ts';

vi.mock('../../src/data/coach.ts', () => ({ rideLabels: vi.fn(), savedActivities: vi.fn() }));

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

describe('etichette delle attività', () => {
  const profile = { ftp: 250, lthr: 160, hrMax: 190 };

  it('le chiede al servizio con FTP e soglia di adesso e le tiene per id', async () => {
    vi.mocked(rideLabels).mockResolvedValue({ ok: true, value: { labels: { 1: 'fondo', 2: 'ripetute' } } });
    await loadActivityLabels(profile, [1, 2, 3]);
    expect(rideLabels).toHaveBeenCalledWith(profile, [1, 2, 3]);
    expect(activityLabels.byId).toEqual({ 1: 'fondo', 2: 'ripetute' });
  });

  it('con le etichette spente il servizio non ne dà e non c\'è nessuna icona', async () => {
    vi.mocked(rideLabels).mockResolvedValue({ ok: true, value: { labels: {} } });
    await loadActivityLabels(profile, [1]);
    expect(activityLabels.byId).toEqual({});
  });

  it('con il servizio che non risponde le icone spariscono e le attività restano', async () => {
    vi.mocked(savedActivities).mockResolvedValue(answer(1));
    await loadAllActivities();
    vi.mocked(rideLabels).mockResolvedValue({ ok: true, value: { labels: { 1: 'fondo' } } });
    await loadActivityLabels(profile, [1]);
    vi.mocked(rideLabels).mockResolvedValue({ ok: false, msg: 'Coach non raggiungibile' });
    await loadActivityLabels(profile, [1]);
    expect(activityLabels.byId).toEqual({});
    expect(allActivities.list).toEqual(acts(1));
  });

  it('una richiesta più vecchia che finisce dopo non sovrascrive la più nuova', async () => {
    let releaseOld = () => {};
    vi.mocked(rideLabels)
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseOld = () => resolve({ ok: true, value: { labels: { 1: 'gara' } } });
      }))
      .mockResolvedValueOnce({ ok: true, value: { labels: { 1: 'fondo' } } });
    const old = loadActivityLabels(profile, [1]);
    await loadActivityLabels(profile, [1]);
    releaseOld();
    await old;
    expect(activityLabels.byId).toEqual({ 1: 'fondo' });
  });

  it('una nuova sessione dimentica le etichette', async () => {
    vi.mocked(rideLabels).mockResolvedValue({ ok: true, value: { labels: { 1: 'fondo' } } });
    await loadActivityLabels(profile, [1]);
    forgetAllActivities();
    expect(activityLabels.byId).toEqual({});
  });
});
