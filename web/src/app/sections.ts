// Le sezioni dell'app: nome, indirizzo, icona e colore (`section-…` del tema). Le leggono la
// barra in alto, la barra in basso dei telefoni e il colore della pagina aperta. Libreria è
// usata meno spesso: sui telefoni sta nel menu dell'atleta invece che nella barra in basso.
import { mdiBike, mdiBookshelf, mdiChartLine, mdiCreationOutline, mdiHomeOutline, mdiMapMarkerPath } from '@mdi/js';

export interface Section {
  title: string;
  to: string;
  icon: string;
  color: string;
}

const section = (title: string, key: string, icon: string): Section => ({ title, to: `/${key}`, icon, color: `section-${key}` });

export const SECTIONS: readonly Section[] = [
  section('Home', 'home', mdiHomeOutline),
  section('Allenamento', 'allenamento', mdiBike),
  section('Analisi', 'analisi', mdiChartLine),
  section('Attività', 'attivita', mdiMapMarkerPath),
  section('Coach AI', 'coach', mdiCreationOutline),
  section('Libreria', 'libreria', mdiBookshelf),
];

export const BOTTOM_BAR = SECTIONS.filter(s => s.to !== '/libreria');

// La sezione di un percorso: anche il dettaglio di un'attività (/attivita/123) è "Attività".
// Impostazioni non è una sezione: null.
export function sectionOf(path: string): Section | null {
  return SECTIONS.find(s => path === s.to || path.startsWith(`${s.to}/`)) ?? null;
}
