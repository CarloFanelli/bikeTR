// Periodizzazione: i blocchi del mesociclo, il ruolo di ogni settimana nel blocco, il taper
// prima della gara, il passaggio al blocco successivo e la risposta dell'atleta al blocco.

import type { FormTrend } from './form.ts';
import { isoDay } from './format.ts';
import { buildPowerProfile } from './power.ts';
import type { Activity } from './strava-types.ts';

// Un blocco finito, nello storico del mesociclo.
interface MesoBlockRecord {
  blockId: string;
  startDate: string;
  endDate: string;
  weeks: number;
}

// Il mesociclo salvato nel browser.
export interface Mesocycle {
  startDate: string;
  blockIndex: number;
  blockId: string;
  weekInBlock: number;
  blockHistory: MesoBlockRecord[];
  // Gli ultimi 20 punti FTP (vedi withFtpPoint).
  ftpHistory: { date: string; ftp: number }[];
}

interface MesoBlock {
  id: string;
  label: string;
  weeks: number;
  focus: string;
  phases: number[];
  pattern: string;
  description: string;
}

// Il ruolo di una settimana: nel blocco del mesociclo o nel taper prima della gara.
export interface WeekRole {
  role: string;
  loadMul: number;
  hardOverride: number | null;
  weekInBlock: number;
  totalWeeks: number;
  blockId: string;
  blockLabel: string;
  blockPattern: string;
  // Fase del workout HARD (0/1/2) nel blocco; nel taper il nome della fase.
  phase: number | string;
  isDeload: boolean;
  label: string;
  daysToRace?: number;
}

// ---- Periodizzazione Mesociclica ----
// Onda 3:1 dentro ogni blocco — 4 settimane: 3 di build progressivo + 1 di deload.
// Pattern classico Coggan/Friel/Issurin (raccomandato anche da Seiler systematic review 2023).
//   week 0 — build1: carico base del blocco
//   week 1 — build2: carico +8% (volume cresce)
//   week 2 — peak: carico +15% rispetto a build1 (massima qualità della fase)
//   week 3 — deload: 65% del peak, intensità mantenuta ma volume tagliato a metà
// Le 4 fasi `phases` controllano il tipo di workout HARD per settimana del blocco
// (es. base = solo SST; threshold cresce SST→Soglia→Potenza→SST scarico).

interface WeekPattern {
  loadMul: number[];
  roles: string[];
  hardOverride: (number | null)[];
}

// Moltiplicatori di volume/intensità per settimana del blocco.
// Pattern 'wave' = 3:1 classico (Coggan/Friel). Pattern 'block' = Rønnestad 2014.
const WAVE_PATTERN: WeekPattern = {
  loadMul: [1.00, 1.08, 1.15, 0.65],
  roles:   ['build1', 'build2', 'peak', 'deload'],
  // Hard sessions override (null = usa calcolo standard di buildWeekPlan).
  hardOverride: [null, null, null, null],
};
const BLOCK_PATTERN: WeekPattern = {
  // Rønnestad 2014: sett 1 carico HIT concentrato, 2-3 LIT/sostegno, 4 scarico.
  loadMul: [1.25, 0.75, 0.75, 0.60],
  roles:   ['block_load', 'block_lit1', 'block_lit2', 'deload'],
  // Sett 1: 5 sessioni HIT. Sett 2-3: max 2 HIT (preferibilmente 1). Sett 4: 1 HIT.
  hardOverride: [5, 1, 2, 1],
};
const BLOCK_WEEK_LABELS: Record<string, string> = {
  build1: 'Build 1 — carico base',
  build2: 'Build 2 — progressione',
  peak: 'Peak — massima qualità',
  deload: 'Scarico — consolidamento',
  block_load: 'Block — carico HIT concentrato',
  block_lit1: 'Block — recupero attivo (LIT 1)',
  block_lit2: 'Block — recupero attivo (LIT 2)',
};

