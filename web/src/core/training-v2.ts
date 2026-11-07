// ============================================================================
// TRAINING V2 — Workout catalog evidence-based
// Fonti principali:
//  • Seiler et al. (2013) — 4×8' @ 90% VO2max: +16% FTP, +10% VO2max in 7 sett.
//  • Seiler 4×4' — VO2max intensity (gold standard HIIT)
//  • Rønnestad et al. (2014) — Block periodization HIT (5 sessioni prima sett + LIT)
//  • Rønnestad 30/15s — 6×(30s@105%VO2 / 15s@50%VO2) × 3 set: più stimolo VO2 con meno fatica percepita
//  • Coggan/Allen — Power Zones classici (Z1-Z7 % FTP)
//  • Hunter Allen — Over-Unders (lactate clearance)
//  • Tabata 8×(20/10) — anaerobic + VO2
//
// Scelte del catalogo:
//  1) Intervalli principali basati su studi pubblicati (non su "senso comune coaching")
//  2) Parametri precisi in % FTP (se disponibile) invece di FC soglia
//  3) Variazione protocolli nella rotazione (non solo SST/Soglia/VO2 generici)
//  4) Strength Rønnestad-style (heavy 4-10 reps) quando gym disponibile
//  5) Long ride con "ride-at-the-end" per fatigue resistance
// ============================================================================

import { MESO_BLOCKS } from './meso.ts';
import type { Mesocycle } from './meso.ts';
import type { Settings } from './settings.ts';

interface CapacityTier {
  tier: string;
  label: string;
  reps: number;
  durMin: number;
  longMin: number;
  maxHards: number;
  tid: string;
}

// Un workout proposto: titolo, descrizione, motivo e studio di riferimento.
export interface Workout {
  title: string;
  detail: string;
  reason: string;
  source: string | null;
}

// Soglia e FTP con cui il workout indica frequenza cardiaca e watt.
interface WorkoutAthlete {
  hrLthr?: number | null;
  ftp?: number | null;
}

// Stato di forma (fitness CTL, freschezza TSB) che scala volume e protocollo.
interface FormState {
  ctl?: number;
  tsb?: number;
}

// Calcola un "capacity tier" basato su volume + CTL.
// Determina variante intervalli (reps, durata) e protocolli disponibili.
export function v2_capacityTier(settings: Pick<Settings, 'weeklyHours'> | null | undefined, formCtx: FormState | null | undefined): CapacityTier {
  const wk = settings?.weeklyHours || 6;
  const ctl = formCtx?.ctl || 0;
  // Combina le due informazioni in uno score: più ore dichiarate + più CTL = tier più alto
  // Score = weeklyHours + ctl/20 (un CTL di 80 vale +4h di tolleranza)
  const score = wk + ctl / 20;
  if (score < 6) return { tier: 'low', label: 'Low volume', reps: 3, durMin: 150, longMin: 90, maxHards: 1, tid: 'threshold' };
  if (score < 9) return { tier: 'mid', label: 'Mid volume', reps: 4, durMin: 180, longMin: 135, maxHards: 2, tid: 'pyramidal' };
  if (score < 13) return { tier: 'high', label: 'High volume', reps: 5, durMin: 210, longMin: 165, maxHards: 3, tid: 'polarized' };
  return { tier: 'elite', label: 'Elite volume', reps: 6, durMin: 240, longMin: 210, maxHards: 4, tid: 'polarized' };
}

