// I dati dell'atleta che stanno sul server (docker/coach/app/athlete_data.py), con la chiave
// del browser in cui le versioni precedenti li salvavano, e la loro pulizia prima di mandarli
// la prima volta: restano solo i campi che l'app usa, con il tipo giusto. Un campo lasciato da
// una versione vecchia, o rovinato, non deve far rifiutare dal server tutto il resto.

export const ATHLETE_KEYS = {
  settings: 'biketr_settings',
  plannedRests: 'biketr_planned_rests',
  rainyDays: 'biketr_rainy_days',
  ftpHistory: 'biketr_ftp_history',
  mesocycle: 'biketr_mesocycle',
  segmentCache: 'biketr_segments_cache_v2',
  coachSettings: 'biketr_coach_settings',
} as const;
export type AthleteKey = keyof typeof ATHLETE_KEYS;

type Kind = 'number' | 'string' | 'boolean' | 'integers' | 'object' | 'objects';
type Shape = Record<string, Kind>;

const SETTINGS: Shape = {
  hrMax: 'number', hrLthr: 'number', lthrSource: 'string', ftpDeclared: 'number', ftpSource: 'string',
  weeklyHours: 'number', weeklyDays: 'number', longRides: 'number', weight: 'number', strengthLevel: 'number',
  longRideMaxMin: 'number', availableDays: 'integers', longRideDays: 'integers', raceDate: 'string',
  raceName: 'string', hasCompression: 'boolean', hasMassageGun: 'boolean',
};
const FTP_POINT: Shape = { date: 'string', ftp: 'number', source: 'string' };
const MESO_BLOCK: Shape = { blockId: 'string', startDate: 'string', endDate: 'string', weeks: 'number' };
const MESO_FTP_POINT: Shape = { date: 'string', ftp: 'number' };
const MESOCYCLE: Shape = { startDate: 'string', blockIndex: 'number', blockId: 'string', weekInBlock: 'number' };
const SEGMENT_ENTRY: Shape = { efforts: 'objects', _fetched: 'number', _segment: 'object' };
const COACH_SETTINGS: Shape = { lastDuration: 'number' };

export const isObject = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);

function fits(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'integers': return Array.isArray(value) && value.every(Number.isInteger);
    case 'object': return isObject(value);
    case 'objects': return Array.isArray(value) && value.every(isObject);
  }
}

// I campi di `shape` con il tipo giusto; con `required`, null se ne manca uno.
function pick(value: unknown, shape: Shape, required = false): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const kept: Record<string, unknown> = {};
  for (const [field, kind] of Object.entries(shape)) {
    if (fits(value[field], kind)) kept[field] = value[field];
    else if (required) return null;
  }
  return kept;
}

const list = (value: unknown, shape: Shape) =>
  (Array.isArray(value) ? value.map(v => pick(v, shape, true)).filter(v => v !== null) : null);
const days = (value: unknown) =>
  (Array.isArray(value) ? value.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : null);
const integerFields = (meso: Record<string, unknown>) => Number.isInteger(meso.blockIndex) && Number.isInteger(meso.weekInBlock);

// Il valore salvato da una versione precedente, come il server lo accetta; null se non ne resta nulla.
export function cleanForServer(key: AthleteKey, value: unknown): unknown {
  switch (key) {
    case 'settings': return pick(value, SETTINGS);
    case 'coachSettings': return pick(value, COACH_SETTINGS);
    case 'plannedRests':
    case 'rainyDays': return days(value);
    case 'ftpHistory': return list(value, FTP_POINT);
    case 'mesocycle': {
      const meso = pick(value, MESOCYCLE, true);
      if (!meso || !isObject(value) || !integerFields(meso)) return null;
      const blocks = list(value.blockHistory, MESO_BLOCK)?.filter(b => Number.isInteger(b.weeks));
      return { ...meso, blockHistory: blocks ?? [], ftpHistory: list(value.ftpHistory, MESO_FTP_POINT) ?? [] };
    }
    case 'segmentCache': {
      if (!isObject(value)) return null;
      return Object.fromEntries(Object.entries(value).map(([id, entry]) => [id, pick(entry, SEGMENT_ENTRY)])
        .filter(([, entry]) => entry !== null));
    }
  }
}
