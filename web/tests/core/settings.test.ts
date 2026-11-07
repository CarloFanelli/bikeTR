import { describe, expect, it } from 'vitest';
import { settingsErrors, settingsForm, settingsFromForm, type SettingsForm } from '../../src/core/settings.ts';

// Come li salva oggi "Salva impostazioni" (stesse chiavi, stesso ordine, campi vuoti assenti).
const saved = (form: SettingsForm) => JSON.stringify(settingsFromForm(form));

describe('impostazioni dell\'atleta', () => {
  it('senza impostazioni salvate: i default di oggi', () => {
    expect(settingsForm({})).toEqual({
      hrMax: '', hrLthr: '', lthrSource: 'estimated', ftpDeclared: '', ftpSource: 'estimated',
      weeklyHours: '6', weeklyDays: '4', longRides: '1', weight: '', strengthLevel: 2, longRideMaxMin: '',
      availableDays: [1, 2, 3, 4, 5, 6, 7], longRideDays: [6], raceDate: '', raceName: '',
      hasCompression: false, hasMassageGun: false,
    });
  });

  it('una soglia dichiarata senza sorgente scelta vale come dichiarata', () => {
    expect(settingsForm({ hrLthr: 172 }).lthrSource).toBe('declared');
    expect(settingsForm({ hrLthr: 172, lthrSource: 'estimated' }).lthrSource).toBe('estimated');
  });

  it('salvare senza toccare nulla scrive quello che scriverebbe l\'app di oggi', () => {
    expect(saved(settingsForm({}))).toBe('{"weeklyHours":6,"weeklyDays":4,"longRides":1,"strengthLevel":2,'
      + '"lthrSource":"estimated","ftpSource":"estimated","availableDays":[1,2,3,4,5,6,7],"longRideDays":[6],'
      + '"hasCompression":false,"hasMassageGun":false}');
  });

  it('ogni impostazione torna uguale dopo il salvataggio, nell\'ordine di oggi', () => {
    const all = {
      hrMax: 190, hrLthr: 172, weeklyHours: 7.5, weeklyDays: 5, longRides: 2, weight: 72.5, strengthLevel: 3,
      ftpDeclared: 250, lthrSource: 'declared', ftpSource: 'hr', availableDays: [1, 3, 5, 6], longRideDays: [6, 7],
      longRideMaxMin: 240, raceDate: '2027-05-09', raceName: 'Granfondo X', hasCompression: true, hasMassageGun: true,
    };
    expect(saved(settingsForm(all))).toBe(JSON.stringify(all));
  });

  it('campi vuoti: assenti, oppure i default di oggi', () => {
    const form = {
      ...settingsForm({}), weeklyHours: '', weeklyDays: '', longRides: '', raceName: '   ', availableDays: [],
    };
    expect(settingsFromForm(form)).toEqual({
      weeklyHours: 6, weeklyDays: 4, longRides: 0, strengthLevel: 2, lthrSource: 'estimated', ftpSource: 'estimated',
      availableDays: [], longRideDays: [6], hasCompression: false, hasMassageGun: false,
    });
  });

  it('i giorni si salvano in ordine, comunque siano stati scelti', () => {
    const form = { ...settingsForm({}), availableDays: [6, 1, 3], longRideDays: [7, 6] };
    expect(settingsFromForm(form)).toMatchObject({ availableDays: [1, 3, 6], longRideDays: [6, 7] });
  });

  it('il nome dell\'evento si salva senza spazi ai lati', () => {
    expect(settingsFromForm({ ...settingsForm({}), raceName: '  Granfondo X ' }).raceName).toBe('Granfondo X');
  });
});

describe('limiti delle impostazioni', () => {
  const errorsFor = (changes: Partial<SettingsForm>) => settingsErrors({ ...settingsForm({}), ...changes });

  it('valori vuoti o dentro i limiti: nessun errore', () => {
    expect(errorsFor({})).toEqual({});
    expect(errorsFor({
      hrMax: '120', hrLthr: '210', ftpDeclared: '50', weeklyHours: '25', weeklyDays: '2', longRides: '0',
      weight: '150', longRideMaxMin: '420',
    })).toEqual({});
  });

  it('un valore fuori dai limiti nomina il campo', () => {
    expect(errorsFor({ hrMax: '221', weeklyDays: '1' })).toEqual({
      hrMax: 'FC max: tra 120 e 220.',
      weeklyDays: 'Giorni/sett. allenamento (inclusa lunga): tra 2 e 7.',
    });
    expect(errorsFor({ hrLthr: '99' }).hrLthr).toBe('LTHR dichiarata: tra 100 e 210.');
    expect(errorsFor({ ftpDeclared: '501' }).ftpDeclared).toBe('FTP dichiarata (W): tra 50 e 500.');
    expect(errorsFor({ weeklyHours: '0.5' }).weeklyHours).toBe('Ore/sett. indicative: tra 1 e 25.');
    expect(errorsFor({ longRides: '4' }).longRides).toBe('Di cui uscite lunghe: tra 0 e 3.');
    expect(errorsFor({ weight: '29.5' }).weight).toBe('Peso (kg): tra 30 e 150.');
    expect(errorsFor({ longRideMaxMin: '30' }).longRideMaxMin).toBe('Durata max uscita lunga (min): tra 60 e 420.');
  });

  it('zero e testo non numerico sono fuori dai limiti', () => {
    expect(errorsFor({ hrMax: '0', weight: 'abc' })).toEqual({
      hrMax: 'FC max: tra 120 e 220.', weight: 'Peso (kg): tra 30 e 150.',
    });
  });
});