// `meso` è il mesociclo salvato: nel blocco in corso cambia il protocollo delle sessioni HARD.
export function v2_workoutForCategory(
  cat: string, settings: Settings | null | undefined, profile: WorkoutAthlete | null | undefined, hardIndex = 0,
  formCtx: FormState | null = null, isRecoveryWeek = false, totalHardsInWeek = 2, meso: Pick<Mesocycle, 'blockId'> | null = null,
): Workout {
  const { hrLthr, ftp } = profile || {};
  const hrz = (pct: number) => hrLthr ? ` (FC ~${Math.round(hrLthr*pct)} bpm)` : '';
  const pwz = (pct: number) => ftp ? ` (${Math.round(ftp*pct)} W)` : '';
  const tsb = formCtx?.tsb || 0;
  const tier = v2_capacityTier(settings, formCtx);
  const volMul = isRecoveryWeek ? 0.6 : tsb < -30 ? 0.75 : tsb < -15 ? 0.88 : 1;
  const rcv = isRecoveryWeek ? ' · scarico' : '';
  const formNote = tsb < -20 ? ` · TSB ${tsb.toFixed(0)} (stanco, volume -25%)`
    : tsb > 10 ? ` · TSB +${tsb.toFixed(0)} (fresco, massima qualità)` : '';
  // Recovery tools: pressoterapia + massage gun. Agiscono su sistemi diversi (Dupuy 2018):
  // - Pressoterapia/IPC = drenaggio venoso/linfatico, riduzione fluid accumulation
  //   (Hoffman 2016 su ultramarathoner; meta-analisi 2024). Effetto piccolo-moderato su DOMS.
  // - Massage gun (Theragun-style) = abbassa tono muscolare locale, riduce DOMS percepito
  //   2-3 punti a 24-72h (Frontiers 2025; review IJSPT 2023). Lavora su muscoli specifici.
  // Combinarli è additivo perché agiscono su meccanismi distinti, ma sommatorie esatte
  // non sono studiate direttamente.
  // CAVEAT: il massage gun NON va usato immediatamente prima di sprint/forza esplosiva
  // (depressione temporanea del pre-load neuromuscolare). Posticipato a fine giornata.
  const _toolLines = [];
  if (settings?.hasCompression) _toolLines.push(`💨 Pressoterapia 20–30 min sulle gambe (drenaggio venoso/linfatico, riduce gonfiore).`);
  if (settings?.hasMassageGun)  _toolLines.push(`🔨 Massage gun 5–10 min sui gruppi principali (quadricipiti, polpacci, glutei): riduce DOMS e tono muscolare. NON usarlo nelle 2h pre-workout duro.`);
  const pressoNote = _toolLines.length ? `\n${_toolLines.join('\n')}` : '';

  if (cat === 'SKIP') return {
    title: '⏸️ Riposo pianificato',
    detail: 'Giorno marcato come stop.',
    reason: 'Rispetto la tua scelta.',
    source: null,
  };
  if (cat === 'REST') return {
    title: '😴 Riposo',
    detail: 'Mobilità leggera / stretching opzionale. Sonno, idratazione, nutrienti.' + pressoNote,
    reason: 'Recupero = adattamento. Il fitness cresce durante il riposo, non durante l\'allenamento.',
    source: 'Seiler, Bouchard (2013)',
  };
  if (cat === 'REST_RAIN') return {
    title: '😴 Riposo (pioggia)',
    detail: 'Z1 scarico saltato per pioggia → riposo totale.' + pressoNote,
    reason: 'Regola: scarico + pioggia = off.',
    source: null,
  };
  if (cat === 'MOBILITY') return {
    title: '🧘 Mobilità + core',
    detail: `25-35 min leggeri. Mobilità anche (90/90 rotation, hip flexor stretch), foam rolling, core statico (plank 3×30", dead bug 2×10/lato), respirazione diaframmatica.` + pressoNote,
    reason: 'Previene squilibri muscolari e migliora postura sulla bici.',
    source: 'Rønnestad & Mujika (2014) — flexibility/recovery',
  };
  if (cat === 'STRENGTH') {
    const lvl = (settings?.strengthLevel) || 2;
    const circuits = v2_strengthCircuits(lvl);
    return {
      title: `💪 Forza corpo libero — Livello ${lvl}`,
      detail: circuits,
      // Onesto: il bodyweight NON produce gli adattamenti documentati negli studi di
      // Rønnestad/Hansen, che richiedono carichi esterni 80-90% 1RM su squat/leg press.
      // È comunque utile come stimolo di forza generale + stabilità del core.
      reason: `Bodyweight strength = stimolo di forza generale + core/stabilità per la postura sulla bici. Per la **forza pedalata-specifica** documentata negli studi (Hansen 2012, Rønnestad 2017: +3-7% efficienza, +TT power), serve heavy lifting in palestra (squat/leg press 4-10 reps @ 80-90% 1RM × 2/sett). Senza palestra, **il vero stimolo di forza arriva con i torque interval in bici** (vedi categoria STRENGTH_BIKE).`,
      source: 'Bodyweight progression — letteratura limitata; per heavy strength vedi Hansen 2012 / Rønnestad 2017',
    };
  }
  if (cat === 'STRENGTH_BIKE') {
    // Torque-on-bike: il sostituto efficace dell'heavy lifting per chi non ha palestra.
    // Reclutamento fibre veloci ad alta forza/basso stress cardio. Documentato come
    // proxy delle adattamenti di efficienza pedalata.
    const baseReps = tier?.tier === 'elite' ? 10 : tier?.tier === 'high' ? 8 : 6;
    const reps = Math.max(4, Math.round(baseReps * volMul));
    return {
      title: '💪 Forza in bici — Torque intervals' + rcv,
      detail: `Riscaldamento 20'.\n
${reps}×[2' @ 50-60 rpm in salita media${pwz(0.85)}, fuori sella OK / 3' recupero spinning fluido in pianura].\n
Resta nei watt — non vuoi salire troppo di cardio. Sensazione: muscoli che lavorano in lunghezza, respiro contenuto.\n
Defat 10'. Totale ~${30 + reps*5} min.\n
Focus tecnico: cadenza 50-60 rpm, postura stabile, evita di rimbalzare sulla sella.`,
      reason: `Torque-on-bike = il modo più pratico di sviluppare forza-specifica per chi non ha palestra. A basso RPM con carico alto reclutamento fibre veloci e produzione di forza per pedalata aumentano senza affaticare il sistema aerobico (puoi farlo anche quando TSB è basso). Effetti documentati su economia di pedalata e potenza alle alte cadenze.`,
      source: 'Theurel 2012; Sunde 2010 — heavy-load cycling intervals',
    };
  }
  if (cat === 'RECOVERY') return {
    title: '🟢 Recupero attivo Z1',
    detail: `${isRecoveryWeek ? 30 : 45}–60 min in Z1${hrz(0.70)}${pwz(0.55)}. Cadenza libera, gambe sciolte, niente sforzi.` + pressoNote,
    reason: 'Z1 sotto 55% FTP: active recovery aumenta il flusso ematico senza aggiungere fatica, accelera la rimozione di metaboliti.',
    source: 'Coggan & Allen, Training and Racing with a Power Meter (2010)',
  };
  if (cat === 'LONG') {
    // Durata target: parte dal massimo dichiarato dall'utente (settings.longRideMaxMin),
    // poi viene scalata da forma e recovery week. Default 180 min se non configurato.
    const userMax = Number(settings?.longRideMaxMin) || 180;
    const base = isRecoveryWeek ? Math.min(90, userMax)
              : tsb < -15 ? Math.min(90, userMax)
              : tsb > 10 ? userMax
              : Math.max(Math.round(userMax * 0.85), 120);
    return {
      title: '🟠 Long ride Z2 + "ride-at-the-end"' + rcv,
      detail: `${base} min in Z2${hrz(0.80)}${pwz(0.70)} (65-75% FTP). Costante, tank basso → impara a pedalare in deficit glucogeno.
${!isRecoveryWeek ? `\nULTIMI 30 MIN: 3×5' @ 95% FTP${pwz(0.95)} rec 3' — stimolo neuromuscolare su gambe già cariche (fatigue resistance training).` : ''}
Nutrizione: 60-90g CHO/h con carichi alti, acqua+sali 500ml/h.${pressoNote ? '\nA fine giro:' + pressoNote : ''}`,
      reason: `Z2 esteso massimizza adattamenti mitocondriali e capillarizzazione. "Ride-at-the-end" (intervalli hard quando già stanco) simula le ultime parti di gara/granfondo e migliora resistenza alla fatica a intensità alta. Tetto utente: ${userMax} min.`,
      source: 'Laursen & Jenkins (2002); Rønnestad et al. (fatigue resistance)',
    };
  }

  if (cat === 'HARD') {
    // Mesocycle-aware protocol selection
    const mesoBlock = meso ? MESO_BLOCKS.find(b => b.id === meso.blockId) : null;
    const mesoFocus = mesoBlock?.focus;

    // Ordine intelligente: 1° = aerobico preparatorio, 2° = forza/potenza, 3° = VO2
    let protocol;
    if (totalHardsInWeek >= 3) {
      protocol = ['aerobic_capacity', 'strength_sprints', 'vo2_8min'][hardIndex] || 'aerobic_capacity';
    } else if (totalHardsInWeek === 2) {
      protocol = ['aerobic_capacity', 'vo2_8min'][hardIndex] || 'aerobic_capacity';
    } else {
      protocol = tsb > 10 ? 'vo2_4min' : 'aerobic_capacity';
    }

    // Mesocycle override: se c'è un focus attivo, adatta i protocolli
    if (mesoFocus === 'vo2max' && protocol === 'aerobic_capacity' && hardIndex > 0) {
      protocol = 'vo2_8min'; // nel blocco VO2max, più sessioni VO2
    } else if (mesoFocus === 'threshold' && protocol === 'vo2_8min') {
      protocol = 'aerobic_capacity'; // nel blocco soglia, più SST/threshold
    } else if (mesoFocus === 'endurance' && protocol === 'vo2_8min') {
      protocol = 'aerobic_capacity'; // nel blocco base, SST prevale
    }

    // Alterna Seiler 4×8 / 4×4 / Rønnestad 30/15 / Over-unders / Sweet Spot long in cicli di 5 hard
    if (protocol === 'vo2_8min') {
      // Low volume: solo SST e 4×8 conservativi. Mid: aggiungi Over-Under. High/Elite: tutta la rotazione.
      const variantsByTier: Record<string, string[]> = {
        low: ['sst_3x20', 'seiler_4x8'],
        mid: ['seiler_4x8', 'over_unders', 'sst_3x20'],
        high: ['seiler_4x8', 'ronnestad_30_15', 'seiler_4x4', 'over_unders', 'sst_3x20'],
        elite: ['seiler_4x8', 'ronnestad_30_15', 'seiler_4x4', 'over_unders', 'sst_3x20'],
      };
      const variants = variantsByTier[tier.tier] || variantsByTier.mid;
      const picked = variants[hardIndex % variants.length];
      return v2_vo2Workout(picked, profile, volMul, rcv, formNote, tier, pressoNote);
    }
    if (protocol === 'vo2_4min') return v2_vo2Workout('seiler_4x4', profile, volMul, rcv, formNote, tier, pressoNote);
    if (protocol === 'strength_sprints') return v2_strengthSprintsWorkout(profile, volMul, rcv, formNote, tier, pressoNote);
    return v2_aerobicCapacityWorkout(profile, volMul, rcv, formNote, tier, pressoNote);
  }
  if (cat === 'EASY') {
    const dur = isRecoveryWeek ? '45-60 min' : tsb < -10 ? '60-75 min' : '75-100 min';
    return {
      title: '🟡 Fondo Z2' + rcv,
      detail: `${dur} in Z2${hrz(0.78)}${pwz(0.68)} (60-75% FTP). Cadenza 85-95, parla senza affanno. ${!isRecoveryWeek && hardIndex%3===1 ? "\nEmbedded: 6×15\" cadenza 110+rpm rec 45\" (fluidità neuromuscolare)." : ''}`,
      reason: 'Z2 = il volume "invisibile" che fa il 80% del lavoro nel polarized. Sviluppa mitocondri, efficienza lipidica, rete capillare. Serve tempo, non intensità.',
      source: 'Seiler (2010) 80/20 rule',
    };
  }
  return { title: '—', detail: '', reason: '', source: null };
}

