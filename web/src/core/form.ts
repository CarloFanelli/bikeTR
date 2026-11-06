// Forma (fitness CTL, fatica ATL, freschezza TSB) degli ultimi 90 giorni, fatica
// complessiva, attività diverse dalla bici e osservazioni sulla forma.

import { buildDateHelpers } from './dates.ts';
import type { FtpTrend, Insight } from './ftp.ts';
import type { HrProfile } from './hr.ts';
import { activityLoad, isHard, muscularFatigueScore } from './load.ts';
import type { Activity } from './strava-types.ts';

// Valori giorno per giorno, dal più vecchio a oggi (indice DAYS - 1).
export interface FormTrend {
  daily: number[];
  ctl: number[];
  atl: number[];
  tsb: number[];
  DAYS: number;
}

// ---- CTL / ATL / TSB ----
export function buildFormTrend(
  activities: Activity[], profile: Pick<HrProfile, 'hrMax' | 'hrLthr' | 'ftp'>, now: Date,
): FormTrend {
  const { hrMax, hrLthr, ftp } = profile;
  // Usa TUTTE le attività (con peso per tipo via activityLoad)
  const DAYS = 90;
  const daily: number[] = new Array(DAYS).fill(0);
  const today = new Date(now); today.setHours(0,0,0,0);
  activities.forEach(a => {
    const d = new Date(a.start_date_local); d.setHours(0,0,0,0);
    const delta = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (delta >= 0 && delta < DAYS) daily[DAYS - 1 - delta] += activityLoad(a, hrMax, hrLthr, ftp);
  });
  const ctl: number[] = [], atl: number[] = [];
  let cCTL = 0, cATL = 0;
  const kCTL = 1 - Math.exp(-1/42);
  const kATL = 1 - Math.exp(-1/7);
  for (let i = 0; i < DAYS; i++) {
    cCTL += (daily[i] - cCTL) * kCTL;
    cATL += (daily[i] - cATL) * kATL;
    ctl.push(cCTL); atl.push(cATL);
  }
  const tsb = ctl.map((c, i) => c - atl[i]);
  return { daily, ctl, atl, tsb, DAYS };
}

// Quello che le osservazioni prendono da fuori dai calcoli della forma.
export interface InsightContext {
  hrLthr: number | null | undefined;
  ftp: number | null | undefined;
  now: Date;
  ftpTrend: FtpTrend | null;
  // Il mesociclo in corso, se c'è.
  meso: { label: string; weeks: number; description: string; weekInBlock: number } | null;
  // Risposta dell'atleta al blocco in corso (athleteResponseCheck del piano di allenamento).
  response: { status: string; message: string } | null | undefined;
}

