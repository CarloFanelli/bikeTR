import { describe, expect, it } from 'vitest';
import type { CoachStatus, CoachWorkout, ConnectionCheck } from '../../src/core/coach-types.ts';
import {
  checkLine, coachProfile, dataLine, errorHeading, metaLine, modelLine, openingDuration, paperCitation, ridesNotes,
  spendingLine,
} from '../../src/core/coach-view.ts';
import type { HrProfile } from '../../src/core/hr.ts';

describe('testi del Coach', () => {
  it('profilo atleta: i valori mancanti viaggiano come null', () => {
    const hr = { ftp: 250, hrLthr: null, hrMax: undefined } as HrProfile;
    expect(coachProfile(hr, { weight: 72, weeklyHours: 0 })).toEqual({
      ftp: 250, lthr: null, hrMax: null, weight: 72, weeklyHours: null, weeklyDays: null,
    });
  });

  it('citazione del paper', () => {
    expect(paperCitation({ pmid: '123', authors: 'Seiler S', year: '2010', title: 'What is best practice?' }))
      .toBe('Seiler S (2010). What is best practice?');
  });

  it('note sulle corse: salvate e senza dettagli, nessuna nota nel caso normale', () => {
    expect(ridesNotes({ fromSaved: false, downloadedAt: null, missingDetails: 0 })).toEqual([]);
    const notes = ridesNotes({ fromSaved: true, downloadedAt: '2026-11-06T18:30:00', missingDetails: 3 });
    expect(notes).toEqual([
      '⚠️ Strava non raggiungibile: uso le corse salvate il 06/11/26, 18:30.',
      'ℹ️ 3 uscite senza dettagli secondo per secondo: per loro uso le cifre di riepilogo.',
    ]);
  });

  it('riga finale con locale o cloud, modello, secondi, token letti e scritti e costo del cloud', () => {
    const w = {
      provider: 'ollama', model: 'qwen2.5:7b', seconds: 12, inputTokens: 1820, outputTokens: 812, cost: null,
    } as CoachWorkout;
    expect(metaLine(w)).toBe('⚡ locale · qwen2.5:7b · 12.0s · token: 1820 in, 812 out');
    expect(metaLine({ ...w, provider: 'cloud', model: 'claude-opus-5-5', cost: 0.01764 }))
      .toBe('⚡ cloud · claude-opus-5-5 · 12.0s · token: 1820 in, 812 out · costo: $0.0176');
  });

  it('token e costo mostrati come — quando il provider non li dice; anche 0 resta 0', () => {
    const w = { provider: 'cloud', model: 'm', seconds: 3, inputTokens: null, outputTokens: 0, cost: null } as CoachWorkout;
    expect(metaLine(w)).toBe('⚡ cloud · m · 3.0s · token: — in, 0 out · costo: —');
    expect(metaLine({ ...w, inputTokens: 100, cost: 0.0004 })).toBe('⚡ cloud · m · 3.0s · token: 100 in, 0 out · costo: $0.0004');
    expect(metaLine({ ...w, cost: 0 })).toContain('· costo: $0.0000');
  });

  it('durata di partenza: l\'ultima chiesta, portata tra 30 e 240; 60 se manca', () => {
    expect([20, 29, 30, 45, 240, 300].map(openingDuration)).toEqual([30, 30, 30, 45, 240, 240]);
    expect([undefined, 0, '45'].map(openingDuration)).toEqual([60, 60, 60]);
  });

  it('titolo degli errori senza spiegazione propria', () => {
    expect(errorHeading('model')).toBe('Errore chiamata modello');
    expect(errorHeading()).toBe('Workout non generato');
  });
});

describe('modello del Coach in Impostazioni e nel Coach', () => {
  const ollama: CoachStatus = { provider: 'ollama', model: 'qwen2.5:7b' };
  const cloud: CoachStatus = { provider: 'cloud', model: 'claude-x', spent: 0, limit: 5 };

  it('locale o cloud e il nome del modello di .env', () => {
    expect(modelLine(ollama)).toBe('locale (Ollama) · qwen2.5:7b');
    expect(modelLine(cloud)).toBe('cloud · claude-x');
  });

  it('spesa e tetto solo per il cloud, $0.00 prima della prima risposta', () => {
    expect(spendingLine(ollama)).toBe('');
    expect(spendingLine(cloud)).toBe('Spesi $0.00 su un limite di $5.00');
    expect(spendingLine({ ...cloud, spent: 0.0033 })).toBe('Spesi $0.0033 su un limite di $5.00');
    expect(spendingLine({ ...cloud, spent: 1.256, limit: 0.5 })).toBe('Spesi $1.26 su un limite di $0.50');
  });

  it('i dati escono dal computer solo con un modello cloud', () => {
    expect(dataLine(ollama)).toBe('Modello locale qwen2.5:7b (Ollama): tutto resta sul tuo computer, niente cloud.');
    expect(dataLine(cloud)).toBe('Modello cloud claude-x: questi dati vengono inviati al provider cloud.');
  });

  it('esito della verifica della connessione', () => {
    const check: ConnectionCheck = { provider: 'cloud', model: 'claude-x', found: true, command: null };
    expect(checkLine(check)).toBe('✅ Il provider risponde, accetta la chiave e ha claude-x.');
    expect(checkLine({ ...check, found: false }))
      .toBe('⚠️ Il provider risponde e accetta la chiave, ma claude-x non è nel suo elenco: controlla CLOUD_MODEL in .env.');
    const local: ConnectionCheck = { provider: 'ollama', model: 'qwen2.5:7b', found: true, command: null };
    expect(checkLine(local)).toBe('✅ Ollama risponde e ha qwen2.5:7b.');
    expect(checkLine({ ...local, found: false, command: 'ollama pull qwen2.5:7b' })).toBe('⚠️ qwen2.5:7b mancante in Ollama: scaricalo con');
  });
});