export function v2_aerobicCapacityWorkout(
  profile: WorkoutAthlete | null | undefined, volMul: number, rcv: string, formNote: string, tier: CapacityTier | null | undefined, pressoNote = '',
): Workout {
  const { hrLthr, ftp } = profile || {};
  const pwz = (pct: number) => ftp ? ` (${Math.round(ftp*pct)} W)` : '';
  const hrz = (pct: number) => hrLthr ? ` (FC ~${Math.round(hrLthr*pct)} bpm)` : '';
  const baseReps = tier ? Math.max(2, tier.reps - 1) : 3;
  const reps = Math.max(2, Math.round(baseReps * volMul));
  return {
    title: '🔴 Capacità Aerobica (Sweet Spot + Threshold progressivo)' + rcv,
    detail: `Riscaldamento 15'.\n
Blocco principale: ${reps}×10' @ 88-93% FTP${pwz(0.90)}${hrz(0.90)}, rec 3' tra serie.\n
Finale: 10' in progressione — inizia 70% FTP${pwz(0.70)} e sali 5% ogni 2 min. Ultimi 2 min @ 100% FTP${pwz(1.0)}.\n
Defaticamento 10'. Totale ~${35 + reps*13} min.${pressoNote}`,
    reason: 'Sweet Spot 88-93% FTP = zona di massimo ritorno per stimolo/fatica. Il blocco progressivo finale simula la chiusura di un giro/gara con gambe cariche.',
    source: 'Coggan/Allen (Sweet Spot); FasCat Coaching' + formNote,
  };
}

