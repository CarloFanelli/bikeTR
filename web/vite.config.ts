import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Server di sviluppo dell'app: nginx (http://localhost:5050) gli inoltra le pagine e la
// connessione del live reload, sulla rete interna di Docker.
export default defineConfig({
  plugins: [vue()],
  // Solo file veri: un indirizzo che non esiste risponde 404, non con una pagina dell'app.
  appType: 'mpa',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Dai file montati da macOS e Windows non arriva l'avviso di modifica: si controllano a intervalli.
    watch: { usePolling: true },
  },
});