// Blocchi disponibili: ogni blocco dura sempre 4 settimane (3 build + 1 deload).
// `phases` definisce il workout HARD prevalente per settimana del blocco (4 elementi).
// `pattern`: 'wave' (3:1 classico Coggan/Friel) o 'block' (Rønnestad 2014 — 5 HIT concentrato).
export const MESO_BLOCKS: MesoBlock[] = [
  {
    id: 'base', label: 'Base aerobica + Sweet Spot', weeks: 4,
    focus: 'endurance', phases: [0, 0, 1, 0], // SST → SST → Soglia → scarico SST
    pattern: 'wave',
    description: 'Costruzione volume Z2 e Sweet Spot. Poche sessioni intense, molto fondo.',
  },
  {
    id: 'threshold', label: 'Soglia + Over-Unders', weeks: 4,
    focus: 'threshold', phases: [0, 1, 2, 0], // SST → Soglia → Potenza → scarico SST
    pattern: 'wave',
    description: 'Lavoro specifico di soglia. Over-Unders e ripetute FTP per alzare la potenza sostenibile.',
  },
  {
    id: 'vo2max', label: 'VO2max + Potenza', weeks: 4,
    focus: 'vo2max', phases: [1, 2, 2, 0], // Soglia → VO2 → VO2 → scarico SST
    pattern: 'wave',
    description: 'Intervalli ad alta intensità: Seiler 4×8, 4×4, 30/15. Alza il tetto aerobico.',
  },
  {
    id: 'neuromuscular', label: 'Sprint + Forza', weeks: 4,
    focus: 'neuromuscular', phases: [0, 1, 2, 0], // base → forza → potenza → scarico
    pattern: 'wave',
    description: 'Partenze, sprint, forza neuromuscolare. Migliora potenza massima e reattività.',
  },
  {
    // Rønnestad et al. 2014 — Block periodization of HIT.
    // Settimana 1: 5 sessioni HIT concentrate (Lun/Mar/Mer/Gio/Ven) + 2 giorni LIT.
    // Settimane 2-3: solo LIT (Z2 prevalente, max 2 hard sostenuti). Settimana 4: deload.
    // Mostrato superiore al pattern distribuito in ciclisti già allenati (CTL > 70 raccomandato).
    id: 'ronnestad_block', label: 'Block periodization (Rønnestad 2014)', weeks: 4,
    focus: 'vo2max', phases: [2, 0, 0, 0], // sett 1 = VO2 concentrato, 2-3 = SST/LIT, 4 = scarico
    pattern: 'block',
    description: 'Pattern Rønnestad: settimana 1 con 5 sessioni HIT (VO2/soglia) + Z2, settimane 2-3 solo Z2/LIT a ricarica, settimana 4 deload. Raccomandato per atleti allenati (CTL ≥ 70).',
  },
];

const blockOf = (blockId: string) => MESO_BLOCKS.find(b => b.id === blockId);

// Taper Mujika (Mujika 2018): le 3 settimane prima della gara hanno volume -20/-40/-55%
// con intensità mantenuta. Hard sessions ridotte ma non eliminate (mantenere la
// "qualità" per evitare detraining).
//   Settimana -3 (15–21 giorni prima): taper1 — volume -20%, 2 HARD, durate -25%
//   Settimana -2 (8–14 giorni prima):  taper2 — volume -40%, 2 HARD, durate -40%
//   Settimana -1 (1–7 giorni prima):   taper3 — volume -55%, 1 HARD (opener),
//                                       lunghe corte, race-day off completo
// `raceDateIso` = stringa ISO 'YYYY-MM-DD'. `weekStartIso` = lunedì della settimana
// per cui calcoliamo il ruolo. Restituisce null se non in finestra taper.
export function getTaperPhase(raceDateIso: string | null | undefined, weekStartIso: string | null | undefined): WeekRole | null {
  if (!raceDateIso || !weekStartIso) return null;
  const race = new Date(raceDateIso); race.setHours(0,0,0,0);
  const monday = new Date(weekStartIso); monday.setHours(0,0,0,0);
  // Se la settimana è completamente dopo la gara, non più taper.
  if (monday > race) return null;
  // Giorni dal lunedì della settimana alla data gara.
  const daysToRaceFromMon = Math.round((race.getTime() - monday.getTime()) / 86400000);
  if (daysToRaceFromMon > 21) return null;
  let phase, loadMul, hardOverride, label;
  if (daysToRaceFromMon >= 15) { phase = 'taper1'; loadMul = 0.80; hardOverride = 2; label = 'Taper 1 — volume -20%, intensità ok'; }
  else if (daysToRaceFromMon >= 8) { phase = 'taper2'; loadMul = 0.60; hardOverride = 2; label = 'Taper 2 — volume -40%, mantieni qualità'; }
  else if (daysToRaceFromMon >= 1) { phase = 'taper3'; loadMul = 0.45; hardOverride = 1; label = 'Taper 3 — opener + recovery, gara questa settimana'; }
  else { phase = 'race_week'; loadMul = 0.30; hardOverride = 0; label = 'Settimana gara — riposo+opener'; }
  return {
    phase, loadMul, hardOverride,
    daysToRace: daysToRaceFromMon,
    label,
    role: phase, // riusato dal banner UI
    weekInBlock: 0, totalWeeks: 4, // placeholder per compatibilità banner
    blockId: 'taper', blockLabel: 'Taper Mujika',
    blockPattern: 'taper',
    isDeload: true, // taper si comporta come deload per isRecoveryWeek
  };
}

