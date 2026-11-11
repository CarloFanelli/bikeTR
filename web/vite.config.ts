import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Server di sviluppo dell'app: nginx (http://localhost:5050) gli inoltra le pagine e la
// connessione del live reload, sulla rete interna di Docker.
export default defineConfig({
  plugins: [vue()],
  // Un indirizzo che non è un file (/analisi, /attivita/123) riceve la pagina dell'app: il
  // router apre la sezione, o Home se l'indirizzo non esiste. File mancanti restano 404.
  appType: 'spa',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Dai file montati da macOS e Windows non arriva l'avviso di modifica: si controllano a intervalli.
    watch: { usePolling: true },
  },
});
