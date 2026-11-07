// Le risposte dell'API di Strava usate dall'app, che i calcoli ricevono come dati.
// Un campo con "?" può mancare: per esempio una corsa senza misuratore di potenza non
// ha average_watts, e una senza fascia cardio non ha average_heartrate.

// Metriche di un'attività calcolate dai suoi stream (vedi streams.ts).
export interface StreamMetrics {
  NP?: number;
  IF?: number;
  TSS?: number;
  hrZones?: number[];
  hrTSS?: number;
}

export interface Athlete {
  id: number;
  firstname: string;
  lastname: string;
  profile?: string;
  sex?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  weight?: number | null;
  ftp?: number | null;
  premium?: boolean;
  created_at?: string;
}

export interface Totals {
  count: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_gain: number;
}

export interface AthleteStats {
  all_ride_totals?: Totals;
  all_run_totals?: Totals;
  all_swim_totals?: Totals;
  recent_ride_totals?: Totals;
  recent_run_totals?: Totals;
  ytd_ride_totals?: Totals;
  ytd_run_totals?: Totals;
}

export interface Activity {
  id: number;
  // Chi ha registrato l'attività.
  athlete?: { id: number };
  name: string;
  type: string;
  sport_type?: string;
  external_id?: string | null;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  elev_high?: number;
  elev_low?: number;
  average_speed?: number;
  max_speed?: number;
  average_cadence?: number;
  average_temp?: number;
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  device_watts?: boolean;
  kilojoules?: number;
  suffer_score?: number | null;
  calories?: number;
  workout_type?: number | null;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  achievement_count?: number;
  kudos_count?: number;
  pr_count?: number;
  gear_id?: string | null;
  upload_id?: number | null;
  start_latlng?: number[] | null;
  end_latlng?: number[] | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  map?: { summary_polyline?: string | null; polyline?: string | null };
  // Aggiunti dall'app: metriche dagli stream salvati, dettaglio già scaricato.
  _metrics?: StreamMetrics;
  _detailFetched?: boolean;
}

// Il segmento come appare nei preferiti e dentro un tentativo.
export interface Segment {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  maximum_grade?: number;
  elevation_high?: number;
  elevation_low?: number;
  total_elevation_gain?: number;
  climb_category?: number;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  starred?: boolean;
}

export interface SegmentEffort {
  id: number;
  name?: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local?: string;
  distance: number;
  start_index?: number;
  end_index?: number;
  average_cadence?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  device_watts?: boolean;
  pr_rank?: number | null;
  kom_rank?: number | null;
  segment?: Segment;
}

export interface Split {
  split: number;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  elevation_difference?: number;
  average_speed?: number;
  average_heartrate?: number;
  pace_zone?: number;
}

// Un giro (lap) registrato dal ciclocomputer.
export interface Lap {
  lap_index: number;
  name: string;
  start_index: number;
  end_index: number;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
}

// Il miglior tempo su una distanza standard (es. "5k") dentro l'attività.
export interface BestEffort {
  name: string;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  start_index: number;
  end_index: number;
  pr_rank?: number | null;
}

export interface ActivityDetail extends Activity {
  description?: string | null;
  device_name?: string;
  total_photo_count?: number;
  splits_metric?: Split[];
  laps?: Lap[];
  best_efforts?: BestEffort[];
  segment_efforts?: SegmentEffort[];
  gear?: {
    id: string; name: string; distance?: number; brand_name?: string; model_name?: string; frame_type?: number;
  } | null;
}

// Serie secondo per secondo, una per chiave richiesta; manca quella che l'attività non ha.
export type StreamKey = 'time' | 'heartrate' | 'watts' | 'cadence' | 'velocity_smooth'
  | 'altitude' | 'distance' | 'temp' | 'grade_smooth';
export type Streams = Partial<Record<StreamKey, { data: number[] }>>;
