import { describe, expect, it } from 'vitest';
import {
  formView, ftpCard, ftpLthrView, ftpTrendRows, hrZonesView, powerCurveView, powerProfileView,
} from '../../src/core/analysis-view.ts';
import type { FormTrend } from '../../src/core/form.ts';
import type { FtpTrend } from '../../src/core/ftp.ts';
import type { HrProfile, HrZone } from '../../src/core/hr.ts';
import type { PowerBucket } from '../../src/core/power.ts';
import type { Activity } from '../../src/core/strava-types.ts';

const NOW = new Date(2026, 10, 7, 10);
const ride = (id: number, extra: Partial<Activity> = {}) =>
  ({ id, name: `Uscita ${id}`, type: 'Ride', start_date_local: '2026-10-20T08:00:00Z', moving_time: 3000, ...extra }) as Activity;
const hr = (p: Partial<HrProfile>) => ({ ftpEstFromActivities: null, ftpEstFromSegments: null, ...p }) as HrProfile;

describe('curva di potenza e FTP', () => {
  it('FTP dichiarata: vince lei, con W/kg e tutte le sorgenti', () => {
    const card = ftpCard(hr({ ftpDecl: 250, ftpEst: 240, ftpEstFromActivities: 240, ftpEstFromSegments: 230 }), 72);
    expect(card).toEqual({
      value: '250 W · 3.47 W/kg', active: 'dichiarata',
      sources: [
        { text: 'dichiarata: 250W', strong: true }, { text: 'da attività: 240W', strong: false },
        { text: 'da segmenti: 230W', strong: false },
      ],
    });
  });

  it('solo stime: vince la sorgente più alta, i segmenti a pari merito; senza peso niente W/kg', () => {
    expect(ftpCard(hr({ ftpEst: 240, ftpEstFromActivities: 240, ftpEstFromSegments: 230 }), null))
      .toMatchObject({ value: '240 W', active: 'attività' });
    expect(ftpCard(hr({ ftpEst: 240, ftpEstFromActivities: 240, ftpEstFromSegments: 240 }), 72)?.active).toBe('segmenti');
    expect(ftpCard(hr({}), 72)).toBeNull();
  });

  it('una riga per fascia, il valore porta all\'uscita; i punti stanno alla durata dell\'uscita', () => {
    const buckets: PowerBucket[] = [
      { label: '< 5 min', min: 0, max: 300 },
      { label: '30–60 min', min: 1800, max: 3600, best: { watts: 262.4, act: ride(9, { name: '<b>Muro</b>' }) } },
    ];
    const view = powerCurveView({ buckets, ftp: 249, wPerKg: '3.46' }, 72);
    expect(view.rows).toEqual([
      { label: '< 5 min', value: null, activityId: null },
      { label: '30–60 min', value: '262 W', activityId: 9 },
    ]);
    expect(view.points).toEqual([{
      x: 3000, y: 262, title: '30–60 min', text: '262 W · 3.64 W/kg', activity: '<b>Muro</b> · 20 ott 2026 · 50 min',
    }]);
  });
});

describe('trend di forma', () => {
  it('un giorno per punto fino a oggi, i valori di oggi arrotondati e lo stato', () => {
    const form = { DAYS: 3, ctl: [40, 41, 42.4], atl: [50, 55, 54.6], tsb: [-10, -14, -12.2], daily: [0, 0, 0] } as FormTrend;
    const view = formView(form, NOW);
    expect(view.labels).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(view.rows).toEqual([['Fitness (CTL)', '42'], ['Fatica (ATL)', '55'], ['Forma (TSB)', '-12'], ['Stato', '🟠 affaticato']]);
  });
});

describe('zone FC', () => {
  const zones = (mins: number[]) => ({
    zones: mins.map((minutes, i) => ({ label: `Z${i + 1}`, color: '#000', min: 0, max: 1, minutes })) as HrZone[],
    total: mins.reduce((a, b) => a + b, 0),
  });

  it('senza soglia o senza uscite con FC: il messaggio di oggi', () => {
    expect(hrZonesView(null).message).toBe('Imposta LTHR nelle impostazioni per vedere la distribuzione zone.');
    expect(hrZonesView(zones([0, 0, 0, 0, 0])).message).toBe('Nessuna attività con FC nelle ultime 4 settimane.');
  });

  it('minuti e percentuali come oggi, e il giudizio sulla polarizzazione', () => {
    const view = hrZonesView(zones([100.4, 200, 50, 30, 19.6]));
    expect(view.rows?.map(r => r.text)).toEqual(['100 min · 25%', '200 min · 50%', '50 min · 13%', '30 min · 8%', '20 min · 5%']);
    expect(view.note).toBe('✅ Distribuzione polarizzata (75% easy / 25% hard). Buono per FTP.');
    expect(hrZonesView(zones([30, 30, 20, 10, 10])).note).toBe('🟡 Distribuzione mista (60/40). Considera più Z2.');
    expect(hrZonesView(zones([20, 30, 30, 10, 10])).note).toBe('🔴 Troppa intensità (50/50). Rischio stallo: aumenta il volume easy.');
  });
});

