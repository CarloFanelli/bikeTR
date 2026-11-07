// Indirizzi della nuova app. Stanno dopo il # dell'indirizzo, come le sezioni dell'app
// di oggi: funzionano sotto /nuova/ e poi sotto / senza cambiare nginx.

import { createRouter, createWebHashHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';

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
    path: '/impostazioni', name: 'impostazioni', component: () => import('../screens/SettingsScreen.vue'),
    meta: { title: 'Impostazioni' },
  },
  // Un indirizzo sconosciuto, per esempio con un errore di battitura, apre Home.
  { path: '/:unknown(.*)*', redirect: '/home' },
];

export const createAppRouter = (history: RouterHistory = createWebHashHistory()) => createRouter({ history, routes });