export function formInsights(data: FormTrend, activities: Activity[], context: InsightContext): Insight[] {
  const { ctl, atl, tsb, daily, DAYS } = data;
  const cur = { ctl: ctl[DAYS-1], atl: atl[DAYS-1], tsb: tsb[DAYS-1] };
  const prevCTL = ctl[Math.max(0, DAYS-15)];
  const load7 = daily.slice(-7).reduce((s,v) => s+v, 0);
  const loadPrev7 = daily.slice(-14, -7).reduce((s,v) => s+v, 0);
  const deltaLoad = load7 - loadPrev7;
  const restDaysLast7 = daily.slice(-7).filter(v => v < 5).length;
  const { hrLthr, ftp, now } = context;
  const { ago } = buildDateHelpers(0, now);
  const bikes = activities.filter(a => a.type && a.type.includes('Ride'));
  const last7 = bikes.filter(a => ago(a.start_date_local) < 7);
  const hardsLast7 = last7.filter(a => isHard(a, hrLthr, ftp)).length;
  const longLast7 = last7.filter(a => (a.moving_time||0) >= 120*60).length;

  const out: Insight[] = [];

  // Range PMC classici del coaching basato su TSS:
  // TSB -10 a +10 = forma di gara (pronto a performare)
  // TSB 0 a -20 = carico normale
  // TSB -20 a -30 = fase di carico profondo (costruzione)
  // TSB < -50 = troppo stanco, non rendere
  // TSB > +10 = rischio "imballato" / detraining
  if (cur.tsb < -50) {
    out.push({ icon: '🔴', text: `TSB a ${cur.tsb.toFixed(0)}: sei troppo stanco per rendere al meglio. La fatica (ATL=${cur.atl.toFixed(0)}) ha superato di molto il fitness (CTL=${cur.ctl.toFixed(0)}). Con questi valori le prestazioni crollano del 15-20%: non è il momento di forzare, ma di scaricare per 3-5 giorni prima di riprendere stimoli duri.` });
  } else if (cur.tsb < -30) {
    out.push({ icon: '🟠', text: `TSB a ${cur.tsb.toFixed(0)}: fase di carico profondo. Fatica ${cur.atl.toFixed(0)} supera nettamente fitness ${cur.ctl.toFixed(0)}. È la situazione di una settimana di costruzione intensa: il fitness sta crescendo ma le prestazioni immediate sono compromesse. Continua se è il tuo piano, ma entro 7-10 giorni serve uno scarico per "capitalizzare" il lavoro.` });
  } else if (cur.tsb < -10) {
    out.push({ icon: '🟡', text: `TSB a ${cur.tsb.toFixed(0)}: carico normale di allenamento. Stai accumulando stimolo per migliorare la forma futura — esattamente la zona in cui si costruiscono gli adattamenti senza rompere. Le prestazioni del giorno sono leggermente sotto il potenziale, ma è un prezzo sano da pagare.` });
  } else if (cur.tsb <= 10) {
    out.push({ icon: '🟢', text: `TSB ${cur.tsb > 0 ? '+' : ''}${cur.tsb.toFixed(0)}: forma di gara! Fitness ${cur.ctl.toFixed(0)} e fatica ${cur.atl.toFixed(0)} allineati con margine. Questa è la finestra ideale per un test FTP, un tentativo su un segmento PR, una gara o un'uscita di qualità massima. Sfrutta la freschezza.` });
  } else {
    out.push({ icon: '⚠️', text: `TSB +${cur.tsb.toFixed(0)}: troppo scarico. Ti senti "imballato" — le gambe non rispondono come dovrebbero nonostante la freschezza. Il CTL sta iniziando a scendere: se non hai una gara imminente, torna a stimoli regolari per evitare detraining.` });
  }

  if (loadPrev7 > 10) {
    const pct = Math.round((deltaLoad / loadPrev7) * 100);
    if (pct > 30) out.push({ icon: '📈', text: `Il carico è cresciuto del ${pct}% rispetto alla settimana precedente (${loadPrev7.toFixed(0)} → ${load7.toFixed(0)}). Aumenti oltre il 30% sono considerati "spike" e sono la prima causa di fatica acuta elevata. Se questo è volontario (es. mesociclo di carico) va bene per 1–2 settimane, ma deve essere seguito da uno scarico.` });
    else if (pct < -30) out.push({ icon: '📉', text: `Il carico è sceso del ${Math.abs(pct)}% rispetto alla settimana precedente (${loadPrev7.toFixed(0)} → ${load7.toFixed(0)}). Riduzione consistente: può essere una fase di scarico pianificato, uno stop per malattia/viaggio o semplicemente una settimana meno strutturata. Se prolungata oltre 10 giorni inizia a incidere sul fitness.` });
    else out.push({ icon: '➡️', text: `Carico stabile: ${load7.toFixed(0)} questa settimana vs ${loadPrev7.toFixed(0)} la precedente (${pct >= 0 ? '+' : ''}${pct}%). Progressione fisiologica, nessun spike.` });
  }

  if (hardsLast7 >= 3) {
    out.push({ icon: '🔥', text: `${hardsLast7} sessioni ad alta intensità negli ultimi 7 giorni. Per costruire soglia, il sistema cardiovascolare e muscolare ha bisogno di tempo per adattarsi tra uno stimolo forte e il successivo: 3+ intensità/settimana è un dosaggio da atleta avanzato, e solo se bilanciato con recuperi veri. Se non sei abituato a questo ritmo, il rischio stallo/infortunio è reale.` });
  } else if (hardsLast7 === 2) {
    out.push({ icon: '🎯', text: `2 sessioni dure in 7 giorni: dosaggio classico per migliorare la soglia mantenendo spazio per il recupero. Distribuite bene (con almeno 48h in mezzo e giorni di Z2 tra l'una e l'altra) sono il cuore di un piano per l'FTP.` });
  } else if (hardsLast7 === 0 && cur.tsb < -5) {
    out.push({ icon: '🚴', text: `Nessuna sessione sopra soglia, ma TSB comunque negativo (${cur.tsb.toFixed(0)}): il carico viene quindi dal volume in Z2 o dalle uscite lunghe. Questo tipo di fatica è meno "acuta" ma più cumulativa — ottima per la base aerobica, da monitorare se prolungata.` });
  }

  if (longLast7 > 0) {
    out.push({ icon: '🟠', text: `${longLast7} uscita lunga (≥2h) nell'ultima settimana. Le lunghe sono il contributo singolo più importante al CTL settimanale: una 3h ben fatta genera più carico di due sessioni di intensità da 60'. Ottimo strumento per costruire base aerobica e capacità di utilizzo dei grassi come carburante.` });
  }

  if (restDaysLast7 >= 4) {
    out.push({ icon: '🛌', text: `${restDaysLast7} giorni su 7 senza attività. Riposo consistente: utile per recuperare da un blocco intenso o da un evento, ma se prolungato oltre una settimana il CTL inizia a scendere significativamente.` });
  } else if (restDaysLast7 === 0) {
    out.push({ icon: '⚡', text: `Attivo tutti i 7 giorni. Può funzionare per atleti esperti con sessioni molto calibrate (es. alternanza Z1/Z2/qualità), ma per la maggior parte dei ciclisti 1–2 giorni di riposo completo a settimana migliorano gli adattamenti e riducono il rischio di plateau.` });
  }

  const ctlDelta = cur.ctl - prevCTL;
  if (ctlDelta > 5) out.push({ icon: '💪', text: `Fitness in forte crescita: CTL ${prevCTL.toFixed(0)} → ${cur.ctl.toFixed(0)} (+${ctlDelta.toFixed(0)}) in 2 settimane. Stai costruendo base a un ritmo sostenuto. Attenzione: aumenti superiori a 5–7 punti/settimana sono considerati aggressivi e vanno alternati a settimane di scarico.` });
  else if (ctlDelta > 2) out.push({ icon: '📊', text: `Fitness in crescita graduale: CTL +${ctlDelta.toFixed(0)} in 2 settimane. Progressione sostenibile e sana — è il passo consigliato per costruire senza rompere gli equilibri.` });
  else if (ctlDelta < -5) out.push({ icon: '⬇️', text: `Fitness in calo: CTL ${prevCTL.toFixed(0)} → ${cur.ctl.toFixed(0)} (${ctlDelta.toFixed(0)}) in 2 settimane. Se non è un taper intenzionale verso una gara, ripristina volume al più presto per evitare di perdere il lavoro fatto.` });

  if (cur.tsb < -15) {
    out.push({ icon: '💡', text: `Raccomandazione: inserisci 1–2 giorni di riposo completo o recupero attivo in Z1. Il TSB deve tornare almeno sopra −10 prima di proporre nuove sessioni di qualità, altrimenti lo stimolo viene assorbito male e accumuli solo fatica.` });
  } else if (cur.tsb > 10 && hardsLast7 === 0) {
    out.push({ icon: '💡', text: `Raccomandazione: stato di forma ottimo e nessun lavoro di intensità recente — è il momento per un blocco di Soglia o VO2max. Non sprecare la freschezza in un altro fondo facile.` });
  } else if (cur.tsb > -5 && cur.tsb < 5 && hardsLast7 < 2) {
    out.push({ icon: '💡', text: `Raccomandazione: equilibrio buono con spazio per crescere. Un paio di sessioni di Sweet Spot o Soglia nei prossimi giorni spingono il fitness senza mandare in rosso la fatica.` });
  }

  // Cross-training insights
  const ctInsights = crossTrainingInsights(activities, now);
  if (ctInsights.insights.length > 0) {
    for (const ins of ctInsights.insights) {
      const icon = ins.type === 'balance' ? '⚖️' : ins.type === 'hiking' ? '🥾' : ins.type === 'strength' ? '💪' : ins.type === 'running' ? '🏃' : '🧘';
      out.push({ icon, text: `${ins.text} ${ins.impact}` });
    }
  }

  // FTP trend
  const { ftpTrend } = context;
  if (ftpTrend?.insights?.length) {
    for (const ins of ftpTrend.insights) {
      out.push(ins);
    }
  }

  // Mesocycle info
  const { meso } = context;
  if (meso) {
    out.push({
      icon: '📋',
      text: `Mesociclo attivo: "${meso.label}" — settimana ${meso.weekInBlock + 1}/${meso.weeks}. ${meso.description}`,
    });
  }

  // Athlete response check
  const { response } = context;
  if (response && response.status !== 'stable') {
    out.push({
      icon: response.status === 'overreaching' ? '🔴' : '✅',
      text: response.message,
    });
  }

  // Muscular fatigue score
  const mFatigue = muscularFatigueScore(activities, 7, now);
  if (mFatigue > 40) {
    out.push({
      icon: '🦵',
      text: `Fatica muscolare elevata (${mFatigue}/100) nelle ultime 7 attività. Cause: dislivello, forza, trail running. Gambe potenzialmente indolenzite — considera questo prima di sessioni di intensità in bici.`,
    });
  }

  return out;
}

