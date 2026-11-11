// I due temi dell'app, chiaro e scuro, nello stile "editoriale": fondo caldo, un colore
// d'accento per i comandi, divisori sottili. Vuetify sceglie fra i due quando il tema è "system".
// Ogni sezione ha il suo colore (`section-…`) per titoli, icone dei titoli e voce della barra:
// almeno 4,5:1 sul fondo delle card in tutti e due i temi.
// Oltre ai colori di Vuetify: `subtle` (riquadri dentro una card), `muted` (testo
// secondario e tacche dei grafici), `grid` (righe dei grafici), i tipi di carico del grafico
// (`load-…`) e le serie degli altri grafici (`series-…`, `series-z1`…`z5` per le zone FC).
// Ogni carico e ogni serie arriva almeno a 3:1 sul fondo delle card, in tutti e due i temi.

import type { ThemeDefinition } from 'vuetify';

const light: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#F6F5F2', surface: '#FFFFFF', 'on-background': '#16181B', 'on-surface': '#16181B',
    primary: '#1D4ED8', secondary: '#16181B', info: '#1D4ED8',
    error: '#B91C1C', success: '#166534', warning: '#92400E',
    subtle: '#EFEDE8', muted: '#5E6670', grid: '#E4E2DC',
    'load-easy': '#15803D', 'load-hard': '#DC2626', 'load-long': '#B45309', 'load-cross': '#7C3AED',
    'load-rest': '#78716C',
    'series-green': '#15803D', 'series-red': '#DC2626', 'series-orange': '#C2410C', 'series-gold': '#A16207',
    'series-z1': '#4D7C0F', 'series-z2': '#15803D', 'series-z3': '#A16207', 'series-z4': '#C2410C', 'series-z5': '#9F1239',
    'section-home': '#1D4ED8', 'section-allenamento': '#15803D', 'section-analisi': '#7C3AED',
    'section-attivita': '#C2410C', 'section-coach': '#0F766E', 'section-libreria': '#A16207',
  },
};

const dark: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#111214', surface: '#1A1C20', 'on-background': '#ECEBE7', 'on-surface': '#ECEBE7',
    primary: '#8AB4FF', secondary: '#ECEBE7', info: '#8AB4FF',
    error: '#FF6B6B', success: '#4ADE80', warning: '#FBBF24',
    subtle: '#23262B', muted: '#9AA0AA', grid: '#2C2F36',
    'load-easy': '#4ADE80', 'load-hard': '#FF6B6B', 'load-long': '#FB923C', 'load-cross': '#A78BFA',
    'load-rest': '#8A8F98',
    'series-green': '#4ADE80', 'series-red': '#FF6B6B', 'series-orange': '#FB923C', 'series-gold': '#FACC15',
    'series-z1': '#A3E635', 'series-z2': '#4ADE80', 'series-z3': '#FACC15', 'series-z4': '#FB923C', 'series-z5': '#FB7185',
    'section-home': '#8AB4FF', 'section-allenamento': '#4ADE80', 'section-analisi': '#C4B5FD',
    'section-attivita': '#FB923C', 'section-coach': '#2DD4BF', 'section-libreria': '#FACC15',
  },
};

export const THEMES = { light, dark };
