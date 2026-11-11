<script setup lang="ts">
// La sezione Coach di Impostazioni: il modello chat che il Coach usa (scelto nella
// configurazione del servizio), la spesa per un modello cloud, la verifica della connessione
// e come usare l'Ollama installato sul computer, nel pannello delle spiegazioni.
import { onMounted, ref } from 'vue';
import { VAlert, VBtn } from 'vuetify/components';
import type { CoachStatus, ConnectionCheck } from '../core/coach-types.ts';
import { checkLine, modelLine, spendingLine } from '../core/coach-view.ts';
import { SETTINGS_EXPLANATIONS as EXPLAIN } from '../core/explanations/settings.ts';
import { checkConnection, coachStatus, type CoachAnswer } from '../data/coach.ts';
import ErrorNotice from './ErrorNotice.vue';
import InfoLabel from './InfoLabel.vue';

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
  <section>
    <h2 class="section-title">Coach</h2>
    <p v-if="status?.ok" class="mb-1">
      <InfoLabel :topic="EXPLAIN.chatModel" />: <b>{{ modelLine(status.value) }}</b>
    </p>
    <p v-if="status?.ok && spendingLine(status.value)" class="mb-1">{{ spendingLine(status.value) }}</p>
    <ErrorNotice
      v-else-if="status && !status.ok"
      summary="Non riesco a leggere lo stato del Coach. Le altre impostazioni funzionano ancora."
      :detail="status.msg"
      class="mb-3"
    />
    <div class="d-flex flex-wrap align-center ga-4 mt-3">
      <VBtn variant="tonal" class="action" min-height="44" :loading="checking" @click="verify">Verifica connessione</VBtn>
      <InfoLabel :topic="EXPLAIN.ollama" />
    </div>
    <VAlert v-if="check?.ok" :type="check.value.found ? 'success' : 'warning'" variant="tonal" class="mt-4">
      {{ checkLine(check.value) }} <code v-if="check.value.command">{{ check.value.command }}</code>
    </VAlert>
    <ErrorNotice
      v-else-if="check"
      summary="La verifica della connessione non è riuscita. Puoi ripeterla con il pulsante qui sopra."
      :detail="check.msg"
      class="mt-4"
    />
  </section>
</template>

<style scoped>
.section-title {
  margin-bottom: 1rem;
  font-family: var(--v-font-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
</style>