describe('power profile', () => {
  it('barre relative alla più alta, colori per livello, rapporti, deficit e focus', () => {
    const view = powerProfileView({
      profile: {
        vo2max: { watts: 300, wkg: 4.17, pctOfRef: 0.9, label: '' },
        threshold: { watts: 250, wkg: 3.47, pctOfRef: 0.7, label: '' },
        endurance: { watts: 180, wkg: 2.5, pctOfRef: 0.45, label: '' },
      },
      ratios: { vo2_to_threshold: 1.2 },
      deficits: [{ area: 'endurance', label: 'Base', description: 'd', prescription: 'p', severity: 'medium' }],
      strengths: [{ area: 'vo2max', label: 'VO2max alto' }],
      primaryDeficit: null,
      recommendedFocus: 'endurance',
    } as never);
    expect(view.bars.map(b => [b.label, b.width, b.kind, b.value?.watts ?? null])).toEqual([
      ['Sprint/Anaerobico', 0, null, null],
      ['VO2max (5-15 min)', 100, 'strength', '300W'],
      ['Sub-soglia (15-30 min)', 0, null, null],
      ['Soglia (30-60 min)', 78, 'average', '250W'],
      ['Endurance (1-2h)', 50, 'deficit', '180W'],
      ['Long (>2h)', 0, null, null],
    ]);
    expect(view.ratios).toEqual([['VO2max / Soglia', '1.2']]);
    expect(view.strengths).toEqual(['VO2max alto']);
    expect(view.focus).toBe('Base aerobica (volume Z2 e uscite lunghe)');
  });
});

describe('FTP nel tempo', () => {
  it('i numeri sotto il grafico, con segni e icone di oggi', () => {
    const trend = { currentFtp: 250, peakFtp: 260, pctFromPeak: 96, delta4w: -4, recentSlope: -1.5, history: [{}, {}, {}] };
    expect(ftpTrendRows(trend as FtpTrend)).toEqual([
      ['FTP attuale', '250W'], ['Picco storico', '260W'], ['% del picco', '96%'], ['Delta 4 sett.', '-4W'],
      ['Trend', '📉 -1.5 W/sett'], ['Punti dati', '3'],
    ]);
    expect(ftpTrendRows({ ...trend, delta4w: 5, recentSlope: 2 } as FtpTrend).slice(3, 5))
      .toEqual([['Delta 4 sett.', '+5W'], ['Trend', '📈 +2 W/sett']]);
  });
});

describe('calcolo FTP / LTHR', () => {
  const act = ride(3, { moving_time: 3600, start_date_local: '2026-10-01T08:00:00Z' });
  const ftp = {
    rows: [
      { bucket: '40-90 min', factor: 0.98, act, rawWatts: 240, decayValue: 0.7712, ftpCandidate: 235 },
      { bucket: '20-40 min', factor: 0.95, empty: true as const },
    ],
    fallback: false,
  };
  const withWinner = { ...ftp, winning: ftp.rows[0] };

  it('FTP stimata: tabella aperta, vincitore segnato, righe vuote dette', () => {
    const view = ftpLthrView(withWinner as never, null, { ftpFromSegments: 230 },
      hr({ ftp: 235, ftpEst: 235, ftpEstFromActivities: 235, ftpEstFromSegments: 230 }));
    expect(view.ftp).toMatchObject({ value: '235 W', kind: 'stimata', declared: null, missing: false });
    expect(view.ftp.table).toEqual({
      open: true, summary: 'Dettaglio stima da attività (235 W) e segmenti (230 W)', fromSegments: 230,
      rows: [
        {
          bucket: '40-90 min', empty: false, winner: true, activity: { id: 3, name: 'Uscita 3' }, sub: '01 ott 26 · 60 min',
          watts: '240', decay: '0.77', factor: '× 0.98', candidate: '235',
        },
        { bucket: '20-40 min', empty: true },
      ],
    });
  });

  it('FTP dichiarata: tabella chiusa; senza potenza né FTP, il messaggio di oggi', () => {
    expect(ftpLthrView(withWinner as never, null, {}, hr({ ftp: 250, ftpDecl: 250, ftpEst: 235 })).ftp)
      .toMatchObject({ kind: 'dichiarata', declared: 250, table: { open: false } });
    expect(ftpLthrView({ rows: [], fallback: false } as never, null, {}, hr({})).ftp)
      .toMatchObject({ value: '— W', kind: '—', table: null, missing: true });
  });

  it('LTHR: M1, M2 assente detto, segmenti se c\'è la stima; vince il valore finale', () => {
    const lthr = { m1Row: { act, observedHRmax: 185, factor: 0.91, value: 168 }, m2Row: null, final: 168 };
    const view = ftpLthrView(null, lthr, { lthrFromSegments: 165 }, hr({ hrLthr: 170, lthrSource: 'declared', lthrEst: 168 }));
    expect(view.lthr.value).toBe('170 bpm');
    expect(view.lthr.kind).toBe('dichiarata');
    expect(view.lthr.table).toEqual({
      open: false,
      rows: [
        {
          method: 'M1', winner: true, activity: { id: 3, name: 'Uscita 3' }, sub: 'HRmax osservato 185 bpm · 01 ott 26',
          calc: 'HRmax × 0.91 (midpoint Friel/Coggan 88–92%)', value: 168,
        },
        { method: 'M2', empty: '— nessuna attività test-like 20-60 min con HR vicino al max —' },
        { method: 'Segmenti', winner: false, activity: null, sub: 'best avg HR su segmenti 15-45 min', calc: '× 0.98', value: 165 },
      ],
    });
    expect(ftpLthrView(null, null, {}, hr({ lthrEst: 168, hrLthr: 168 })).lthr).toEqual({ value: '168 bpm', kind: 'stimata', table: null });
  });
});
