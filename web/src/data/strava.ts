// Richieste all'API di Strava. Ognuna chiede al server di autenticazione un token
// di accesso appena prima di partire: un lavoro lungo, o una scheda aperta da ore,
// non resta con un token scaduto.

import { getAccessToken } from './auth.ts';
import type {
  Activity, ActivityDetail, Athlete, AthleteStats, Segment, SegmentEffort, Streams,
} from '../core/strava-types.ts';

const API = 'https://www.strava.com/api/v3';
const METRICS_STREAMS = 'time,heartrate,watts,cadence';
const STARRED_PAGE = 50;
const STARRED_MAX_PAGES = 10;

async function stravaFetch(path: string): Promise<Response> {
  const token = await getAccessToken();
  return fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
}

async function stravaGet<T>(path: string): Promise<T> {
  const res = await stravaFetch(path);
  if (!res.ok) throw new Error('API ' + path + ': ' + res.status);
  return res.json();
}

export const fetchAthlete = (): Promise<Athlete> => stravaGet('/athlete');

export const fetchAthleteStats = (athleteId: number): Promise<AthleteStats> =>
  stravaGet(`/athletes/${athleteId}/stats`);

// Una pagina delle attività, dalla più recente (Strava ne dà al massimo 200 per pagina).
export const fetchActivities = (perPage: number, page = 1): Promise<Activity[]> =>
  stravaGet(`/athlete/activities?per_page=${perPage}&page=${page}`);

// Dettaglio di un'attività; `allEfforts` include tutti i tentativi sui segmenti.
export const fetchActivity = (id: number | string, { allEfforts = false } = {}): Promise<ActivityDetail> =>
  stravaGet(`/activities/${id}${allEfforts ? '?include_all_efforts=true' : ''}`);

// Tutti i segmenti preferiti, fino a 10 pagine da 50.
export async function fetchStarredSegments(): Promise<Segment[]> {
  const starred: Segment[] = [];
  for (let page = 1; page <= STARRED_MAX_PAGES; page++) {
    const batch = await stravaGet<Segment[]>(`/segments/starred?per_page=${STARRED_PAGE}&page=${page}`);
    starred.push(...batch);
    if (batch.length < STARRED_PAGE) break;
  }
  return starred;
}

export const fetchSegmentEfforts = (segmentId: number): Promise<SegmentEffort[]> =>
  stravaGet(`/segments/${segmentId}/all_efforts?per_page=100`);

// Serie secondo per secondo di un'attività: di default quelle per le metriche.
export async function fetchActivityStreams(activityId: number, keys = METRICS_STREAMS): Promise<Streams> {
  const res = await stravaFetch(`/activities/${activityId}/streams?keys=${keys}&key_by_type=true`);
  if (!res.ok) throw new Error('streams ' + activityId + ': ' + res.status);
  return res.json();
}