// Senza watt né frequenze: `_profile` resta per avere gli stessi argomenti degli altri workout.
export function v2_strengthSprintsWorkout(
  _profile: WorkoutAthlete | null | undefined, volMul: number, rcv: string, formNote: string, tier: CapacityTier | null | undefined, pressoNote = '',
): Workout {
  const baseReps = tier?.tier === 'elite' ? 8 : tier?.tier === 'high' ? 7 : 6;
  const reps = Math.max(4, Math.round(baseReps * volMul));
  return {
    title: '🔴 Forza neuromuscolare (torque + sprint)' + rcv,
    detail: `Riscaldamento 20' con 3×1' progressioni fino a 90% FTP.\n
BLOCCO A — Torque intervals (forza): ${reps}×[30" a 50-60 rpm in salita dura / 30" recupero spinning]. Rec 4' tra ripetizioni.\n
BLOCCO B — Sprint da fermo: ${reps}×10" all-out da velocità 20 km/h. Rec completo 3'.\n
Defat 10'. Totale ~${50 + reps*2} min.\n
Focus: ogni sprint deve essere tecnico — prima pedalata a piena forza, busto stabile.${pressoNote}`,
    reason: 'Torque + sprint sviluppano reclutamento fibre veloci e RFD (rate of force development). I torque-on-bike sono il sostituto migliore del heavy-lifting per chi non ha palestra: forza-specifica a basso stress cardio.',
    source: 'Theurel 2012, Sunde 2010 (heavy-load cycling); per heavy-lifting in palestra vedi Hansen 2012 / Rønnestad 2017' + formNote,
  };
}

