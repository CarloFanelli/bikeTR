# BikeTR — Metodologia completa

Documento di riferimento: ogni formula, soglia, regola decisionale e fonte scientifica usata nell'applicazione.
Aggiornare questo file **ad ogni modifica** del comportamento dell'algoritmo.

---

## 1. Architettura generale

App statica (HTML + JavaScript) servita da nginx in Docker. Legge da **Strava API v3** via OAuth 2.0 (flusso Authorization Code). Login e rinnovo dei token passano dal server di autenticazione, che tiene client ID/secret (dal file `.env`) e refresh token; il browser riceve solo token di accesso temporanei e chiama Strava direttamente.

### File principali
| File | Ruolo |
|---|---|
| `index.html` | Markup, struttura viste (tab) |
| `app.js` | Orchestrazione, routing viste, chiamate Strava |
| `strava.js` | Token dal server di autenticazione, fetch API, cache streams/segmenti, helpers data |
| `docker/auth/server.ts` | Server di autenticazione: login OAuth Strava, refresh token, token di accesso al browser |
| `training.js` | Card della tab Allenamento (consiglio del giorno, calendario riposi, grafico del carico, piano) |
| `training_v2.js` | Nomi di oggi per il catalogo workout v2 di `web/src/core/training-v2.ts` |
| `analysis.js` | Card della tab Analisi: form trend, power curve, zone FC, polarizzazione, insight interpretativi |
| `predictions.js` | Download dei segmenti preferiti, card di previsioni e allenamenti mirati |
| `web/src/core/` | Calcoli in TypeScript, con tutto come parametro: metriche stream, carico, CTL/ATL/TSB, stime e trend FTP/LTHR, power curve e profilo, previsioni e stime dai segmenti, mesociclo e taper (`meso.ts`), catalogo workout v2 evidence-based con capacity tier (`training-v2.ts`), piano di allenamento (`plan/`: consiglio del giorno, modello utente, settimana, 4 settimane) |
| `activity.html`, `activity.js` | Pagina dettaglio singola attività (mappa, split, segmenti) |

### Storage locale (localStorage keys)
| Key | Contenuto | TTL |
|---|---|---|
| `biketr_settings` | impostazioni utente (LTHR, FTP, peso, ore, giorni, ...) | permanente |
| `biketr_planned_rests` | date ISO marcate come skip | permanente |
| `biketr_rainy_days` | date ISO marcate come pioggia | permanente |
| `biketr_streams_cache_v2` | metriche derivate dagli streams per attività | permanente |
| `biketr_segments_cache_v2` | efforts per segmento | 24h (2h se vuoto) |

---

## 2. Dati letti da Strava

### Endpoint utilizzati
| Endpoint | Uso |
|---|---|
| `POST /oauth/token` | Exchange code + refresh token (solo dal server di autenticazione) |
| `GET /athlete` | Profilo |
| `GET /athletes/{id}/stats` | Statistiche all-time e ultimi 4 sett |
| `GET /athlete/activities?per_page=60` | Lista attività recenti |
| `GET /activities/{id}` | Dettaglio con `segment_efforts` e `splits_metric` |
| `GET /activities/{id}/streams?keys=time,heartrate,watts,cadence` | Serie temporali secondo-per-secondo |
| `GET /segments/starred?per_page=50&page=N` | Segmenti preferiti |
| `GET /segments/{id}/all_efforts?per_page=100` | Storico tentativi utente su un segmento (primario) |

