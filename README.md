# BikeTR

Prima versione sperimentale del progetto, iniziato il **7 maggio 2026**.

App statica (HTML + JS, no backend) per analisi e suggerimento di allenamento ciclistico, basata sui dati Strava dell'utente. Pensata per **uso personale e locale**: l'autenticazione OAuth, le impostazioni e le cache risiedono nel `localStorage` del browser.

> ⚠️ Il `client_secret` di Strava viene salvato in chiaro nel `localStorage`. Il codice sorgente può essere pubblicato, ma **non distribuire l'app su un sito pubblico**: usala solo sulla tua macchina dietro `http://localhost`.

---

## Cosa fa

L'app si organizza in sei sezioni accessibili dalla nav superiore (`🏠 Home`, `🎯 Allenamento`, `📊 Analisi`, `📋 Attività`, `🧪 Allenamenti v2`, `🤖 Coach AI`):

- **🏠 Home** — profilo atleta, statistiche all-time da Strava, card "Precisione dati" che spiega come vengono stimati FTP e LTHR e quante attività hanno streams precisi (NP/TSS calcolati secondo-per-secondo) vs approssimati (da `weighted_average_watts` del summary). Bottone "Aggiorna con streams" per scaricare gli stream delle ultime N attività bici (default 40).
- **🎯 Allenamento** — consiglio del giorno (riposo / Z1 / Z2 / Sweet Spot / Soglia / VO2max / forza / mobilità / lunga) calcolato da: carico 7/28 gg, TSB (CTL-ATL), `hardsLast7`, dislivello, attività di forza recenti, stato del mesociclo. Pianificazione mese (4 settimane) e settimana corrente con calendario dei riposi marcabili (skip → pioggia → normale).
- **📊 Analisi** — Power-Duration Curve, trend forma (CTL/ATL/TSB ultimi 90 gg), distribuzione zone FC ultimo mese, **Power Profile** (deficit/punti di forza), **trend FTP** settimanale, **breakdown FTP/LTHR** (mostra esattamente quali attività e formule hanno determinato i valori usati nei calcoli), workout mirati per i tuoi segmenti.
- **📋 Attività** — lista delle ultime 15. Click → pagina di dettaglio (`activity.html`) con mappa Leaflet, splits per km, lista segmenti con badge KOM/PR.
- **🧪 Allenamenti v2** — motore "evidence-based": catalogo workout con citazioni esplicite (Seiler 4×8, Rønnestad 30/15, Coggan/Allen Sweet Spot, Hunter Allen Over-Unders). Mostra anche un confronto side-by-side v1 vs v2 per le 4 settimane.
- **🤖 Coach AI** — workout suggerito da un LLM **locale** via [Ollama](https://ollama.com). Il codice JS calcola tutto il contesto (FTP, LTHR, CTL/ATL/TSB, polarizzazione, ultime attività) e fa retrieval RAG su `papers_index.json` (10 paper di endurance science). Il modello sceglie un protocolId dal catalogo deterministico; tutta l'aritmetica (watt, durate) è fatta dal codice JS. Nessun dato lascia il tuo Mac.

Dettagli scientifici, formule e fonti: vedi **[METHODOLOGY.md](METHODOLOGY.md)**.

---

## 1. Setup Strava

1. Vai su <https://www.strava.com/settings/api> e crea un'applicazione.
2. Campi:
   - **Category**: qualsiasi (es. "Other")
   - **Website**: `http://localhost:5050`
   - **Authorization Callback Domain**: `localhost` ← fondamentale, deve essere `localhost` senza `http://` né porta
3. Prendi nota di **Client ID** e **Client Secret**.

## 2. Avvia l'app

ESM richiede un server HTTP locale (`file://` non funziona). Dalla cartella del progetto:

```bash
python3 -m http.server 5050
```

Apri <http://localhost:5050>. Alla prima visita inserisci Client ID e Client Secret → click su "Salva e collega Strava" → autorizza su Strava → torni all'app con profilo + ultime 60 attività caricate. Il `refresh_token` viene salvato; alle visite successive i dati si caricano direttamente.

---

## 3. Setup Coach AI (opzionale)

Il Coach AI richiede [Ollama](https://ollama.com) installato in locale.

```bash
# Installazione
brew install ollama

# Modelli necessari (~5 GB totali)
ollama pull qwen2.5:7b              # modello di chat (default, modificabile)
ollama pull nomic-embed-text         # embedding per il retrieval dei paper

# Permetti al browser di chiamarlo (CORS)
launchctl setenv OLLAMA_ORIGINS "http://localhost:5050,http://127.0.0.1:5050"
brew services restart ollama
```

Genera l'indice dei paper (richiede Node, ~10s, scarica abstract da PubMed e calcola embeddings via Ollama):

```bash
node build_papers_index.mjs
```

Lo script popola `papers_index.json` con 10 paper di endurance science (Seiler 2010/2013, Rønnestad 2014/2020, Vikmoen 2016, Mujika 2018, Laursen 2002, Buchheit 2013, Stoggl 2014, Almquist 2020). Va ri-eseguito solo se vuoi aggiornare le query in `SEARCHES[]`.

Nel tab `🤖 Coach AI` → "Impostazioni Ollama" puoi modificare endpoint e modello, e fare un ping per verificare.

---

## 4. Layout localStorage

Tutte le chiavi che l'app scrive (vedi `safeLoad`/`safeSave` in `strava.js`):

| Chiave | Tipo | Scritta da | Contenuto |
|---|---|---|---|
| `biketr_strava` | oggetto | OAuth setup, refresh | `{clientId, clientSecret, accessToken, refreshToken, expiresAt}` |
| `biketr_settings` | oggetto | form "Impostazioni zone/volume" | `{hrMax, hrLthr, ftpDeclared, weeklyHours, weeklyDays, longRides, weight, strengthLevel, lthrSource, ftpSource}` |
| `biketr_planned_rests` | array ISO date | calendario `🎯` view | giorni marcati come "skip" |
| `biketr_rainy_days` | array ISO date | toggle pioggia | giorni marcati come "pioggia" |
| `biketr_streams_cache` | oggetto | "Aggiorna con streams" | `{activityId: {NP, IF, TSS, hrZones, hrTSS, _fetched}}` |
| `biketr_segments_cache_v2` | oggetto | retrieve segmenti starred + hydrate | `{segmentId: {efforts[], _fetched, _segment}}` |
| `biketr_mesocycle` | oggetto | `initMesocycle` | `{blockId, startDate, blockIndex, weekInBlock, blockHistory[], ftpHistory[]}` |
| `biketr_ftp_history` | array | `recordFtpPoint` settimanale | `[{ftp, date, source, meso}, ...]` max 52 entries |
| `biketr_coach_settings` | oggetto | tab Coach AI | `{endpoint, model, lastDuration}` |

Se una chiave è corrotta (JSON parse fallisce o validator rifiuta), viene salvato un backup `chiave.broken` e ripristinati i default — c'è un warning in console.

**Reset totale**: dal footer "Disconnetti / reset" si cancellano solo le credenziali Strava. Per reset completo: `DevTools → Application → Local Storage → Clear all`.

---

## 5. Configurazione runtime

Modificabili a mano via `localStorage` o da `constants.js` (`APP_CONFIG`):

- `maxStreamsFetch` (default 40) — quante attività bici scaricare con streams quando premi "Aggiorna con streams".
- `maxSegmentsHydrate` (default 30) — quante attività analizzare per estrarre `segment_efforts` quando premi "Completa da dettagli attività".
- `ollamaTimeoutMs` (default 180000 = 3 min) — timeout su ogni chiamata a Ollama (embed + chat). Dopo questo limite l'UI riporta errore invece di restare bloccata.

---

## 6. Architettura

ESM, nessun bundler. Catena di moduli:

```
constants.js   ← solo costanti PHYSIO / TYPE_WEIGHTS / APP_CONFIG
strava.js      ← OAuth, fetch API Strava, storage (safeLoad/safeSave), utility fmt/escape
training.js    ← motore v1: resolveHr, recommend, mesocicli, buildMonthPlan, isHard…
training_v2.js ← catalogo workout evidence-based (Seiler, Rønnestad, Coggan…)
analysis.js    ← power curve, CTL/ATL/TSB, zone FC, power profile, FTP trend
predictions.js ← segmenti starred, estimatesFromSegments, regressione tempo
coach.js       ← Coach AI (Ollama RAG + catalogo deterministico)
app.js         ← entry point: routing view, render UI, orchestrazione fetch
activity.js    ← entry point della pagina dettaglio (activity.html)
```

`index.html` carica solo `app.js`, `activity.html` solo `activity.js`. Tutti gli altri moduli vengono risolti via `import` statici.

---

## 7. Limitazioni note

- **Solo locale, solo single-user**: niente backend, niente sync cross-device, niente multi-utente. Tutto vive nel browser.
- **Client secret in localStorage**: rischio se condividi la macchina o esponi l'app online. Non farlo.
- **Senza streams Strava**, TSS e tempo-in-zona sono approssimati dal `weighted_average_watts` del summary o da hrTSS calcolato sulla FC media (perde un long Z2 + 20' soglia → media Z2). Premi "Aggiorna con streams" per il calcolo preciso, 1 chiamata API per attività (rate limit Strava: 100/15 min).
- **FTP da test dedicato è sempre più affidabile** delle stime: le 4 metodiche di `estimatesFromSegments` mitigano il problema ma non eliminano l'errore (± 5–10% rispetto al valore vero). Test 20' all-out ogni 4–6 settimane consigliato.
- **Coach AI dipende da Ollama**: se il daemon non risponde, il tab mostra errore. Vedi sezione 3 per il setup.

---

## Reset

Footer della home: "Disconnetti / reset" cancella le credenziali. Per pulizia totale: `DevTools → Application → Local Storage → "Clear All"`.
