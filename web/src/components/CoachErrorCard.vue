<script setup lang="ts">
// Errore del Coach: FTP mancante e ricerca dei paper hanno la loro spiegazione, gli
// altri mostrano il messaggio del servizio. Modello e "Ping Ollama" stanno in Impostazioni.
import { RouterLink } from 'vue-router';
import type { CoachRefusal } from '../core/coach-types.ts';
import { errorHeading } from '../core/coach-view.ts';

defineProps<{ refusal: CoachRefusal }>();

const settings = { name: 'impostazioni' };
</script>

<template>
  <div class="coach-error">
    <template v-if="refusal.error === 'no_ftp'">
      <b>❌ FTP non disponibile</b>
      <p class="my-2">Il Coach AI ha bisogno della FTP per calcolare i watt target.</p>
      <p class="hint text-medium-emphasis">
        Vai su <RouterLink :to="settings">Impostazioni</RouterLink> → <b>Zone e soglie</b> e dichiara l'FTP, oppure registra qualche attività con power meter su Strava.
      </p>
    </template>
    <template v-else-if="refusal.error === 'retrieval'">
      <b>❌ Errore retrieval paper</b>
      <p class="my-2">{{ refusal.message }}</p>
      <p class="hint text-medium-emphasis">Verifica:</p>
      <ul class="hint text-medium-emphasis">
        <li>Indice paper presente? Se <code>papers_index.json</code> manca, ripristinalo da git: <code>git restore papers_index.json</code></li>
        <li>Indice codificato con un altro modello di ricerca? Il messaggio qui sopra dà il comando che lo ricodifica.</li>
      </ul>
    </template>
    <template v-else>
      <b>❌ {{ errorHeading(refusal.error) }}</b>
      <p class="my-2">{{ refusal.message }}</p>
    </template>
  </div>
</template>

<style scoped>
.coach-error {
  padding: 1rem 1.25rem;
  border-left: 3px solid rgb(var(--v-theme-error));
  border-radius: 8px;
  background: #2a1a1a;
}

.hint {
  font-size: 0.85rem;
}

ul.hint {
  padding-left: 1.2rem;
}

code {
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: #0f1115;
  font-size: 0.85rem;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