export function v2_vo2Workout(
  variant: string, profile: WorkoutAthlete | null | undefined, volMul: number, rcv: string, formNote: string,
  tier: CapacityTier | null | undefined, pressoNote = '',
): Workout {
  const { hrLthr, ftp } = profile || {};
  const pwz = (pct: number) => ftp ? ` (${Math.round(ftp*pct)} W)` : '';
  const hrz = (pct: number) => hrLthr ? ` (FC ~${Math.round(hrLthr*pct)} bpm)` : '';
  const tierReps = tier?.reps || 4;
  switch (variant) {
    case 'seiler_4x8': {
      const reps = Math.max(3, Math.round(tierReps * volMul));
      return {
        title: `🔴 Seiler ${reps}×8' (VO2/FTP hybrid)` + rcv,
        detail: `Riscaldamento 15-20'.\n
${reps}×8' @ 90% VO2max = ~105-110% FTP${pwz(1.07)}${hrz(0.97)}, rec 2' tra intervalli.\n
REGOLA D'ORO: la potenza del 1° intervallo DEVE essere sostenibile per tutti e ${reps}. Se cedi nel ${reps}° hai partito troppo forte. Meglio partire cauti e crescere.\n
Defat 10'. Totale ~${35 + reps*10} min.${pressoNote}`,
        reason: 'Protocollo scientifico di Seiler (2013): in 7 settimane con 2 sessioni/sett ha prodotto +16% FTP e +10% VO2max in ciclisti ricreativi. Gold standard della letteratura.',
        source: 'Seiler et al. (2013); Fast Talk Labs execution guide' + formNote,
      };
    }
    case 'seiler_4x4': {
      const reps = Math.max(4, Math.round((tierReps + 1) * volMul));
      return {
        title: `🔴 Seiler ${reps}×4' (VO2max)` + rcv,
        detail: `Riscaldamento 20' incluso 2×1' progressivi.\n
${reps}×4' @ 115-120% FTP${pwz(1.17)}${hrz(1.03)} = sforzo "respirare bocca aperta, non puoi parlare". Rec 3' tra intervalli.\n
Stessa regola: wattaggio del 1° = wattaggio dell'ultimo.\n
Defat 10'. Totale ~${35 + reps*7} min.${pressoNote}`,
        reason: 'Variante Seiler a intensità più alta del 4×8. Più specifico per VO2max puro, meno tempo totale ma stress cardiopolmonare massimo.',
        source: 'Seiler et al. studies on HIT protocols' + formNote,
      };
    }
    case 'ronnestad_30_15': {
      const sets = isReducedVolume(volMul) ? 2 : 3;
      return {
        title: `🔴 Rønnestad 30/15s (VO2 micro)` + rcv,
        detail: `Riscaldamento 20'.\n
${sets}×[12×(30" @ 100-105% VO2max${pwz(1.13)} / 15" easy ${pwz(0.6)})], rec 3-4' Z1 tra set.\n
Totale tempo "on": ${sets*12*0.5} min di lavoro puro. Volume VO2 massimo con percezione di sforzo RIDOTTA vs 4×4.\n
Defat 10'. Totale ~${40 + sets*9} min.${pressoNote}`,
        reason: 'Rønnestad et al. (2020): micro-intervalli 30/15s accumulano più tempo a VO2max con fatica percepita minore rispetto a intervalli lunghi. Studi mostrano +VO2max e +FTP superiori a protocolli tradizionali in ciclisti allenati.',
        source: 'Rønnestad et al. (2020) — Scand J Med Sci Sports' + formNote,
      };
    }
    case 'over_unders': {
      const baseBlocks = tier?.tier === 'elite' ? 4 : tier?.tier === 'high' ? 3 : 2;
      const blocks = Math.max(2, Math.round(baseBlocks * volMul));
      return {
        title: `🔴 Over-Unders ${blocks} blocchi (Hunter Allen)` + rcv,
        detail: `Riscaldamento 15'.\n
${blocks}×[(2' @ 105% FTP${pwz(1.05)} + 2' @ 95% FTP${pwz(0.95)})×3 continuo], rec 5' tra blocchi.\n
Totale "on" per blocco: 12 min continui alternando sopra/sotto soglia.\n
Defat 10'. Totale ~${25 + blocks*17} min.${pressoNote}`,
        reason: 'Over-Unders allenano la capacità di "ripulire" lattato mentre si continua a spingere — specifico per passaggi duri in gruppo/salite miste. Hunter Allen li prescrive come key session nelle 4-6 settimane pre-evento.',
        source: 'Hunter Allen & Andrew Coggan — Training and Racing with a Power Meter' + formNote,
      };
    }
    case 'sst_3x20': {
      const dur = volMul >= 1 ? 20 : 15;
      return {
        title: `🔴 Sweet Spot 3×${dur}' (FTP durability)` + rcv,
        detail: `Riscaldamento 15'.\n
3×${dur}' @ 88-93% FTP${pwz(0.90)}${hrz(0.90)}, rec 5' tra ripetute in Z1.\n
Focus su cadenza 85-95, postura stabile, respiro controllato. È un lavoro "noioso" ma il più efficace per estendere la durata sostenibile a FTP.\n
Defat 10'. Totale ~${30 + 3*(dur+5)} min.${pressoNote}`,
        reason: 'Sweet Spot lungo estende il TTE (Time To Exhaustion) a soglia — critico per granfondo e cronometro. Fa crescere la FTP indirettamente aumentando la "sostenibilità".',
        source: 'FasCat Coaching; TrainingPeaks FTP durability' + formNote,
      };
    }
  }
  return { title: '—', detail: '', reason: '', source: null };
}

