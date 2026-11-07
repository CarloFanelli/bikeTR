<script setup lang="ts">
// Il modello chat che il Coach usa (scelto nel .env del servizio), la spesa per un modello
// cloud, la verifica della connessione e come usare l'Ollama installato sul computer.
import { onMounted, ref } from 'vue';
import {
  VAlert, VBtn, VCard, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels,
} from 'vuetify/components';
import type { CoachStatus, ConnectionCheck } from '../core/coach-types.ts';
import { checkLine, modelLine, spendingLine } from '../core/coach-view.ts';
import { checkConnection, coachStatus, type CoachAnswer } from '../data/coach.ts';

const status = ref<CoachAnswer<CoachStatus> | null>(null);
const check = ref<CoachAnswer<ConnectionCheck> | null>(null);
const checking = ref(false);

onMounted(async () => {
  status.value = await coachStatus();
});

async function verify(): Promise<void> {
  checking.value = true;
  check.value = await checkConnection();
  checking.value = false;
}
</script>

<template>
  <VCard>
    <VCardTitle>Coach AI</VCardTitle>
    <VCardText>
      <p v-if="status?.ok">
        Modello chat: <b>{{ modelLine(status.value) }}</b>
        <span v-if="spendingLine(status.value)" class="d-block">{{ spendingLine(status.value) }}</span>
      </p>
      <p v-else-if="status" class="text-error">{{ status.msg }}</p>
      <p class="text-caption text-medium-emphasis mb-3">
        Il modello si sceglie nel file <code>.env</code> (righe d'esempio in <code>.env.example</code>), poi
        <code>docker compose up -d</code>.
      </p>
      <VBtn variant="tonal" :loading="checking" @click="verify">Verifica connessione</VBtn>
      <VAlert v-if="check?.ok" :type="check.value.found ? 'success' : 'warning'" variant="tonal" class="mt-4">
        {{ checkLine(check.value) }} <code v-if="check.value.command">{{ check.value.command }}</code>
      </VAlert>
      <VAlert v-else-if="check" type="error" variant="tonal" class="mt-4">{{ check.msg }}</VAlert>

      <VExpansionPanels class="mt-4">
        <VExpansionPanel title="Usare l'Ollama installato sul computer">
          <template #text>
            <p class="mb-2">
              Di default il Coach usa l'Ollama avviato da Docker: non serve configurare nulla. L'indirizzo di Ollama
              si cambia solo nel file <code>.env</code>. Al primo avvio Docker scarica il modello chat (circa 5 GB);
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
              Scarica il modello chat sul computer con <code>ollama pull qwen2.5:7b</code>. Se la verifica non
              risponde, avvia Ollama in ascolto su tutte le
              interfacce: <code>OLLAMA_HOST=0.0.0.0 ollama serve</code>.
            </p>
          </template>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCardText>
  </VCard>
</template>