Nota: `/all_efforts` è storicamente inaffidabile (ritorna vuoto anche con tentativi reali, a prescindere dall'abbonamento). Fallback: estrarre `segment_efforts` dai dettagli attività (`hydrateSegmentsFromActivities`).

### Rate limits Strava
- **200 req / 15 min** globali, **2000 / giorno**
- **100 req / 15 min** non-upload, **1000 / giorno**
- HTTP 429 = limit superato → implementato backoff 10s + delay 120-150ms tra chiamate sequenziali.

Fonte: https://developers.strava.com/docs/rate-limits/

---

## 3. Metriche fisiologiche

### 3.1 FTP (Functional Threshold Power)
Potenza massima media sostenibile per 1 ora. Base per tutti i calcoli di carico TSS-based.

**Sorgenti in ordine di priorità (in `resolveHr`):**
1. **FTP dichiarata** dall'utente nei settings → prevale sempre
2. **MAX** tra:
   - **FTP da attività** (`estimateFTP`): power-duration model con quattro bucket (10–20', 20–40', 40–90', e fallback per <10'), pesati per recency (half-life ≈ 8 settimane). Coefficiente per il bucket 20–40': **0.95**.
   - **FTP da segmenti** (`estimatesFromSegments` in `web/src/core/segments.ts`): quattro metodi combinati, viene scelto quello con confidenza più alta:
     - **`best_15_30`** — miglior `average_watts` su effort 15-30' × 0.95 (retrocompatibile).
     - **`weighted_recent`** — stesso bucket ma pesato per recency con decay `exp(-ageWeeks/12)` (recency-weighted, confidenza 0.75).
     - **`suitable_climb`** — best effort 15-40' SOLO su segmenti di salita 3–12% con ≥ 40 m di dislivello e ≥ 1500 m di lunghezza (confidenza 0.9): sforzi su salita eliminano drafting/vento e sono il miglior proxy reale di FTP.
     - **`power_duration_model`** — triangolazione su più bucket di durata (sprint, vo2, sub-threshold, threshold, endurance) con fattori specifici per durata; media dei bucket disponibili (confidenza 0.85).
3. Fallback su qualsiasi attività con potenza × 0.92 (minor confidenza)

Il coefficiente **0.95** deriva dal test classico Hunter Allen/Coggan: FTP = 95% della potenza media tenuta in un 20' all-out.

Fonte:
- [Hunter Allen, Andrew Coggan — *Training and Racing with a Power Meter* (2010)](https://www.amazon.com/Training-Racing-Power-Meter-Hunter/dp/1937715930)
- [Hunter Allen Power Blog — Power Training Zones 101](https://www.hunterallenpowerblog.com/2015/05/power-training-zones-101.html)

### 3.2 LTHR (Lactate Threshold Heart Rate)
FC media sostenibile alla soglia anaerobica. Base per hrTSS e zone FC quando manca la potenza.

**Metodologia (in `estimateLTHR`):** prende il **MAX** tra:
- **M1 — HRmax × 0.91**: media letteratura Friel/Coggan/Allen. LTHR cade tipicamente a 88-92% dell'HRmax osservato; usiamo il midpoint 0.91 sia in avanti (LTHR ≈ 0.91 × HRmax) sia in inverso (HRmax stimato ≈ LTHR / 0.91 quando HRmax non è disponibile) per coerenza interna.
- **M2 — Best avg HR × 0.98** in attività 20-60 min DOVE `max_heartrate >= 0.9 × HRmax osservato`.
  Il filtro sul max HR evita falsi positivi da uscite lunghe ma facili.
- **M3 — Best avg HR da segmenti 15-45 min × 0.98**: i segmenti sono tipicamente sforzi all-out → media di uno sforzo di 20' su segmento ≈ LTHR. Implementato in `estimatesFromSegments.lthrFromSegments`.

Se utente dichiara LTHR manualmente, prevale su tutte le stime (toggle `lthrSource`).

Fonte:
- [Joe Friel — *The Cyclist's Training Bible* (2018)](https://www.joefrielsblog.com/)
- [TrainingPeaks — LTHR field test](https://www.trainingpeaks.com/blog/joe-friels-quick-guide-to-setting-zones/)

### 3.3 TSS (Training Stress Score)
Unità di carico standard. **100 TSS = 1 ora al 100% di FTP**.

Formula classica (Coggan):
```
TSS = (secondi × NP × IF) / (FTP × 3600) × 100
```
Dove:
- **NP** = Normalized Power (rolling 30s → ^4 → mean → ^¼)
- **IF** = Intensity Factor = NP / FTP

### 3.4 CTL, ATL, TSB — Performance Management Chart

Exponential weighted moving averages del carico giornaliero:
```
CTL[n] = CTL[n-1] + (load[n] - CTL[n-1]) × kCTL,  kCTL = 1 - exp(-1/42)
ATL[n] = ATL[n-1] + (load[n] - ATL[n-1]) × kATL,  kATL = 1 - exp(-1/7)
TSB[n] = CTL[n] - ATL[n]
```

Interpretazione (range PMC classici):
| TSB | Stato | Consiglio |
|---|---|---|
| `+10 .. -10` | 🟢 Forma di gara | Ideale per test, gare, PR segmenti |
| `0 .. -20` | 🟡 Carico normale | Costruzione sana |
| `-20 .. -30` | 🟠 Carico profondo | Scaricare entro 7-10 gg |
| `< -50` | 🔴 Troppo stanco | Scarico immediato 3-5 gg |
| `> +10` | ⚠️ Imballato | Rischio detraining |

Fonte:
- Coggan (TSS/CTL/ATL/TSB framework)
- [TrainingPeaks — Performance Management Chart](https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/)

---

## 4. Calcolo del carico (`activityLoad`)

Cascata di precisione — prende la fonte migliore disponibile:

| Priorità | Formula | Condizioni |
|---|---|---|
| **0 (streams)** | `TSS` / `hrTSS` calcolati da streams cache | Streams scaricati via `/activities/{id}/streams` |
| **1 (TSS approx)** | `TSS = IF² × ore × 100` dove IF = `weighted_average_watts / FTP` | FTP + WAP summary disponibili |
| **2 (hrTSS)** | `hrTSS = (avgHR/LTHR)² × ore × 100` | LTHR + FC media disponibili |
| **3 (proxy HR max)** | `min × (avgHR/hrMax)² × 10` | solo hrMax |
| **4 (fallback)** | `suffer_score` o `min × 0.5` | nessun HR/power |

Tutti moltiplicati per **peso del tipo attività**:

| Tipo | Peso | Razionale |
|---|---|---|
| Ride, Run, MTB, Gravel, NordicSki | 1.0 | riferimento |
| Swim | 0.9 | nuoto come bici |
| Crossfit, Elliptical, StairStepper | 0.8 | cardio variato |
| EBikeRide, InlineSkate | 0.7 | intensità minore |
| Workout (generico) | 0.6 | | 
| Hike, RockClimbing | 0.5-0.6 | |
| WeightTraining | **0.5** | forza affatica muscoli ma poco cardio |
| Pilates | 0.4 | |
| Yoga | 0.3 | molto leggero |
| Walk | **0.2** | camminata recupero |
| Altro | 0.5 (default) | |

### 4.1 Streams — NP, TSS, hrTSS precisi

Quando streams disponibili (cache):
- **NP** = `((rolling30s^4).mean())^¼` — standard Coggan
- **TSS** = `(seconds × NP × IF) / (FTP × 3600) × 100`
- **hrTSS** = `(avgHR / LTHR)² × ore × 100` (time-weighted via streams)
- **Minuti per zona HR** effettivi (classificati secondo per secondo)

Fonte:
- [Coggan — Normalized Power definition (wattkg.com)](https://www.wattkg.com/cycling-science/)

---

## 5. Zone FC (basate su % LTHR)

| Zona | % LTHR | Nome | Scopo |
|---|---|---|---|
| Z1 | < 75% | Recupero | Rimozione metaboliti, circolazione |
| Z2 | 75–88% | Aerobico | Base, mitocondri, capillarizzazione, FatMax |
| Z3 | 88–94% | Tempo / Sweet Spot | Stimolo sub-soglia efficiente |
| Z4 | 94–105% | Soglia (Threshold) | Lactate threshold, FTP diretto |
| Z5 | > 105% | VO2max / Anaerobico | Capacità aerobica massima, lattato |

Fonte:
- [Andrew Coggan training zones (TrainingPeaks)](https://www.trainingpeaks.com/blog/power-training-levels/)
- [Hunter Allen & Coggan's Cycling Intensity — coach ray](https://www.coachray.nz/2023/05/17/hunter-allen-andrew-coggans-cycling-intensity/)

---

## 6. Polarizzazione (in `buildHrZones` e `buildTrainingModel`)

Su attività bici ultime 4 settimane:
```
per ogni attività:
  minuti = moving_time / 60 × pesoTipo
  se FC media ≥ 88% LTHR  →  hardMin += minuti
  altrimenti              →  easyMin += minuti
  (senza FC → easyMin, fallback prudente)

easyPct = easyMin / (easyMin + hardMin)
hardPct = hardMin / totale
```

**Target**: 80/20 (modello polarizzato Seiler).
- `easyPct ≥ 75%` → polarizzazione buona ✅
- `easyPct 60-75%` → mista 🟡
- `easyPct < 60%` → troppa intensità 🔴 (rischio plateau)

**Limitazione onesta**: senza streams uso la FC media dell'intera attività. Un'uscita con 20' soglia + 60' recovery appare come media Z2, sottostimando l'hard. Con streams (time-in-zone reali) la precisione sale significativamente.

Fonte:
- [Stephen Seiler — polarized training research](https://www.fasttalklabs.com/pathways/polarized-training/)
- [Seiler & Kjerland 2006 — Quantifying training intensity distribution](https://pubmed.ncbi.nlm.nih.gov/16573837/)

---

## 7. Modello utente (`buildTrainingModel`)

Analizza **ultimi 42 giorni** (6 settimane) di attività:

### 7.1 Livello stimato (da `stats.all_ride_totals.distance`)
| Km all-time | Livello | `maxPhase` v1 | `targetHards` base |
|---|---|---|---|
| < 500 | Nuovo | 0 (solo SST) | 1 |
| 500 - 3.000 | Principiante | 0 | 1 |
| 3.000 - 15.000 | Intermedio | 2 | 2 |
| 15.000 - 50.000 | Avanzato | 2 | 2-3 |
| > 50.000 | Veterano | 2 | 2-3 |

### 7.2 Pattern settimanale
Per ogni `dow` (giorno settimana):
- `count` = numero attività in quel dow negli ultimi 42gg
- `load` = carico cumulato
- `hards` = numero sessioni dure

`preferredDays` = dow con `frequency ≥ 50%` delle settimane → usati per riempire EASY
`hardDowHistorical` = dow ordinati per numero di hard → priorità per piazzare HARD

### 7.3 Carico settimanale + progressione
```
avgWeeklyLoad = media(weeklyLoads[6 settimane])
progressionPerWeek = slope regressione lineare su weeklyLoads
targetWeeklyLoad = max(avgWeeklyLoad × 1.03, avgWeeklyLoad + 10)
```
(+3% settimana, principio di sovraccarico progressivo sicuro — Mujika)

### 7.4 Recovery week automatica
Trigger: `consecLoad ≥ 4 settimane` consecutive con load ≥ 90% avg AND nessun deload recente (no settimana < 65% avg in ultime 4) AND `progressionPerWeek > 0`.

Se triggered: `targetHards -= 1`, volume intervalli × 0.6, long ride ridotta a 90 min, banner viola in UI.

Fonte:
- [Rønnestad et al. (2014) Block periodization — Scand J Med Sci Sports](https://onlinelibrary.wiley.com/doi/10.1111/j.1600-0838.2012.01485.x)
- [Mujika, Halson, Burke (2018) Periodisation](https://pubmed.ncbi.nlm.nih.gov/30070608/)

---

## 8. Algoritmo pianificazione settimanale (`buildWeekPlan`)

### 8.1 Categorizzazione dei 7 giorni (in ordine)

```
1. SKIP        = giorni in plannedRests (utente ha marcato ⏸️)
2. LONG        = weekend (Sab/Dom) non SKIP, fino a longRides
3. HARD        = pickHardDays con priorità [2=Mar, 3=Mer, 4=Gio, 1=Lun, 5=Ven]
                 • targetHards=3 permette cluster consecutivo (Mar-Mer-Gio) perché stimoli diversi
                 • targetHards<3 richiede gap ≥ 2 giorni
                 • Mai adiacente a LONG o SKIP (evita doppio stress)
                 • Rispetta hardDowHistorical del modello (giorni storici utente)
4. RECOVERY    = giorno dopo HARD o LONG → forzato recupero Z1
5. EASY        = riempi fino a weeklyDays, priorità ai preferredDays del modello
6. REST        = resto
7. PIOGGIA     = trasformazione finale:
                 - RECOVERY + 🌧️ → REST_RAIN (riposo totale, richiesta utente)
                 - altro + 🌧️ → STRENGTH (corpo libero)
                 - giorno dopo STRENGTH + 🌧️ → MOBILITY (no 2 forza consecutive)
```

### 8.2 Onda 3:1 nel mesociclo (periodizzazione)
Ogni blocco mesociclico dura **4 settimane** con pattern build/build/peak/deload (classico Coggan/Friel/Issurin; supportato da Seiler systematic review 2023):

| Settimana | Ruolo | loadMul | Effetto |
|---|---|---|---|
| 0 | **build1** | 1.00 | carico base del blocco |
| 1 | **build2** | 1.08 | progressione |
| 2 | **peak** | 1.15 | massima qualità della fase |
| 3 | **deload** | 0.65 | volume tagliato, intensità mantenuta — consolidamento adattamenti |

`getWeekRoleInBlock(meso, weekOffset)` calcola il ruolo per ogni offset (0=settimana corrente). `buildMonthPlan` lo passa a `buildWeekPlan` per le 4 settimane in coda, così la visualizzazione mostra dove sei nella cascata e cosa arriva dopo.

### 8.3 Target hard sessions
Base in funzione del livello (vedi 7.1). Poi riduzione **non cumulativa** (prende solo la più severa):

| Condizione | Riduzione |
|---|---|
| `tsbNorm < -0.6` (TSB < 60% sotto CTL) | -2 (sovraccarico severo) |
| `weekRole.role === 'deload'` (programmato dal mesociclo) | -1 (se base 1-2 HARD) o -2 (se base ≥3) |
| Recovery week retroattivo (`model.needsRecoveryWeek`) | -1 |
| `tsbNorm < -0.3` | -1 |
| `ratio acuto/cronico > 1.7` | -1 |
| `polarization.hardPct > 0.4` | -1 |

**Floor**: sempre almeno 1 HARD per settimana tranne se `tsbNorm < -0.6`. Per crescere serve stimolo, non solo volume.

**Deload programmato vs retroattivo**: il deload del mesociclo è **proattivo** (parte della pianificazione 3:1 indipendentemente dal carico storico). Il `model.needsRecoveryWeek` resta come **fail-safe retroattivo** se l'utente ha accumulato 4+ settimane di alto carico fuori dal calendario mesociclo.

### 8.3 Scaling workout TSB-based
All'interno del workout:
- **Volume moltiplicatore**: `isRecoveryWeek ? 0.6 : tsb<-30 ? 0.75 : tsb<-15 ? 0.88 : 1`
- **Long ride min**: `isRecoveryWeek ? 90 : tsb<-15 ? 90 : tsb>10 ? 150 : 120`
- **Phase downgrade**: TSB molto negativo → fase intensità minore (VO2 → Soglia → SST)
- **Phase upgrade**: TSB > +15 → fase intensità maggiore

### 8.4 Riconciliazione dinamica con attività reali (settimana in corso)
Quando `startOffset === 0` (settimana corrente), il motore conta le attività REALI già svolte dal lunedì a oggi (incluso):
- **hardsDone**: attività bici `isHard()` (FC media > 92% LTHR o durata > 90 min senza FC)
- **longsDone**: attività bici con `moving_time ≥ 120 min`

Riduzioni applicate:
- `targetHards ← max(0, targetHards - hardsDone)`
- `effectiveLongRides ← max(0, longRides - longsDone)` (usato nel piazzamento weekend)

Effetto pratico: se Lunedì fai una lunga fuori piano, Sabato il LONG non viene più schedulato. Se fai 2 hard in settimana già, i restanti vengono ridotti a 0-1.

Visualizzato nella diagnostica settimanale come "🔄 Riconciliazione settimana: X hard già fatti · Y lunga/e già fatta/e".

### 8.5 Simulazione 4 settimane (`buildMonthPlan`)
Il TSB evolve giorno per giorno nella simulazione:
```
per ogni giorno proposto:
  synth = synthFromWorkout(rec, iso, settings)  // attività sintetica
  load = activityLoad(synth, ...)
  simCtx.ctl += (load - simCtx.ctl) × kCTL
  simCtx.atl += (load - simCtx.atl) × kATL
  simCtx.tsb = simCtx.ctl - simCtx.atl
  acts.unshift(synth)  // usato nel build della settimana successiva
```

Questo fa sì che sett 2/3/4 riflettano lo stato di forma che AVRESTI seguendo il piano, non il TSB di oggi congelato.

---

## 9. Catalogo workout v1 (base)

3 fasi core aligned con coach italiano ("diventare veloce e potente"):

### 9.1 Capacità Aerobica (fase 0)
- Risc 15' → `reps×12'` @ 85-93% LTHR rec 5'
- Finale: 10' progressivi da 70% LTHR, +5% ogni 2 min, ultimi 2-3 min sopra soglia
- Scopo: preparare corpo ai lavori duri della settimana

### 9.2 Forza neuromuscolare (fase 1, solo con 3+ hard/sett)
- Partenze da fermo: `reps × 8-10"` max in rapporto duro/salita, rec 2'
- Sprint lanciati: `reps × 10"` all-out da 30 km/h, rec 2-3'
- Scopo: reclutamento fibre veloci, coppia

### 9.3 Potenza / FTP (fase 2, giorno clou)
Alterna per hardIndex:
- **30/30 intermittenti**: 3 × (`reps` × (30" all-out / 30" easy)), rec 5' tra set
- **Ripetute FTP progressive**: 3×4' → 3×6' → 3×8' con recuperi decrescenti (6'→4'→2')

### 9.4 Lunga weekend
- Z2 min `120` min (bonus +30/+60 min se carico cronico > 200 e fresco)
- Solo sab/dom, se entrambi SKIP → niente long quella settimana

---

## 10. Catalogo workout v2 (evidence-based)

Protocolli derivati da **studi peer-reviewed**.

### 10.1 Capacity Tier (scaling dinamico)
```
score = weeklyHours + CTL / 20
```
| Score | Tier | Reps | Long | Max hard | TID |
|---|---|---|---|---|---|
| < 6 | Low | 3 | 90 min | 1 | Threshold |
| 6 - 9 | Mid | 4 | 135 min | 2 | Pyramidal |
| 9 - 13 | High | 5 | 165 min | 3 | Polarized |
| ≥ 13 | Elite | 6 | 210+ min | 4 | Polarized |

Fonte: Training volume `350-750h/anno` tipicamente polarizzato (Seiler systematic review 2023).

### 10.2 Seiler 4×8 (FTP/VO2 hybrid)
- `reps × 8'` @ 90% VO2max = ~105-110% FTP, rec 2'
- Regola d'oro: prima e ultima ripetuta stesso wattaggio
- Studio 7 sett con 2 sessioni/sett: **+16% FTP**, **+10% VO2max** in ciclisti ricreativi

Fonti:
- [Seiler's 4×8-Minute Interval Workout — Fast Talk Labs](https://www.fasttalklabs.com/workouts/4x8-minute-interval-execution/)
- [wattkg 4×8 practical guide](https://www.wattkg.com/wp-content/uploads/2020/02/4x8-long-interval-1.3.pdf)

### 10.3 Seiler 4×4 (VO2max)
- `reps × 4'` @ 115-120% FTP, rec 3'
- Più intenso del 4×8, stress cardiopolmonare massimo

### 10.4 Rønnestad 30/15 (VO2 micro-intervalli)
- 3 × (12 × (30" @ 100-105% VO2max / 15" easy)), rec 3-4' tra set
- Accumula più tempo a VO2max con fatica percepita inferiore

Fonti:
- [Rønnestad et al. (2020) Short intervals — Scand J Med Sci Sports](https://pubmed.ncbi.nlm.nih.gov/32432383/)

### 10.5 Over-Unders (Hunter Allen)
- `blocks × (2' @ 105% FTP + 2' @ 95% FTP) × 3` continuo, rec 5' tra blocchi
- Allena lactate clearance

Fonte:
- [Over-Unders — FasCat Coaching](https://fascatcoaching.com/blogs/training-tips/over-under-intervals/)

### 10.6 Sweet Spot 3×20 (FTP durability)
- 3 × 20' @ 88-93% FTP, rec 5' Z1
- Estende il Time To Exhaustion a soglia

### 10.7 Long ride v2 con "ride-at-the-end"
- Base Z2 `longMin` minuti (tier-dependent)
- Ultimi 30': 3×5' @ 95% FTP rec 3' — fatigue resistance training

Fonte:
- Laursen & Jenkins (2002); Rønnestad et al. sulla resistenza alla fatica

### 10.8 Strength Rønnestad-style (giorni pioggia)
Heavy strength 2×/sett, varianti per livello:
- **Lv 1 Base**: circuito 10 es × 2
- **Lv 2 Intermedio**: 10 es × 3 con varianti unilaterali (ponte 1-gamba, split squat, dead bug)
- **Lv 3 Avanzato**: 10 es × 3 + blocco pliometrico (squat jump, burpee, broad jump)

Studi Rønnestad: 12+ settimane di heavy strength (4-10 reps @ 85-90% 1RM) migliorano efficienza pedalata del 3-7% e 40-min TT power.

Fonti:
- [Rønnestad, Hansen & Raastad (2010) Strength training improves 5-min all-out performance — Scand J Med Sci Sports](https://pubmed.ncbi.nlm.nih.gov/20030780/)
- [Vikmoen et al. (2016) Heavy strength training improves running economy](https://pubmed.ncbi.nlm.nih.gov/26614506/)

---

## 11. Regole pioggia / cross-training

```
SKIP → SKIP (intoccabile)
🌧️ + RECOVERY → REST_RAIN (riposo totale)
🌧️ + (LONG/HARD/EASY/REST) → STRENGTH
🌧️ con giorno prima = STRENGTH pianificato  →  MOBILITY
🌧️ con giorno prima = attività reale WeightTraining/Workout/Crossfit su Strava  →  MOBILITY
```

STRENGTH sintetica = WeightTraining 45 min @ 0.75×LTHR (peso tipo 0.5×).
Giorno dopo STRENGTH: se categoria era HARD → motore forza Recupero Z1 ("ieri forza → gambe potenzialmente indolenzite").

---

## 12. Previsioni segmenti

### 12.1 Trend
Regressione lineare su ultimi 10 tentativi sorted by data:
- `slope = secondi/giorno`, reso come `s/settimana`
- Predizione base: `y = slope × (lastX + 14) + intercept`, clip a 95% del PR

### 12.2 Aggiustamento forma
```
if TSB > 15:        tempo × 0.975  (−2.5%, molto fresco)
if TSB > 5:         tempo × 0.988  (−1.2%)
if TSB < -20:       tempo × 1.04   (+4%, stanco)
if TSB < -10:       tempo × 1.02   (+2%)
if CTL > 80:        tempo × 0.99   (bonus fitness)
if CTL < 30:        tempo × 1.015  (penalità fitness bassa)
```
Clip inferiore: 93% del PR (nessuna previsione "impossibile").

### 12.3 Cache
24h per segmenti con efforts, 2h per segmenti vuoti (Strava a volte è flaky).
Fallback: `hydrateSegmentsFromActivities` estrae `segment_efforts` dai dettagli attività → bypassa endpoint `/all_efforts` inaffidabile.

---

## 13. Impostazioni utente

| Chiave | Default | Ruolo |
|---|---|---|
| `hrMax` | auto (LTHR/0.92) | FC massima |
| `hrLthr` | — (dichiarare) | LTHR dichiarata, prevale su stima |
| `lthrSource` | declared / estimated | Toggle sorgente |
| `ftpDeclared` | — | FTP dichiarata, prevale su stima |
| `ftpSource` | estimated (default) / hr | Usata solo se FTP non dichiarata |
| `weeklyHours` | 6 | Ore target settimana (indicative) |
| `weeklyDays` | 4 | Giorni allenamento (inclusa lunga) |
| `longRides` | 1 | Uscite lunghe/sett |
| `weight` | — | kg (per W/kg) |
| `strengthLevel` | 2 | Livello corpo libero (1/2/3) |

---

## 14. Fonti scientifiche principali

### Polarized training
- Seiler, S. (2010). What is best practice for training intensity and duration distribution in endurance athletes? *International Journal of Sports Physiology and Performance*.
- Seiler & Kjerland (2006). Quantifying training intensity distribution in elite endurance athletes. *Scand J Med Sci Sports*.
- [Fast Talk Labs — Applying the Polarized Training Model with Dr. Seiler](https://www.fasttalklabs.com/fast-talk/applying-the-polarized-training-model-with-dr-stephen-seiler/)

### Block periodization & HIT
- Rønnestad, Hansen, Ellefsen (2014). Block periodization of high-intensity aerobic intervals provides superior training effects in trained cyclists. *Scand J Med Sci Sports*. [PubMed](https://pubmed.ncbi.nlm.nih.gov/22646668/)
- Rønnestad et al. (2020). Short intervals induce superior training adaptations compared with long intervals in cyclists. *Scand J Med Sci Sports*. [PubMed](https://pubmed.ncbi.nlm.nih.gov/32432383/)

### Strength for endurance
- Rønnestad, Hansen, Raastad (2010). Strength training improves 5-min all-out performance following 185 min of cycling. *Scand J Med Sci Sports*. [PubMed](https://pubmed.ncbi.nlm.nih.gov/20030780/)
- Vikmoen et al. (2016). Heavy strength training improves running and cycling performance. *Scand J Med Sci Sports*. [PubMed](https://pubmed.ncbi.nlm.nih.gov/26614506/)

### Periodization & volume
- Mujika, Halson, Burke, Balagué, Farrow (2018). An integrated, multifactorial approach to periodization for optimal performance. *International Journal of Sports Physiology and Performance*. [PubMed](https://pubmed.ncbi.nlm.nih.gov/30070608/)
- Training Periodization, Intensity Distribution, and Volume in Trained Cyclists: A Systematic Review (2023). *IJSPP*. [Link](https://journals.humankinetics.com/view/journals/ijspp/18/2/article-p112.xml)

### Power meter & PMC
- Allen, H., Coggan, A., McGregor, S. (2010, 2019). *Training and Racing with a Power Meter*. VeloPress.
- [TrainingPeaks — PMC explanation](https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/)
- [Coggan Power Zones 101 — Hunter Allen Power Blog](https://www.hunterallenpowerblog.com/2015/05/power-training-zones-101.html)

### Coaching applicato
- [FasCat Coaching — Over-Unders](https://fascatcoaching.com/blogs/training-tips/over-under-intervals/)
- [TrainerRoad — Cycling Power Zones Explained](https://www.trainerroad.com/blog/cycling-power-zones-training-zones-explained/)
- [ROUVY — Sweet Spot training](https://rouvy.com/blog/sweet-spot-training)
- [EVOQ.BIKE — Polarized training guide](https://www.evoq.bike/blog/complete-polarized-training-guide)

### Strava API
- [Strava API Reference](https://developers.strava.com/docs/reference/)
- [Strava API Agreement](https://www.strava.com/legal/api)
- [Strava Rate Limits](https://developers.strava.com/docs/rate-limits/)

---

## 15. Limitazioni note (trasparenza)

1. **Senza streams**: `activityLoad` usa `weighted_average_watts` summary Strava (già una NP approssimata) e `average_heartrate` dell'intera attività. Sottostima allenamenti con alta variabilità di intensità.

2. **Polarizzazione**: classifico ogni attività come "easy" o "hard" in base alla media HR. Un'uscita mista (lungo + intervalli embedded) viene appiattita.

3. **FTP stimata**: senza test dedicato, ± 5-10% di errore rispetto al valore vero. Consiglio test 20' ogni 4-6 settimane.

4. **LTHR stimata**: dipende dalle sessioni presenti. Se nessun sforzo all-out 20' in 60 gg, M2 non attiva → si affida solo a HRmax×0.90.

5. **Strava `/all_efforts`**: inaffidabile in generale (non legato ad abbonamento). Fallback automatico via `hydrateSegmentsFromActivities`.

6. **Simulazione 4 settimane**: assume che l'utente segua esattamente il piano. Deviazioni reali divergeranno dalla proiezione TSB.

7. **Strength load**: `pesoTipo = 0.5` per WeightTraining è approssimazione. La forza affatica muscoli più di quanto il carico numerico suggerisca. Da qui la regola esplicita "ieri forza → oggi Z1".

8. **Uso personale**: l'app è pensata per girare solo sul proprio computer (porta aperta solo su 127.0.0.1), NON pubblicarla online.

---

## 15-bis. Recovery tools

Due toggle opzionali in `Settings → Recovery tools`. Quando attivi, vengono inserite righe specifiche nei workout RECOVERY/REST/REST_RAIN/MOBILITY e nel post-sessione di HARD/LONG.

### 15-bis.1 Pressoterapia (compressione pneumatica intermittente, IPC)
- **Setting**: `settings.hasCompression` (boolean)
- **Suggerimento**: 20–30 min sulle gambe a fine giornata
- **Meccanismo**: gradiente di pressione facilita drenaggio venoso e linfatico, riduce fluid accumulation post-esercizio
- **Evidenza**: piccolo-moderato beneficio su DOMS percepito e gonfiore. **Nessun effetto** robusto sulla performance del giorno dopo. Mixed evidence in atleti allenati (Hoffman 2016, Maton 2006, [meta-analisi 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11475002/), [Pneumatic Compression Fails to Improve Performance Recovery in Trained Cyclists 2017](https://pubmed.ncbi.nlm.nih.gov/28872381/))
- **Quando vale la pena**: post-LONG, post-HARD VO2max, settimane di carico ad alto volume

### 15-bis.2 Massage gun / Theragun (percussion therapy)
- **Setting**: `settings.hasMassageGun` (boolean)
- **Suggerimento**: 5–10 min sui gruppi principali (quadricipiti, polpacci, glutei)
- **Meccanismo**: percussione meccanica a frequenza media abbassa il tono muscolare locale, transitoriamente aumenta ROM
- **Evidenza**: significativa riduzione DOMS soreness (-2/-3 punti su scala 0-10) a 24-72h, miglior ROM short-term ([Frontiers Public Health 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11979224/), [review IJSPT 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10069390/))
- **Caveat critico**: **NON usare nelle 2h prima di sprint / forza esplosiva**. Studi mostrano depressione temporanea del pre-load neuromuscolare → potenza istantanea ridotta. OK la sera o il giorno dopo.

### 15-bis.3 Combinare i due — è additivo?
- I due tool agiscono su meccanismi diversi: IPC su sistema venolinfatico, massage gun su tono muscolare locale.
- La [meta-analisi Dupuy 2018](https://pubmed.ncbi.nlm.nih.gov/29755363/) (99 studi) classifica massage e compression come le due modalità più efficaci per DOMS e fatigue percepita. Non studia direttamente la combo.
- **Razionale per usarli insieme**: sistemi indipendenti → effetti plausibilmente additivi. Active recovery Z1 il giorno dopo aggiunge un terzo meccanismo (clearance metaboliti via circolazione sistemica).
- **Linea pratica raccomandata post-HARD/LONG**:
  1. **Subito post (30-60 min)**: idratazione, CHO+protein 3:1
  2. **Sera della giornata**: pressoterapia 20-30 min + massage gun 5-10 min sui muscoli più impegnati
  3. **Giorno dopo**: active recovery Z1 45-60 min (se categoria RECOVERY) + ulteriore massage gun la sera se DOMS marcato
- **Limitazioni**: nessun trial RCT ha testato esattamente questa combo per ciclisti endurance. La raccomandazione è basata su meccanismi indipendenti documentati.

---

## 16. Changelog metodologico

Tutte le modifiche al comportamento dell'algoritmo devono essere annotate qui.

| Data | Cambio | Motivazione |
|---|---|---|
| 2026-04-13 | Creato documento iniziale | Consolidamento riferimento metodologico |
| 2026-04-14 | Pioggia + forza ieri (anche reale da Strava) → MOBILITY | Evita doppio stress muscolare: ora il controllo include attività WeightTraining/Workout/Crossfit realmente registrate ieri, non solo i giorni pianificati nella settimana corrente |
| 2026-04-14 | Rilevazione forza: aggiunto regex sul titolo | Oltre al type Strava, matcho `/corpo\s*libero|bodyweight|palestra|gym|forza|strength/i` sul `name` dell'attività. Utente registra spesso il corpo libero come "Workout" con titolo "Corpo libero forza" → ora viene detectato correttamente anche dalla regola "ieri forza → oggi Z1" nel motore principale |
| 2026-04-14 | Regex forza estesa + diagnostica console | Aggiunti pattern `calistenia\|calisthenics\|allenamento\s*generico\|home\s*workout\|circuit\|body\s*weight\|corpolibero`. Inoltre stampa in console log `[BikeTR rainy-check]` i dettagli della decisione (isos detectati, ultime 5 attività con match) per debug quando MOBILITY non scatta come atteso |
| 2026-04-14 | Riconciliazione settimana in corso | Il piano della settimana corrente (startOffset=0) conta hard/lunghe già svolte da Lun a oggi e riduce i target residui. Se ho già fatto la lunga, Sabato non la ripropone. Se ho già fatto 2 hard, i restanti scendono. Mostrato in diagnostica. |
| 2026-05-07 | Tab "🤖 Coach AI" — Ollama locale (v1) | Primo tentativo: il modello restituiva tutto il workout in markdown (struttura + watt + razionale + fonte). Problemi rilevati: (a) aritmetica zone errata sui 7B locali, (b) citazioni inventate (es. "Fausti 2013" non esistente), (c) durate totali sballate. Da rimuovere. |
| 2026-05-07 | Coach AI v2 — RAG + catalogo deterministico | Ridisegnato. (1) `build_papers_index.mjs`: script Node che cerca paper su PubMed via E-utilities (esearch+efetch) e genera embeddings via Ollama `nomic-embed-text`, salva `papers_index.json` (~10 paper Seiler/Rønnestad/Vikmoen/Mujika/Laursen/Buchheit/Stepto/Hansen). (2) Lato browser: per ogni richiesta costruisco una query dallo stato (TSB/hard%/durata), embedding, cosine similarity → top 4 paper rilevanti. (3) Catalogo `COACH_PROTOCOLS` deterministico: ogni protocollo ha `build(ftp, durataMin)` che calcola watt assoluti e struttura che somma esattamente alla durata richiesta (round a 5W). (4) Il modello restituisce SOLO `{protocolId, razionale, paperUsati[]}` JSON; il codice fa il resto. (5) Fallback: se JSON malformato → decisione TSB-based hardcoded. (6) Pre-flight: blocca se FTP null. (7) Render: card con titolo/watt/struttura + link cliccabili PubMed dei paper citati + lista top paper recuperati con score. |
| 2026-05-07 | Coach AI — regole hard% rinforzate | Riscritte le REGOLE DI SELEZIONE nel system prompt. Hard% < 15% e TSB ≥ -10 ora forza il modello a scegliere protocollo qualitativo (sweet_spot_3x15/threshold_3x10/tempo_2x20) invece di Z2 base. Aggiunta REGOLA NEGATIVA esplicita: z2_endurance puro è ammesso SOLO se TSB ≤ -15, hard% > 30%, o durata < 50 min. Motivo: il modello con regole soft sceglieva sempre Z2 anche quando l'atleta era sotto-stimolato (testato con TSB 0, hard% 11% — sceglieva Z2 invece di sweet spot). |
| 2026-05-07 | Coach AI — catalogo arricchito | Aggiunti 3 protocolli al catalogo: `z2_cadence_drills` (Z2 + 3×5' cadenza alta 100+ rpm, fonte Hansen 2012), `tempo_2x20` (2×20' @ 83-87% FTP — alternativa più dolce di sweet spot), `z2_progressive` (build-up 65→75→85% FTP). Catalogo passa da 10 a 13 protocolli. Aggiornato `fallbackProtocolId` per usare i nuovi quando appropriato (es. hard% > 30% + durata 45-70min → z2_progressive). |
| 2026-05-07 | Sezione "🔍 Calcolo FTP / LTHR — dettaglio" | Nuova sezione in tab Analisi (`view-analysis`) che mostra le attività che hanno determinato la stima. `buildFtpBreakdown` replica `estimateFTP` esponendo per ogni bucket di durata (40-90', 20-40', 10-20', <10') l'attività vincente (link cliccabile a `activity.html`), WAP grezzi, fattore di decay (half-life 12 settimane), fattore di correzione, FTP candidato. Stesso per LTHR (`buildLthrBreakdown`): righe M1 (HRmax × 0.90), M2 (best avg HR test-like × 0.98), eventuali segmenti, riga vincente evidenziata 🏆. Trasparenza totale sulla provenienza dei numeri usati in tutta l'app. |
| 2026-05-14 | Revisione coerenza + ES modules + bug fix | Pulizia trasversale del progetto. (a) **Fix bug numerici**: `predictions.js:234` typo nel comparatore del power-duration model (entrambi i lati moltiplicavano per `c.decay` → ora `a.decay`); `isHard()` non marca più long Z2 senza HR come "hard" (cascata IF→HR→suffer_score→regex titolo); ratio acuto/cronico ora `null` se chronic<50 (atleta nuovo non innesca falso overreaching); LTHR/HRmax simmetrici a 0.91 (era 0.90 forward vs 0.92 inverse); Z2 superiore 75–88% LTHR (era 75–89%); rinominata funzione interna `_isReducedVolume` in v2 per disambiguare dal parametro `isRecoveryWeek`. (b) **ES modules**: tutti i file `.js` sono ora moduli (`<script type="module">`), con `import`/`export` espliciti. Creato `constants.js` con `PHYSIO`, `TYPE_WEIGHTS`, `APP_CONFIG`. Rimossi i fallback `typeof X === 'function'`. (c) **Hardening**: timeout 3 min su tutte le fetch Ollama (`AbortSignal.timeout` composto con `AbortController`); `safeLoad`/`safeSave` centralizzati per localStorage con backup `.broken` su corruzione; `APP_CONFIG.maxStreamsFetch`/`maxSegmentsHydrate` centralizzati. (d) **Cleanup**: rimossi 4 file orfani (`make_icon.py`, `icon.png`, `exercise.jpg`, `mem.png`), cache legacy `biketr_segments_cache`, classi CSS `.split-km`/`.split-val` aggiunte. |
| 2026-05-14 | v2 promosso a motore di default + calendario lun-dom + settings disponibilità | (a) **Merge selettivo v1+v2**: `workoutForCategory` (motore "Allenamento") è ora un thin wrapper su `v2_workoutForCategory`. Tutti i workout HARD/LONG/EASY/STRENGTH/RECOVERY/MOBILITY/REST citano direttamente Seiler 4×8/4×4, Rønnestad 30/15s + heavy strength, Coggan/Allen Sweet Spot, Hunter Allen Over-Unders. Resta in v1 solo `PAST_REST` (concetto calendario). v1 mantiene scheletro decisionale: `recommend()`, mesocicli, `compositeFatigueScore`, regole post-hard. View "🧪 Allenamenti v2" rimossa dalla nav; funzioni `renderV2Plan`/`renderV2TodayCard`/`buildMonthPlanV2` eliminate. (b) **Calendario settimana lun–dom**: introdotto `currentMondayOffset()`. `buildWeekPlan` riceve `startOffset` relativo a lunedì; `buildMonthPlan` chiama con `baseMonday + w*7`. `renderRestPlanner` stesso pattern. Slot giorni passati della settimana corrente sono mostrati con classe `.past` (opacità ridotta) e quelli di oggi con `.today` (bordo accent). (c) **Settings disponibilità**: nuovi campi `availableDays` (ISO dow array, default tutti), `longRideDays` (ISO array, default `[6]` = sabato), `longRideMaxMin` (durata target lunga in min, default 180). UI con toggle giorni cliccabili. `recommend()` e `buildWeekPlan` usano queste settings invece di `isWeekend` hardcoded; v2 LONG legge `longRideMaxMin` come tetto scalato per TSB/recovery. |
| 2026-05-14 | Recovery tools combo (pressoterapia + massage gun) + block periodization Rønnestad + taper Mujika | (a) **Recovery tools**: due toggle separati `hasCompression`/`hasMassageGun` in Settings → Recovery tools. Quando attivi, le note specifiche vengono inserite nei workout di recovery e post-HARD/LONG. Caveat: il massage gun NON deve essere usato nelle 2h prima di sprint/forza esplosiva (depressione pre-load neuromuscolare documentata). Sezione 15-bis aggiunta a METHODOLOGY con paper di riferimento (Hoffman 2016, Dupuy 2018, Frontiers 2025, IJSPT 2023). (b) **Block periodization Rønnestad 2014** aggiunto come variante mesociclo (`ronnestad_block`): pattern `[5, 1, 2, 1]` HARD per settimana, loadMul `[1.25, 0.75, 0.75, 0.60]`. `getWeekRoleInBlock` ora distingue pattern `wave` vs `block`. (c) **Taper Mujika 2018**: settings `raceDate` + `raceName`. `getTaperPhase(raceDate, weekStartIso)` override del weekRole nelle 3 settimane prima: taper1 (-20%, 2 HARD), taper2 (-40%, 2 HARD), taper3 (-55%, 1 opener), race_week (-70%, 0 HARD). Banner UI rosa con countdown. (d) **STRENGTH bodyweight onesto**: rinominato da "Rønnestad-style" a "Forza corpo libero", razionale chiarisce che NON produce gli adattamenti di Hansen 2012/Rønnestad 2017 (richiedono carichi 80-90% 1RM). Aggiunta categoria `STRENGTH_BIKE` con torque intervals (Theurel 2012, Sunde 2010) come sostituto efficace dell'heavy lifting per chi non ha palestra. |
| 2026-05-14 | Periodizzazione 3:1 onda nel mesociclo (build1 / build2 / peak / deload) | `MESO_BLOCKS` portati da 3 a 4 settimane con pattern fisso `[build1, build2, peak, deload]` e `loadMul = [1.00, 1.08, 1.15, 0.65]`. Nuovo helper `getWeekRoleInBlock(meso, weekOffset)` calcola il ruolo per ogni settimana del piano mensile. `buildMonthPlan` calcola e passa `weekRole` a `buildWeekPlan` per ogni delle 4 settimane visualizzate. `buildWeekPlan` usa `weekRole.isDeload === true` come `isRecoveryWeek` (sostituisce il `model.needsRecoveryWeek` come trigger principale; quest'ultimo resta come fail-safe retroattivo se l'utente accumula 4+ settimane di carico fuori dal calendario mesociclo). La deload programmata sottrae 1 (o 2 per atleti ≥3 HARD base) dai `targetHards`. UI: banner mesociclo nella card Training mostra ruolo settimana corrente + ruolo della prossima ("Prossima settimana: Peak (loadMul 1.15×)"). Banner colorato per ogni settimana del piano mensile (azzurro=build1, giallo=build2, arancio=peak, verde=deload). Motivazione: prima della modifica la deload scattava SOLO retroattivamente — utente nuovo o post-riposo non vedeva MAI uno scarico programmato → carico continuo, contro Coggan/Friel/Issurin/Seiler 2023. Ora la deload arriva ogni 4ª settimana del blocco indipendentemente dallo storico. |
| 2026-11-06 | Coach AI — il lavoro passa al servizio Coach (Python) | Catalogo protocolli, prompt, ricerca dei paper, scelta di ripiego e paper citati si spostano da `coach.js` a `docker/coach/app/` senza cambiare comportamento: i test confrontano watt, passi, prompt e paper con quelli del vecchio codice del browser, conservato come riferimento in `docker/coach/tests/reference/coach_before_move.js`. Il servizio scarica le corse da Strava e calcola il contesto atleta nel fuso orario del browser; il browser invia durata, modello e profilo atleta e mostra passi e testo del modello mentre arrivano. Unica aggiunta visibile: la card dice quando usa corse salvate (Strava non raggiungibile) e quante uscite non hanno dettagli secondo per secondo. |

---

**Aggiornare questo file ad ogni modifica del codice che cambia il comportamento visibile o interpretabile dall'utente.**