// ---- Fatigue Score composito (cardio + muscolare) ----
// Combina TSB (fatica cardio) con muscular fatigue score per un indice completo
export function compositeFatigueScore(form: FormTrend, activities: Activity[], now: Date) {
  const tsb = form.tsb[form.DAYS - 1];
  const ctl = form.ctl[form.DAYS - 1];
  const atl = form.atl[form.DAYS - 1];

  // Muscular fatigue (load.ts)
  const mFatigue = muscularFatigueScore(activities, 7, now);

  // Normalizza TSB in scala 0-100 (100 = massima fatica)
  // TSB -50 → 100, TSB 0 → 50, TSB +20 → 25
  const cardioFatigue = Math.max(0, Math.min(100, 50 - tsb));

  // Score composito: pesato 60% cardio + 40% muscolare
  const composite = Math.round(cardioFatigue * 0.6 + mFatigue * 0.4);

  // Cross-training impact sulle ultime 48h
  const { ago } = buildDateHelpers(0, now);
  const last48h = activities.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 2);
  const recentHikeElev = last48h
    .filter(a => a.type === 'Hike' || a.type === 'Walk')
    .reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const recentStrengthHours = last48h
    .filter(a => ['WeightTraining', 'Workout', 'Crossfit'].includes(a.type))
    .reduce((s, a) => s + (a.moving_time || 0) / 3600, 0);

  return {
    composite,
    cardioFatigue: Math.round(cardioFatigue),
    muscularFatigue: mFatigue,
    tsb: +tsb.toFixed(1),
    ctl: +ctl.toFixed(1),
    atl: +atl.toFixed(1),
    recentHikeElev,
    recentStrengthHours: +recentStrengthHours.toFixed(1),
    readiness: composite < 35 ? 'pronto' : composite < 55 ? 'moderato' : composite < 75 ? 'affaticato' : 'sovraccarico',
    canDoHard: composite < 50 && mFatigue < 40,
    shouldRest: composite > 70 || mFatigue > 60,
  };
}

