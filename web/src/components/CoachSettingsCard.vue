<script setup lang="ts">
// Modello del Coach, "Ping Ollama" e come usare l'Ollama installato sul computer.
import { ref } from 'vue';
import {
  VAlert, VBtn, VCard, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels, VTextField,
} from 'vuetify/components';
import { COACH_DEFAULT_MODEL, pingOllama, type PingResult } from '../data/coach.ts';

const model = defineModel<string>({ required: true });
const ping = ref<PingResult | null>(null);
const pinging = ref(false);

async function checkOllama(): Promise<void> {
  pinging.value = true;
  ping.value = await pingOllama(model.value.trim() || COACH_DEFAULT_MODEL);
  pinging.value = false;
}
</script>

<template>
  <VCard>
    <VCardTitle>Coach AI (Ollama)</VCardTitle>
    <VCardText>
      <div class="d-flex flex-wrap align-center ga-4">
        <VTextField v-model="model" label="Modello" :placeholder="COACH_DEFAULT_MODEL" max-width="320" hide-details />
        <VBtn variant="tonal" :loading="pinging" @click="checkOllama">Ping Ollama</VBtn>
      </div>
      <VAlert v-if="ping?.ok" type="success" variant="tonal" class="mt-4">
        Ollama raggiungibile · modelli: <code>{{ ping.models.join(', ') || '(vuoto)' }}</code>
        <div v-for="m in ping.missing" :key="m.model">
          ⚠️ <b>{{ m.model }}</b> mancante: scaricalo con <code>{{ m.command }}</code>
        </div>
      </VAlert>
      <VAlert v-else-if="ping" type="error" variant="tonal" class="mt-4">{{ ping.msg }}</VAlert>

      <VExpansionPanels class="mt-4">
        <VExpansionPanel title="Usare l'Ollama installato sul computer">
          <template #text>
            <p class="mb-2">
              Di default il Coach usa l'Ollama avviato da Docker: non serve configurare nulla. L'indirizzo di Ollama
              si cambia solo nel file <code>.env</code>. Al primo avvio Docker scarica i modelli (circa 5 GB);
              l'avanzamento è in <code>docker compose logs -f ollama-pull</code>.
            </p>
            <p class="mb-2">
              Per usare invece un Ollama installato sul computer (per esempio per sfruttare la GPU del Mac), nel file
              <code>.env</code> togli il <code>#</code> da queste due righe ed esegui di nuovo
              <code>docker compose up -d</code>:
            </p>
            <pre class="mb-2">OLLAMA_CONTAINERS=0
OLLAMA_URL=http://host.docker.internal:11434</pre>
            <p>
              Scarica i modelli sul computer con <code>ollama pull qwen2.5:7b</code> e
              <code>ollama pull nomic-embed-text</code>. Se il Ping non risponde, avvia Ollama in ascolto su tutte le
              interfacce: <code>OLLAMA_HOST=0.0.0.0 ollama serve</code>.
            </p>
          </template>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCardText>
  </VCard>
</template>
