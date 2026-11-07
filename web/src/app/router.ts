// Indirizzi della nuova app. Stanno dopo il # dell'indirizzo, come le sezioni dell'app
// di oggi: funzionano sotto /nuova/ e poi sotto / senza cambiare nginx.

import { createRouter, createWebHashHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    title: string;
    // La stessa sezione nell'app di oggi, finché questa non è rifatta.
    legacy?: string;
  }
}

const notYet = () => import('../screens/NotYetScreen.vue');

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'home', component: notYet, meta: { title: 'Home', legacy: '/#home' } },
  { path: '/allenamento', name: 'allenamento', component: notYet, meta: { title: 'Allenamento', legacy: '/#training' } },
  { path: '/analisi', name: 'analisi', component: notYet, meta: { title: 'Analisi', legacy: '/#analysis' } },
  { path: '/attivita', name: 'attivita', component: notYet, meta: { title: 'Attività', legacy: '/#activities' } },
  {
    path: '/attivita/:id', name: 'attivita-dettaglio', component: notYet,
    meta: { title: 'Dettaglio attività', legacy: '/activity.html' },
  },
  { path: '/coach', name: 'coach', component: notYet, meta: { title: 'Coach AI', legacy: '/#coach' } },
  {
    path: '/impostazioni', name: 'impostazioni', component: () => import('../screens/SettingsScreen.vue'),
    meta: { title: 'Impostazioni' },
  },
  // Un indirizzo sconosciuto, per esempio con un errore di battitura, apre Home.
  { path: '/:unknown(.*)*', redirect: '/home' },
];

export const createAppRouter = (history: RouterHistory = createWebHashHistory()) => createRouter({ history, routes });
