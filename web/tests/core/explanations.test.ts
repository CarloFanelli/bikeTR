import { describe, expect, it } from 'vitest';
import { ANALYSIS_EXPLANATIONS } from '../../src/core/explanations/analysis.ts';
import { errorTopic, fallbackTopic, workoutWhyTopic } from '../../src/core/explanations/coach.ts';
import { CHART_EXPLANATIONS } from '../../src/core/explanations/charts.ts';
import { HOME_EXPLANATIONS, levelTopic } from '../../src/core/explanations/home.ts';
import { SETTINGS_EXPLANATIONS } from '../../src/core/explanations/settings.ts';
import { loadSourceTopic, recoveryWeekTopic, TRAINING_EXPLANATIONS } from '../../src/core/explanations/training.ts';
import type { Explanation } from '../../src/core/explanations/types.ts';

// Ogni modulo di spiegazioni dell'app entra in questo elenco.
const ALL: Record<string, Explanation> = {
  ...CHART_EXPLANATIONS,
  ...Object.fromEntries(Object.entries(ANALYSIS_EXPLANATIONS).map(([k, e]) => ['analysis.' + k, e])),
  ...TRAINING_EXPLANATIONS,
  coachWhy: workoutWhyTopic({ razionale: 'Sei fresco: due blocchi a soglia alzano la FTP.', paperRefs: [] }),
  coachFallback: fallbackTopic('Il modello ha scelto un protocollo inesistente.'),
  coachNoFtp: errorTopic({ error: 'no_ftp', message: 'FTP mancante' }),
  coachRetrieval: errorTopic({ error: 'retrieval', message: 'Indice dei paper non trovato.' }),
  coachModel: errorTopic({ error: 'model', message: 'Ollama non risponde.' }),
  loadSourcePower: loadSourceTopic({ ftp: 250, hrLthr: 170 }),
  loadSourceHr: loadSourceTopic({ ftp: null, hrLthr: 170 }),
  loadSourceHrMax: loadSourceTopic({ ftp: null, hrLthr: null }),
  recoveryWeek: recoveryWeekTopic(4),
  ...Object.fromEntries(Object.entries(SETTINGS_EXPLANATIONS).map(([k, e]) => ['settings.' + k, e])),
  ...Object.fromEntries(Object.entries(HOME_EXPLANATIONS).map(([k, e]) => ['home.' + k, e])),
  ...Object.fromEntries(['Base aerobica prioritaria. 1 sessione di qualità/sett, evita VO2max.', 'Piano polarizzato, intensità mirate, volume sostenuto.']
    .map((note, i) => [`level${i}`, levelTopic({ label: 'Livello', note }, [])])),
};

const sentences = (text: string) => text.split(/[.!?](?:\s|$)/).filter(s => s.trim()).length;
// Nomi da codice: funzioni con le parentesi, nomi file, parole come "estimateFTP" o "loadChart".
const CODE_LIKE = /\w\(|\.(?:ts|vue|js)\b|\b[a-z]{3,}[A-Z]/;

describe('spiegazioni', () => {
  it.each(Object.entries(ALL))('%s: popover di al massimo due frasi', (_, e) => {
    expect(sentences(e.short)).toBeGreaterThan(0);
    expect(sentences(e.short)).toBeLessThanOrEqual(2);
  });

  it.each(Object.entries(ALL))('%s: il pannello comincia con al massimo tre frasi semplici', (_, e) => {
    expect(sentences((e.lead ?? []).join(' '))).toBeLessThanOrEqual(3);
  });

  it.each(Object.entries(ALL))('%s: nessun nome da codice', (_, e) => {
    for (const text of [e.title, e.short, ...(e.lead ?? []), ...(e.technical ?? [])]) {
      expect(text).not.toMatch(CODE_LIKE);
    }
  });

  it('il controllo riconosce i nomi da codice', () => {
    expect('stimata con estimateFTP').toMatch(CODE_LIKE);
    expect('vedi load.ts').toMatch(CODE_LIKE);
    expect('si calcola con fn()').toMatch(CODE_LIKE);
    expect('senza potenza si usa l\'hrTSS').not.toMatch(CODE_LIKE);
  });

  it('senza FTP né LTHR il carico è il meno preciso e rimanda a Impostazioni', () => {
    expect(loadSourceTopic({ ftp: null, hrLthr: null }).short).toMatch(/meno preciso.*Impostazioni/);
  });
});
