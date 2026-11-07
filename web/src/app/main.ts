// Avvio della nuova app: Vue, Vuetify (componenti, colori, icone, testi in italiano) e indirizzi.

import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { it } from 'vuetify/locale';
import 'vuetify/styles';
import App from '../App.vue';
import { authCallbackMessage } from '../data/auth.ts';
import { createAppRouter } from './router.ts';
import { session, startSession } from './session.ts';

const vuetify = createVuetify({
  // I colori dell'app di oggi: sfondo scuro, arancione Strava.
  theme: {
    defaultTheme: 'biketr',
    themes: {
      biketr: {
        dark: true,
        colors: {
          background: '#0f1115', surface: '#1a1d24', primary: '#fc5200',
          error: '#ff6b6b', success: '#4ade80', warning: '#ffc98a',
        },
      },
    },
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  locale: { locale: 'it', messages: { it } },
});

// Ritorno da Strava con un errore: il messaggio si vede una volta, una ricarica non lo ripete.
session.notice = authCallbackMessage(window.location.search);
if (session.notice) window.history.replaceState({}, '', window.location.pathname + window.location.hash);

createApp(App).use(vuetify).use(createAppRouter()).mount('#app');
void startSession();
