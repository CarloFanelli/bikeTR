// Indirizzi dell'app, senza # (per esempio /analisi): per un indirizzo che non è un file
// Vite risponde con la pagina dell'app, e il router apre la sezione.

import { createRouter, createWebHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    title: string;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'home', component: () => import('../screens/HomeScreen.vue'), meta: { title: 'Home' } },
  {
    path: '/allenamento', name: 'allenamento', component: () => import('../screens/TrainingScreen.vue'),
    meta: { title: 'Allenamento' },
  },
  {
    path: '/analisi', name: 'analisi', component: () => import('../screens/AnalysisScreen.vue'),
    meta: { title: 'Analisi' },
  },
  {
    path: '/attivita', name: 'attivita', component: () => import('../screens/ActivitiesScreen.vue'),
    meta: { title: 'Attività' },
  },
  {
    path: '/attivita/:id', name: 'attivita-dettaglio', component: () => import('../screens/ActivityDetailScreen.vue'),
    meta: { title: 'Dettaglio attività' },
  },
  {
    path: '/coach', name: 'coach', component: () => import('../screens/CoachScreen.vue'),
    meta: { title: 'Coach AI' },
  },
  {
    path: '/libreria', name: 'libreria', component: () => import('../screens/LibraryScreen.vue'),
    meta: { title: 'Libreria' },
  },
  {
    path: '/impostazioni', name: 'impostazioni', component: () => import('../screens/SettingsScreen.vue'),
    meta: { title: 'Impostazioni' },
  },
  // Un indirizzo sconosciuto, per esempio con un errore di battitura, apre Home.
  { path: '/:unknown(.*)*', redirect: '/home' },
];

export const createAppRouter = (history: RouterHistory = createWebHistory()) => createRouter({ history, routes });

// Segnalibri di quando gli indirizzi stavano dopo il # ("#/analisi"): lo stesso indirizzo
// senza ("/analisi"); null se dopo il # non c'è un indirizzo.
export function addressFromHash(hash: string): string | null {
  return hash.startsWith('#/') ? hash.slice(1) : null;
}