// Dato il mesociclo corrente (con weekInBlock 0..3) e un offset di settimane futuro
// (0 = settimana corrente, 1 = prossima, ecc.), calcola il ruolo della settimana
// nel blocco. Se l'offset supera la fine del blocco corrente, "rolla" sul blocco
// successivo (build1 di nuovo). Restituisce null se mesociclo non inizializzato.
export function getWeekRoleInBlock(
  meso: { blockId: string; weekInBlock?: number } | null | undefined, weekOffset = 0,
): WeekRole | null {
  if (!meso) return null;
  const block = blockOf(meso.blockId) || MESO_BLOCKS[0];
  const w = ((meso.weekInBlock || 0) + weekOffset) % block.weeks;
  const pattern = block.pattern === 'block' ? BLOCK_PATTERN : WAVE_PATTERN;
  const role = pattern.roles[w] || pattern.roles[0];
  return {
    role,
    loadMul: pattern.loadMul[w] ?? 1,
    hardOverride: pattern.hardOverride[w], // null = calcolo standard, num = forza N HARD
    weekInBlock: w,
    totalWeeks: block.weeks,
    blockId: block.id,
    blockLabel: block.label,
    blockPattern: block.pattern || 'wave',
    phase: block.phases[w],
    isDeload: role === 'deload',
    label: BLOCK_WEEK_LABELS[role] || '',
  };
}

// Il mesociclo di oggi a partire da quello salvato: alla prima apertura sceglie il blocco
// dal deficit del power profile, a blocco finito passa al successivo. `changed` dice se va
// salvato: in questi due casi e quando inizia una nuova settimana del blocco, così piano e
// banner leggono la settimana di oggi.
// Un mesociclo salvato senza storico dei blocchi fa lanciare un errore a fine blocco.
export function nextMesocycle(
  stored: Mesocycle | null, activities: Activity[], settings: { weight?: number } | null | undefined, now: Date,
): { meso: Mesocycle; changed: boolean } {
  const today = new Date(now);
  today.setHours(0,0,0,0);

  // Power profile per deficit-driven block selection
  const powerProfile = buildPowerProfile(activities.filter(a => a.type?.includes('Ride')), settings?.weight);

  if (!stored || !stored.startDate) {
    // Prima inizializzazione: scegli blocco in base al deficit
    const blockId = deficitToBlock(powerProfile?.recommendedFocus);
    return {
      meso: { startDate: isoDay(today), blockIndex: 0, blockId, weekInBlock: 0, blockHistory: [], ftpHistory: [] },
      changed: true,
    };
  }

  // Calcola settimana corrente del blocco
  const start = new Date(stored.startDate);
  start.setHours(0,0,0,0);
  const daysSinceStart = Math.round((today.getTime() - start.getTime()) / 86400000);
  const weeksSinceStart = Math.floor(daysSinceStart / 7);
  const currentBlock = blockOf(stored.blockId) || MESO_BLOCKS[0];

  if (weeksSinceStart >= currentBlock.weeks) {
    // Blocco completato → avanza al prossimo: segui la sequenza o adatta al deficit attuale
    const finished = { blockId: stored.blockId, startDate: stored.startDate, endDate: isoDay(today), weeks: weeksSinceStart };
    return {
      meso: {
        ...stored,
        blockHistory: [...stored.blockHistory, finished],
        blockIndex: stored.blockIndex + 1,
        blockId: chooseNextBlock(stored, powerProfile),
        startDate: isoDay(today),
        weekInBlock: 0,
      },
      changed: true,
    };
  }
  return { meso: { ...stored, weekInBlock: weeksSinceStart }, changed: stored.weekInBlock !== weeksSinceStart };
}

