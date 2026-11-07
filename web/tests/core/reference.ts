// Le uscite inventate (tests/fixtures/rides.json) e i risultati registrati dal JavaScript
// di prima della conversione (tests/fixtures/load-expected.json), che non si possono più registrare.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FtpPoint } from '../../src/core/ftp.ts';
import { resolveHr } from '../../src/core/hr.ts';
import { estimatesFromSegments } from '../../src/core/segments.ts';
import type { Activity, Streams } from '../../src/core/strava-types.ts';
import { computeStreamsMetrics } from '../../src/core/streams.ts';
import { replacer } from '../reference/serialize.ts';

export const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8'));
export const rides = fixture('rides.json');
export const expected = fixture('load-expected.json');

// I giorni dipendono dal fuso orario, come nel browser: i test girano in quello della registrazione.
process.env.TZ = rides.timeZone;
export const NOW = new Date(rides.now);

// Serie degli stream nel formato di Strava, da blocchi [valore, secondi].
export const streamsOf = (s: Record<string, [number, number][]>): Streams =>
  Object.fromEntries(Object.entries(s).map(([k, blocks]) =>
    [k, { data: blocks.flatMap(([v, n]) => Array<number>(n).fill(v)) }]));

// Le attività con le metriche degli stream già scaricati.
export function activities(): Activity[] {
  const acts: Activity[] = structuredClone(rides.activities);
  for (const [id, s] of Object.entries(rides.streams.byActivity)) {
    const act = acts.find(a => String(a.id) === id);
    if (act) act._metrics = computeStreamsMetrics(streamsOf(s as Record<string, [number, number][]>), 250, 165);
  }
  return acts;
}

// Un risultato come lo vede chi usa l'app: in JSON come in load-expected.json, con i
// numeri a 2 decimali (l'app non ne mostra di più).
export function displayed(value: unknown): unknown {
  const round = (x: unknown): unknown =>
    typeof x === 'number' ? Math.round(x * 100) / 100 || 0
      : Array.isArray(x) ? x.map(round)
      : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)]))
      : x;
  const json = JSON.stringify(value, replacer);
  return round(json === undefined ? undefined : JSON.parse(json));
}

export interface Scenario {
  name: string;
  settings: { weight?: number; hrMax?: number; hrLthr?: number; lthrSource?: string; ftpDeclared?: number; ftpSource?: string };
  segments: boolean;
  ftpHistory: string;
  mesocycle?: string;
  noActivities?: boolean;
  stats: string;
}
export const scenarios: Scenario[] = rides.scenarios;

// Ingressi di uno scenario come li preparano le pagine: attività, stime dai segmenti
// salvati, valori di FTP e soglia, storico FTP.
export function scenario(sc: Scenario) {
  const acts = sc.noActivities ? [] : activities();
  const segmentEstimates = estimatesFromSegments(sc.segments ? rides.segmentCache : {}, NOW);
  return {
    acts,
    segmentEstimates,
    profile: resolveHr(sc.settings, acts, segmentEstimates, NOW),
    ftpHistory: (rides.ftpHistories[sc.ftpHistory] ?? []) as FtpPoint[],
    expected: expected.scenarios[sc.name],
  };
}
