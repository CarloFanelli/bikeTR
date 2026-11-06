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
