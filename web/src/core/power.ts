// Curva di potenza (miglior watt per fascia di durata) e profilo di potenza: punti
// deboli e forti rispetto ai valori di riferimento.

import type { Activity } from './strava-types.ts';

export interface PowerBucket {
  label: string;
  min: number;
  max: number;
  best?: { watts: number; act: Activity };
}

// ---- Power Duration Curve ----
export function buildPowerCurve(activities: Activity[], weightKg: number | null | undefined) {
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const withPower = bikes.filter(a => a.weighted_average_watts || a.average_watts);
  if (!withPower.length) return null;
  const buckets: PowerBucket[] = [
    { label: '< 5 min', min: 0, max: 5*60 },
    { label: '5–15 min', min: 5*60, max: 15*60 },
    { label: '15–30 min', min: 15*60, max: 30*60 },
    { label: '30–60 min', min: 30*60, max: 60*60 },
    { label: '60–120 min', min: 60*60, max: 120*60 },
    { label: '> 2h', min: 120*60, max: Infinity },
  ];
  buckets.forEach(b => {
    const hits = withPower.filter(a => (a.moving_time||0) >= b.min && (a.moving_time||0) < b.max);
    if (!hits.length) return;
    const best = hits.reduce<{ watts: number; act: Activity } | null>((x, a) => {
      const w = a.weighted_average_watts || a.average_watts || 0;
      return w > (x?.watts || 0) ? { watts: w, act: a } : x;
    }, null);
    if (best) b.best = best;
  });
  const ref = buckets.find(b => b.label === '30–60 min')?.best?.watts
    || buckets.find(b => b.label === '60–120 min')?.best?.watts;
  const ftp = ref ? Math.round(ref * 0.95) : null;
  const wPerKg = (ftp && weightKg) ? (ftp/weightKg).toFixed(2) : null;
  return { buckets, ftp, wPerKg };
}

interface ProfilePoint {
  watts: number;
  wkg: number;
  pctOfRef: number;
  label: string;
}
interface Deficit {
  area: string;
  label: string;
  description: string;
  prescription: string;
  severity: 'high' | 'medium' | 'low';
}

