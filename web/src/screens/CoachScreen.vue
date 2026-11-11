<script setup lang="ts">
// Coach AI: chiede al servizio Coach il workout di oggi e mostra il passo in corso, poi il
// risultato o l'errore. La richiesta sta in app/coach-run.ts: continua anche cambiando
// sezione, e Stop la interrompe. In fondo, chiuso, "Dietro le quinte": il contesto inviato,
// il testo del modello mentre lo scrive, la risposta grezza, i paper trovati e i tempi.
import { mdiStop } from '@mdi/js';
import { computed, onMounted, ref } from 'vue';
import {
  VBtn, VCard, VCardText, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle, VProgressCircular,
  VTextField,
} from 'vuetify/components';
import { coachRun as run, generateWorkout, stopWorkout } from '../app/coach-run.ts';
import { hrProfile } from '../app/session.ts';
import CoachErrorCard from '../components/CoachErrorCard.vue';
import CoachWorkoutCard from '../components/CoachWorkoutCard.vue';
import type { CoachStatus } from '../core/coach-types.ts';
import {
  MAX_DURATION, MIN_DURATION, coachProfile, dataLine, metaLine, openingDuration, paperCitation, pubmedUrl,
} from '../core/coach-view.ts';
import { withoutEmoji } from '../core/emoji.ts';
import { coachStatus, type CoachAnswer } from '../data/coach.ts';
import { loadCoachSettings, loadSettings, saveCoachSettings } from '../data/storage.ts';

const duration = ref(String(openingDuration(loadCoachSettings().lastDuration)));
// Il modello del .env del servizio: dice anche se i dati escono dal computer.
const status = ref<CoachAnswer<CoachStatus> | null>(null);
onMounted(async () => {
  status.value = await coachStatus();
});
const context = computed(() => (run.context == null ? '' : JSON.stringify(run.context, null, 2)));
// Prima della prima richiesta il contesto non esiste ancora: lo costruisce il servizio.
const started = computed(() => run.running || run.stopped || run.result != null || run.error != null);
const contextMissing = computed(() => {
  if (!started.value) return 'Nessuna richiesta ancora: il contesto compare quando generi un workout.';
  return run.running ? 'Il contesto arriva appena il servizio lo prepara…' : 'Contesto non disponibile.';
});
// Il testo del modello resta finché non arriva il risultato o un errore, anche dopo Stop.
const showLive = computed(() => run.live && !run.result && !run.error);

function generate() {
  if (run.running) return;
  const minutes = +duration.value || 60;
  saveCoachSettings({ lastDuration: minutes });
  void generateWorkout({
    duration: minutes,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    profile: coachProfile(hrProfile(), loadSettings()),
  });
}
</script>

<template>
  <div class="page-wide card-grid">
    <header class="span-all">
      <h1 class="text-h4">Coach AI</h1>
      <p v-if="status" class="text-medium-emphasis mt-1">{{ status.ok ? dataLine(status.value) : status.msg }}</p>
    </header>

    <VCard>
      <VCardText>
        <div class="d-flex flex-wrap align-center ga-3">
          <VTextField
            v-model="duration"
            type="number"
            label="Durata disponibile (min)"
            :min="MIN_DURATION"
            :max="MAX_DURATION"
            :step="5"
            hide-details
            class="duration"
          />
          <VBtn color="primary" class="action" min-height="44" :disabled="run.running" @click="generate">
            Genera workout di oggi
          </VBtn>
          <VBtn
            v-if="run.running"
            :prepend-icon="mdiStop"
            variant="outlined"
            color="error"
            class="action"
            min-height="44"
            @click="stopWorkout"
          >
            Stop
          </VBtn>
        </div>

        <div v-if="run.running" class="d-flex align-center ga-2 text-medium-emphasis mt-4" aria-live="polite">
          <VProgressCircular indeterminate size="18" width="2" />
          <span>{{ withoutEmoji(run.step) }}</span>
        </div>
        <p v-else-if="run.stopped" class="text-medium-emphasis mt-4">Richiesta interrotta</p>
      </VCardText>
    </VCard>

    <VCard v-if="run.error || run.result" class="span-2">
      <VCardText>
        <CoachErrorCard v-if="run.error" :refusal="run.error" />
        <CoachWorkoutCard v-if="run.result" :workout="run.result" />
      </VCardText>
    </VCard>

    <VExpansionPanels class="span-all">
      <VExpansionPanel elevation="0" class="backstage">
        <VExpansionPanelTitle>Dietro le quinte</VExpansionPanelTitle>
        <VExpansionPanelText>
          <h3 class="part">Contesto inviato al modello</h3>
          <pre v-if="context" class="coach-pre coach-ctx">{{ context }}</pre>
          <p v-else class="text-medium-emphasis text-body-2">
            {{ contextMissing }}
          </p>

          <template v-if="showLive">
            <h3 class="part">Testo del modello</h3>
            <pre class="coach-pre coach-live">{{ run.live }}</pre>
          </template>

          <template v-if="run.result">
            <h3 class="part">Risposta grezza del modello</h3>
            <pre class="coach-pre coach-ctx">{{ run.result.modelRaw }}</pre>

            <template v-if="run.result.retrievedPapers.length">
              <h3 class="part">Paper trovati dalla ricerca ({{ run.result.retrievedPapers.length }})</h3>
              <ul class="papers text-body-2">
                <li v-for="p in run.result.retrievedPapers" :key="p.pmid">
                  <a :href="pubmedUrl(p.pmid)" target="_blank" rel="noopener">{{ paperCitation(p) }}</a>{{ ' ' }}<span class="text-medium-emphasis">· punteggio {{ p.score.toFixed(3) }} · PMID {{ p.pmid }}</span>
                </li>
              </ul>
            </template>

            <h3 class="part">Modello e tempi</h3>
            <p class="text-body-2">{{ withoutEmoji(metaLine(run.result)) }}</p>
          </template>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
</template>

<style scoped>
.duration {
  flex: 0 1 220px;
  min-width: 180px;
}

.backstage {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.part {
  margin: 1rem 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.part:first-child {
  margin-top: 0;
}

.coach-pre {
  margin: 0;
  padding: 0.75rem;
  overflow: auto;
  border-radius: var(--radius-control);
  background: rgb(var(--v-theme-subtle));
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.coach-live {
  max-height: 240px;
}

.coach-ctx {
  max-height: 320px;
}

.papers {
  padding-left: 1.2rem;
}

.papers li {
  margin: 0.3rem 0;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
