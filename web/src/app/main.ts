// Avvio dell'app: Vue, Vuetify (componenti, temi, caratteri, icone, testi in italiano) e indirizzi.

import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { it } from 'vuetify/locale';
import 'vuetify/styles';
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import './fonts.css';
import App from '../App.vue';
import { authCallbackMessage } from '../data/auth.ts';
import { loadThemeChoice } from '../data/storage.ts';
import { loadSegments } from './jobs.ts';
import { addressFromHash, createAppRouter } from './router.ts';
import { session, startSession } from './session.ts';
import { THEMES } from './theme.ts';

const vuetify = createVuetify({
  // Il tema scelto, o quello del computer ("system"), già alla prima schermata.
  theme: { defaultTheme: loadThemeChoice(), themes: THEMES },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  locale: { locale: 'it', messages: { it } },
});

// Ritorno da Strava con un errore: il messaggio si vede una volta, una ricarica non lo ripete.
session.notice = authCallbackMessage(window.location.search);
if (session.notice) window.history.replaceState({}, '', window.location.pathname);
// Un vecchio segnalibro con il # apre la stessa sezione, con l'indirizzo nuovo.
const oldAddress = addressFromHash(window.location.hash);
if (oldAddress) window.history.replaceState({}, '', oldAddress);

createApp(App).use(vuetify).use(createAppRouter()).mount('#app');
// Collegati, le previsioni sui segmenti si caricano subito: aggiornano anche le
// stime di FTP e soglia dai segmenti.
void startSession().then(() => {
  if (session.phase === 'ready') void loadSegments();
});