// ---- Power Profile Analysis: identifica deficit e punti di forza ----
// Confronta la power curve dell'atleta con curve di riferimento (De Pauw et al. 2013)
// e identifica dove l'atleta è più debole/forte relativamente al proprio livello.
// Restituisce raccomandazioni specifiche per tipo di lavoro da fare.
export function buildPowerProfile(activities: Activity[], weightKg: number | null | undefined) {
  const pc = buildPowerCurve(activities, weightKg);
  if (!pc || !weightKg) return null;

  // Referenze W/kg per livello "recreational trained" (De Pauw 2013, semplificato)
  // Sprint (5s), Anaerobic (1min), VO2max (5min), Threshold (20min), Endurance (60min)
  const refBuckets: Record<string, { duration: string; refWkg: number }> = {
    '< 5 min': { duration: 'sprint_anaerobic', refWkg: 6.5 },
    '5–15 min': { duration: 'vo2max', refWkg: 4.0 },
    '15–30 min': { duration: 'sub_threshold', refWkg: 3.5 },
    '30–60 min': { duration: 'threshold', refWkg: 3.2 },
    '60–120 min': { duration: 'endurance', refWkg: 2.8 },
    '> 2h': { duration: 'long_endurance', refWkg: 2.5 },
  };

  const profile: Record<string, ProfilePoint> = {};
  let hasData = false;

  for (const b of pc.buckets) {
    if (!b.best) continue;
    hasData = true;
    const ref = refBuckets[b.label];
    if (!ref) continue;
    const wkg = b.best.watts / weightKg;
    const pctOfRef = wkg / ref.refWkg;
    profile[ref.duration] = {
      watts: b.best.watts,
      wkg: +wkg.toFixed(2),
      pctOfRef: +pctOfRef.toFixed(2),
      label: b.label,
    };
  }

  if (!hasData) return null;

  // Calcola ratios chiave per identificare deficit
  const ratios: { vo2_to_threshold?: number; threshold_to_endurance?: number; sprint_to_vo2?: number } = {};
  const vo2 = profile.vo2max;
  const threshold = profile.threshold || profile.sub_threshold;
  const sprint = profile.sprint_anaerobic;
  const endurance = profile.endurance || profile.long_endurance;

  if (vo2 && threshold) {
    // Rapporto VO2/Soglia: se basso → VO2 debole
    ratios.vo2_to_threshold = +(vo2.wkg / threshold.wkg).toFixed(2);
  }
  if (threshold && endurance) {
    // Rapporto Soglia/Endurance: se basso → soglia debole rispetto a base
    ratios.threshold_to_endurance = +(threshold.wkg / endurance.wkg).toFixed(2);
  }
  if (sprint && vo2) {
    ratios.sprint_to_vo2 = +(sprint.wkg / vo2.wkg).toFixed(2);
  }

  // Identifica deficit e genera raccomandazioni
  const deficits: Deficit[] = [];
  const strengths: { area: string; label: string }[] = [];

  if (ratios.vo2_to_threshold && ratios.vo2_to_threshold < 1.15) {
    deficits.push({
      area: 'vo2max',
      label: 'VO2max',
      description: 'La tua potenza a 5 min è bassa rispetto alla soglia. Il "tetto" aerobico limita la crescita FTP.',
      prescription: 'Priorità: sessioni VO2max (Seiler 4×4, 4×8, Rønnestad 30/15). 2 sessioni/settimana per 4-6 settimane.',
      severity: ratios.vo2_to_threshold < 1.08 ? 'high' : 'medium',
    });
  } else if (ratios.vo2_to_threshold && ratios.vo2_to_threshold > 1.35) {
    strengths.push({ area: 'vo2max', label: 'VO2max alto relativo alla soglia' });
    deficits.push({
      area: 'threshold',
      label: 'Soglia/FTP',
      description: 'Hai un buon VO2max ma la soglia non lo sfrutta. C\'è margine per alzare FTP senza toccare il VO2.',
      prescription: 'Priorità: Sweet Spot 3×20 e Over-Unders. Lavoro specifico di soglia per 4-6 settimane.',
      severity: 'medium',
    });
  }

  if (ratios.threshold_to_endurance && ratios.threshold_to_endurance < 1.08) {
    deficits.push({
      area: 'endurance',
      label: 'Resistenza/Base aerobica',
      description: 'La potenza su uscite >1h cala poco rispetto alla soglia — ma è troppo bassa in assoluto. Serve volume.',
      prescription: 'Priorità: uscite lunghe Z2 (2.5-4h) e fondo medio. Costruisci base prima di intensità.',
      severity: 'medium',
    });
  }

  // C'è solo con sprint e VO2max.
  const sprintToVo2 = ratios.sprint_to_vo2;
  if (sprintToVo2 !== undefined && sprintToVo2 < 1.4) {
    deficits.push({
      area: 'neuromuscular',
      label: 'Potenza neuromuscolare/Sprint',
      description: 'Potenza massima bassa — limita scatti, partenze e capacità di rispondere agli attacchi.',
      prescription: 'Aggiungi: sprint da fermo, partenze forza, e lavoro in palestra su esplosività.',
      severity: 'low',
    });
  } else if (sprintToVo2 !== undefined && sprintToVo2 > 2.0) {
    strengths.push({ area: 'neuromuscular', label: 'Sprint/Potenza forte' });
  }

  // Calcola il deficit primario (quello che darà più guadagno se corretto)
  const sev = { high: 3, medium: 2, low: 1 };
  const primaryDeficit = deficits.sort((a, b) => sev[b.severity] - sev[a.severity])[0] || null;

  return {
    profile,
    ratios,
    deficits,
    strengths,
    primaryDeficit,
    // Tipo di blocco consigliato basato su deficit
    recommendedFocus: primaryDeficit?.area || 'threshold',
  };
}
