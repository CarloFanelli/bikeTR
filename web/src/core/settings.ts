// Le impostazioni dell'atleta (tab Impostazioni); un campo lasciato vuoto non viene salvato.
// I giorni della settimana sono numeri ISO: 1 = lunedì … 7 = domenica.
export interface Settings {
  hrMax?: number;
  hrLthr?: number;
  lthrSource?: string;
  ftpDeclared?: number;
  ftpSource?: string;
  weeklyHours?: number;
  weeklyDays?: number;
  longRides?: number;
  weight?: number;
  strengthLevel?: number;
  longRideMaxMin?: number;
  availableDays?: number[];
  longRideDays?: number[];
  raceDate?: string;
  raceName?: string;
  hasCompression?: boolean;
  hasMassageGun?: boolean;
}

// Campi numerici scritti a mano, con nome mostrato e limiti.
export const NUMBER_FIELDS = {
  hrMax: { label: 'FC max', min: 120, max: 220, step: 1 },
  hrLthr: { label: 'LTHR dichiarata', min: 100, max: 210, step: 1 },
  ftpDeclared: { label: 'FTP dichiarata (W)', min: 50, max: 500, step: 1 },
  weeklyHours: { label: 'Ore/sett. indicative', min: 1, max: 25, step: 0.5 },
  weeklyDays: { label: 'Giorni/sett. allenamento (inclusa lunga)', min: 2, max: 7, step: 1 },
  longRides: { label: 'Di cui uscite lunghe', min: 0, max: 3, step: 1 },
  weight: { label: 'Peso (kg)', min: 30, max: 150, step: 0.5 },
  longRideMaxMin: { label: 'Durata max uscita lunga (min)', min: 60, max: 420, step: 15 },
};
export type NumberField = keyof typeof NUMBER_FIELDS;

// I valori come stanno nei campi della schermata: i numeri scritti a mano sono testo.
export type SettingsForm = Record<NumberField, string> & {
  lthrSource: string;
  ftpSource: string;
  strengthLevel: number;
  availableDays: number[];
  longRideDays: number[];
  raceDate: string;
  raceName: string;
  hasCompression: boolean;
  hasMassageGun: boolean;
};

const text = (n: number | undefined): string => (n ? String(n) : '');
const sortedDays = (days: number[]): number[] => [...days].sort((a, b) => a - b);

// I campi della schermata, con i default di oggi dove manca un valore salvato.
export function settingsForm(s: Settings): SettingsForm {
  return {
    hrMax: text(s.hrMax),
    hrLthr: text(s.hrLthr),
    lthrSource: s.lthrSource || (s.hrLthr ? 'declared' : 'estimated'),
    ftpDeclared: text(s.ftpDeclared),
    ftpSource: s.ftpSource || 'estimated',
    weeklyHours: String(s.weeklyHours || 6),
    weeklyDays: String(s.weeklyDays || 4),
    longRides: String(s.longRides ?? 1),
    weight: text(s.weight),
    strengthLevel: s.strengthLevel || 2,
    longRideMaxMin: text(s.longRideMaxMin),
    availableDays: s.availableDays || [1, 2, 3, 4, 5, 6, 7],
    longRideDays: s.longRideDays || [6],
    raceDate: s.raceDate || '',
    raceName: s.raceName || '',
    hasCompression: !!s.hasCompression,
    hasMassageGun: !!s.hasMassageGun,
  };
}

// Per ogni campo numerico compilato fuori dai limiti, il messaggio che nomina il campo.
export function settingsErrors(form: SettingsForm): Partial<Record<NumberField, string>> {
  const errors: Partial<Record<NumberField, string>> = {};
  for (const key of Object.keys(NUMBER_FIELDS) as NumberField[]) {
    const { label, min, max } = NUMBER_FIELDS[key];
    const raw = form[key].trim();
    const value = Number(raw);
    if (raw && !(value >= min && value <= max)) errors[key] = `${label}: tra ${min} e ${max}.`;
  }
  return errors;
}

// Le impostazioni da salvare, con le chiavi, l'ordine e i default che usa l'app di oggi.
export function settingsFromForm(form: SettingsForm): Settings {
  return {
    hrMax: +form.hrMax || undefined,
    hrLthr: +form.hrLthr || undefined,
    weeklyHours: +form.weeklyHours || 6,
    weeklyDays: +form.weeklyDays || 4,
    longRides: +form.longRides || 0,
    weight: +form.weight || undefined,
    strengthLevel: +form.strengthLevel || 2,
    ftpDeclared: +form.ftpDeclared || undefined,
    lthrSource: form.lthrSource,
    ftpSource: form.ftpSource,
    availableDays: sortedDays(form.availableDays),
    longRideDays: sortedDays(form.longRideDays),
    longRideMaxMin: +form.longRideMaxMin || undefined,
    raceDate: form.raceDate || undefined,
    raceName: form.raceName.trim() || undefined,
    hasCompression: form.hasCompression,
    hasMassageGun: form.hasMassageGun,
  };
}