// Vero quando il volume è scalato (scarico OR forte fatica): governa l'ulteriore
// riduzione di reps/sets nei workout VO2. Nome distinto dal parametro `isRecoveryWeek`
// di v2_workoutForCategory per evitare confusione di scope.
export function isReducedVolume(volMul: number): boolean { return volMul < 0.8; }

export function v2_strengthCircuits(level: number | null | undefined): string {
  if (level === 1) {
    return `CIRCUITO BASE × 2 giri (rec 60" tra es., 3' tra giri):
1. Squat lenti 4" discesa × 15
2. Affondi alternati × 10/gamba
3. Bulgarian split squat × 8/lato
4. Ponte glutei × 20
5. Calf raise × 20
6. Push-up × 12-20
7. Plank 45"
8. Plank laterale 30"/lato
9. Dead bug × 12/lato
10. Wall sit 60"

Progressione verso livello 2 quando completi tutto senza cedimenti.`;
  }
  if (level === 2) {
    return `CIRCUITO INTERMEDIO × 3 giri (Rønnestad-style — carichi pesanti equivalenti):
1. Squat lenti 4-2-1 tempo × 15-20 (o squat con zaino pesante × 10)
2. Affondi camminati × 12/gamba, lenti controllati
3. Bulgarian split squat × 12/lato (con peso se disponibile)
4. Ponte 1-gamba × 12/lato con pausa 2" in alto
5. Calf raise 1-gamba × 15/lato lento
6. Push-up × 18-25 (o archer push-up × 10/lato)
7. Plank con leg raise alternato × 10/gamba
8. Plank laterale con dip × 12/lato
9. Dead bug × 15/lato
10. Wall sit 90"`;
  }
  return `CIRCUITO AVANZATO × 3 giri + blocco potenza (Rønnestad max-strength):
CIRCUITO FORZA:
1. Pistol squat × 8/lato (o squat 4-2-1 × 25)
2. Affondi con salto alternato × 10/gamba
3. Bulgarian split squat + salto × 10/lato
4. Ponte 1-gamba con pausa 2" × 15/lato
5. Calf raise 1-gamba lento × 20/lato
6. Archer push-up × 12-15
7. Plank tocco spalla × 20 tot
8. Plank laterale rotazione × 12/lato
9. Hollow body 3×30"
10. Wall sit 90-120" con peso

BLOCCO POTENZA ESPLOSIVA (5 min):
11. Squat jump × 10 (rec 45")
12. Burpee × 8
13. Broad jump × 6
14. Mountain climber 30"

Note: Rønnestad mostra che la forza pesante (4-10 reps al 85-90% 1RM) 2×/sett per 12+ sett produce miglioramenti in efficienza pedalata di ~3-7%.`;
}
