// Il carico delle attività vere lo calcola il servizio Coach; il piano ne tiene una copia per i
// suoi allenamenti simulati. Sulle attività inventate dei test del Coach la copia deve dare i
// carichi attesi che il Coach rispetta (docker/coach/tests/fixtures/metrics_expected.json): se la
// formula del Coach cambia, cambiano quei valori e questo test fallisce finché la copia non segue.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { activityLoad } from '../../src/core/load.ts';
import type { Activity } from '../../src/core/strava-types.ts';
import { computeStreamsMetrics } from '../../src/core/streams.ts';
import { streamsOf } from './reference.ts';

const coachFixture = (name: string) => JSON.parse(fs.readFileSync(
  fileURLToPath(new URL(`../../../docker/coach/tests/fixtures/${name}`, import.meta.url)), 'utf8'));
const rides = coachFixture('rides.json');
const expected = coachFixture('metrics_expected.json')['Europe/Rome'].scenarios;

interface Scenario { name: string; profile: string; noActivities?: boolean }
const scenarios = (rides.scenarios as Scenario[]).filter(sc => !sc.noActivities);

describe('copia del carico per gli allenamenti simulati', () => {
  it.each(scenarios.map(sc => [sc.name, sc] as const))('scenario %s: gli stessi carichi del Coach', (_name, sc) => {
    const p = rides.profiles[sc.profile];
    const acts: Activity[] = structuredClone(rides.activities);
    // I dettagli corsa del Coach corrispondono alle metriche degli stream nel browser.
    for (const a of acts) {
      const streams = rides.streams[String(a.id)];
      if (streams) a._metrics = computeStreamsMetrics(streamsOf(streams), p.ftp, p.lthr);
    }
    const loads = Object.fromEntries(acts.map(a => [String(a.id), activityLoad(a, p.hrMax, p.lthr, p.ftp)]));
    expect(loads).toEqual(expected[sc.name].loads);
  });

  it('un carico già calcolato dal Coach vince sulla formula', () => {
    const ride = { id: 1, type: 'Ride', moving_time: 3600, weighted_average_watts: 200, _load: 12 } as Activity;
    expect(activityLoad(ride, 185, 165, 250)).toBe(12);
  });
});
