<script setup lang="ts">
// Coach AI: chiede al servizio Coach il workout di oggi e mostra il passo in corso, il
// testo del modello mentre lo scrive, poi il risultato o l'errore. La richiesta sta in
// app/coach-run.ts: continua anche cambiando sezione, e Stop la interrompe.
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  VBtn, VCard, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
  VTextField,
} from 'vuetify/components';
import { coachRun as run, generateWorkout, stopWorkout } from '../app/coach-run.ts';
import { hrProfile } from '../app/session.ts';
import CoachErrorCard from '../components/CoachErrorCard.vue';
import CoachWorkoutCard from '../components/CoachWorkoutCard.vue';
import { coachProfile } from '../core/coach-view.ts';
import { COACH_DEFAULT_MODEL } from '../data/coach.ts';
import { loadCoachSettings, loadSettings, saveCoachSettings } from '../data/storage.ts';

const duration = ref(String(loadCoachSettings().lastDuration || 60));
const model = (loadCoachSettings().model || COACH_DEFAULT_MODEL).trim();
const context = computed(() => (run.context == null ? '' : JSON.stringify(run.context, null, 2)));
// Il testo del modello resta finché non arriva il risultato o un errore, anche dopo Stop.
const showLive = computed(() => run.live && !run.result && !run.error);

function generate() {
  const minutes = +duration.value || 60;
  saveCoachSettings({ lastDuration: minutes });
  void generateWorkout({
    duration: minutes,
    model,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    profile: coachProfile(hrProfile(), loadSettings()),
  });
}
</script>

<template>
  <VCard>
    <VCardTitle>🤖 Coach AI (Ollama locale)</VCardTitle>
    <VCardText>
      <p class="text-medium-emphasis mb-4">
        Workout suggerito da un LLM locale (Ollama) usando i tuoi dati: FTP, CTL/ATL/TSB, polarizzazione, ultime attività.
        Tutto resta sul tuo computer, niente cloud.
      </p>
      <div class="d-flex flex-wrap align-center ga-3">
        <VTextField
          v-model="duration"
          type="number"
          label="Durata disponibile (min)"
          :min="20"
          :max="240"
          :step="5"
          hide-details
          class="duration"
        />
        <VBtn color="primary" @click="generate">✨ Genera workout di oggi</VBtn>
        <VBtn v-if="run.running" variant="outlined" color="error" @click="stopWorkout">⏹ Stop</VBtn>
      </div>
      <p class="text-caption text-medium-emphasis mt-2">
        Modello {{ model }}: si cambia in <RouterLink :to="{ name: 'impostazioni' }">Impostazioni</RouterLink>.
      </p>

      <div class="mt-4">
        <div v-if="run.running" class="text-medium-emphasis">{{ run.step }}</div>
        <div v-else-if="run.stopped" class="text-medium-emphasis">⏹ Richiesta interrotta</div>
        <pre v-if="showLive" class="coach-pre coach-live">{{ run.live }}</pre>
        <CoachWorkoutCard v-if="run.result" :workout="run.result" />
        <CoachErrorCard v-else-if="run.error" :refusal="run.error" />
      </div>

      <VExpansionPanels class="mt-4">
        <VExpansionPanel>
          <VExpansionPanelTitle class="text-medium-emphasis">📋 Contesto inviato al modello</VExpansionPanelTitle>
          <VExpansionPanelText>
            <pre v-if="context" class="coach-pre coach-ctx">{{ context }}</pre>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCardText>
  </VCard>
</template>

<style scoped>
.duration {
  flex: 0 0 220px;
}

.coach-pre {
  margin: 0;
  padding: 0.75rem;
  overflow: auto;
  border-radius: 6px;
  background: #0f1115;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.coach-live {
  margin-top: 0.5rem;
  max-height: 240px;
}

.coach-ctx {
  max-height: 320px;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