export function deficitToBlock(deficit: string | null | undefined): string {
  if (!deficit) return 'base';
  const map: Record<string, string> = {
    'vo2max': 'vo2max',
    'threshold': 'threshold',
    'neuromuscular': 'neuromuscular',
    'endurance': 'base',
  };
  return map[deficit] || 'base';
}

export function chooseNextBlock(
  meso: { blockId: string }, powerProfile: { primaryDeficit?: { area: string } | null } | null | undefined,
): string {
  // Se power profile identifica un deficit, prioritizza quello
  if (powerProfile?.primaryDeficit) {
    const deficitBlock = deficitToBlock(powerProfile.primaryDeficit.area);
    // Non ripetere lo stesso blocco due volte di fila
    if (deficitBlock !== meso.blockId) return deficitBlock;
  }

  // Sequenza naturale: base → threshold → vo2max → base (periodizzazione classica)
  const sequence = ['base', 'threshold', 'vo2max'];
  const currentIdx = sequence.indexOf(meso.blockId);
  return sequence[(currentIdx + 1) % sequence.length];
}

// Il blocco in corso come lo descrive la card Forma; null senza mesociclo o con un blocco sconosciuto.
export function mesoSummary(meso: Pick<Mesocycle, 'blockId' | 'weekInBlock'> | null) {
  const block = meso && blockOf(meso.blockId);
  return block ? { label: block.label, weeks: block.weeks, description: block.description, weekInBlock: meso.weekInBlock } : null;
}

// Il mesociclo con il punto FTP di oggi in fondo ai suoi ultimi 20.
export function withFtpPoint(meso: Mesocycle, date: string, ftp: number): Mesocycle {
  return { ...meso, ftpHistory: [...(meso.ftpHistory || []), { date, ftp }].slice(-20) };
}

// Adatta il segment trend alla risposta dell'atleta
// Se i tempi sui segmenti migliorano → conferma protocollo
// Se peggiorano nonostante CTL stabile → overreaching → forza scarico
export function athleteResponseCheck(form: FormTrend | null, meso: Pick<Mesocycle, 'ftpHistory'> | null) {
  if (!form) return null;

  const ctl = form.ctl[form.DAYS - 1];
  const ctlPrev = form.ctl[Math.max(0, form.DAYS - 15)];
  const ctlTrend = ctl - ctlPrev;

  // Controlla se FTP stimata è in calo nonostante CTL stabile/crescente
  if (meso?.ftpHistory && meso.ftpHistory.length >= 2) {
    const recent = meso.ftpHistory.slice(-2);
    const ftpTrend = recent[1].ftp - recent[0].ftp;
    if (ftpTrend < -5 && ctlTrend >= 0) {
      return {
        status: 'overreaching',
        message: 'FTP in calo nonostante CTL stabile/crescente. Possibile sovrallenamento funzionale. Consiglio: settimana di scarico.',
        ftpTrend,
        ctlTrend: +ctlTrend.toFixed(1),
      };
    }
    if (ftpTrend > 5 && ctlTrend > 0) {
      return {
        status: 'responding',
        message: 'FTP in crescita, il protocollo funziona. Continua il blocco corrente.',
        ftpTrend,
        ctlTrend: +ctlTrend.toFixed(1),
      };
    }
  }

  return {
    status: 'stable',
    message: 'Nessun segnale chiaro di risposta positiva o negativa. Mantieni il piano.',
    ctlTrend: +ctlTrend.toFixed(1),
  };
}