interface Category {
  types: Set<string>;
  hours: number;
  count: number;
  elev: number;
}

// ---- Cross-training insights ----
// Analizza l'impatto delle attività non-bici sul training mix
export function crossTrainingInsights(activities: Activity[], now: Date) {
  const { ago } = buildDateHelpers(0, now);
  const last28 = activities.filter(a => ago(a.start_date_local) >= 0 && ago(a.start_date_local) < 28);

  const categories: Record<string, Category> = {
    cycling: { types: new Set(['Ride','VirtualRide','EBikeRide','MountainBikeRide','GravelRide']), hours: 0, count: 0, elev: 0 },
    running: { types: new Set(['Run','VirtualRun','TrailRun']), hours: 0, count: 0, elev: 0 },
    hiking: { types: new Set(['Hike','Walk']), hours: 0, count: 0, elev: 0 },
    strength: { types: new Set(['WeightTraining','Workout','Crossfit']), hours: 0, count: 0, elev: 0 },
    swimming: { types: new Set(['Swim']), hours: 0, count: 0, elev: 0 },
    flexibility: { types: new Set(['Yoga','Pilates']), hours: 0, count: 0, elev: 0 },
    other: { types: new Set<string>(), hours: 0, count: 0, elev: 0 },
  };

  for (const a of last28) {
    let matched = false;
    for (const key in categories) {
      if (key === 'other') continue;
      if (categories[key].types.has(a.type)) {
        categories[key].hours += (a.moving_time || 0) / 3600;
        categories[key].count++;
        categories[key].elev += (a.total_elevation_gain || 0);
        matched = true;
        break;
      }
    }
    if (!matched) {
      categories.other.hours += (a.moving_time || 0) / 3600;
      categories.other.count++;
    }
  }

  const totalHours = Object.values(categories).reduce((s, c) => s + c.hours, 0);
  const insights: { type: string; text: string; impact: string }[] = [];

  // Analisi cross-training e sinergie
  if (categories.hiking.count > 0 && categories.hiking.elev > 0) {
    const avgElevPerHike = Math.round(categories.hiking.elev / categories.hiking.count);
    insights.push({
      type: 'hiking',
      text: `${categories.hiking.count} escursioni in 4 sett. (${categories.hiking.hours.toFixed(1)}h, ${Math.round(categories.hiking.elev)}m D+ totali, media ${avgElevPerHike}m/uscita).`,
      impact: categories.hiking.elev > 3000
        ? 'Impatto significativo su fatica muscolare. Le gambe hanno bisogno di più recupero tra sessioni dure in bici.'
        : 'Contributo aerobico moderato. Il dislivello rinforza quadricipiti e glutei (positivo per la bici).',
    });
  }

  if (categories.strength.count > 0) {
    insights.push({
      type: 'strength',
      text: `${categories.strength.count} sessioni forza (${categories.strength.hours.toFixed(1)}h).`,
      impact: categories.strength.count >= 2
        ? 'Ottimo per efficienza pedalata (+3-7% FTP in 12 sett. secondo Rønnestad). Rispetta 24-48h prima di sessioni dure in bici.'
        : 'Una sessione/sett è il minimo per vedere benefici. Prova ad aggiungerne una seconda.',
    });
  }

  if (categories.running.count > 0) {
    insights.push({
      type: 'running',
      text: `${categories.running.count} sessioni corsa (${categories.running.hours.toFixed(1)}h, ${Math.round(categories.running.elev)}m D+).`,
      impact: 'La corsa contribuisce al VO2max e alla base aerobica ma aggiunge stress articolare. Considera questo nei giorni di recupero.',
    });
  }

  if (categories.flexibility.count > 0) {
    insights.push({
      type: 'flexibility',
      text: `${categories.flexibility.count} sessioni yoga/pilates (${categories.flexibility.hours.toFixed(1)}h).`,
      impact: 'Mobilità e core stabilità: migliora postura sulla bici e previene infortuni. Nessun impatto negativo sul recupero.',
    });
  }

  // Mix consiglio
  const cyclingPct = totalHours > 0 ? (categories.cycling.hours / totalHours * 100) : 100;
  if (cyclingPct < 50 && totalHours > 3) {
    insights.push({
      type: 'balance',
      text: `Solo ${Math.round(cyclingPct)}% del volume è ciclismo. Le attività complementari contribuiscono al fitness generale ma per migliorare FTP serve che la bici resti la disciplina principale.`,
      impact: 'Suggerimento: mantieni almeno 60-70% del volume in bici per progressione specifica.',
    });
  }

  return {
    categories,
    totalHours,
    cyclingPct: +cyclingPct.toFixed(0),
    insights,
    weeklyElevation: Math.round(categories.hiking.elev + categories.cycling.elev + categories.running.elev) / 4,
  };
}
