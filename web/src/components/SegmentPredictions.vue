<script setup lang="ts">
// Previsioni sui segmenti preferiti: avanzamento del caricamento, "Completa da dettagli
// attività", il riepilogo con gli errori, e una card per segmento. Lo stato sta nel lavoro
// dei segmenti (app/jobs.ts): continua anche cambiando sezione. I nomi dei segmenti sono
// testo, come li ha scritti l'atleta.
import { computed } from 'vue';
import {
  VBtn, VCard, VCardSubtitle, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels, VExpansionPanelText,
  VExpansionPanelTitle,
} from 'vuetify/components';
import { clearSegmentsAndReload, completeSegments, segmentsJob as job } from '../app/jobs.ts';
import type { FormContext } from '../core/segments.ts';
import { diagLine, errorLines, formLine, predictionCards } from '../core/segments-view.ts';
import Sparkline from './Sparkline.vue';

const props = defineProps<{ formCtx: FormContext }>();

const cards = computed(() => (job.list ? predictionCards(job.list, props.formCtx) : []));
const busy = computed(() => job.loading || job.completing);
</script>

<template>
  <VCard>
    <VCardTitle>🔮 Previsioni sui tuoi segmenti preferiti</VCardTitle>
    <VCardSubtitle>Trend sugli ultimi 10 tentativi + tempo stimato al prossimo passaggio.</VCardSubtitle>
    <VCardText>
      <div v-if="job.error" class="text-medium-emphasis">{{ job.error }}</div>
      <div v-else-if="job.loading || !job.diag" class="text-medium-emphasis">{{ job.progress }}</div>
      <div class="d-flex flex-wrap align-center ga-3 my-2">
        <VBtn :loading="job.completing" :disabled="busy" variant="tonal" color="primary" @click="completeSegments">
          📦 Completa da dettagli attività (bypass /all_efforts)
        </VBtn>
        <span class="text-medium-emphasis">{{ job.completeProgress }}</span>
      </div>

      <template v-if="job.diag && job.list">
        <div class="d-flex flex-wrap align-center ga-2 text-caption text-medium-emphasis mb-2">
          {{ diagLine(job.diag) }}
          <VBtn size="x-small" variant="outlined" :disabled="busy" @click="clearSegmentsAndReload">
            🔄 Svuota cache e ricarica
          </VBtn>
        </div>
        <VExpansionPanels v-if="job.diag.errors.length" class="mb-3">
          <VExpansionPanel>
            <VExpansionPanelTitle class="text-medium-emphasis">
              ⚠️ {{ job.diag.errors.length }} errori (click per dettagli)
            </VExpansionPanelTitle>
            <VExpansionPanelText><pre class="errors">{{ errorLines(job.diag) }}</pre></VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>

        <p v-if="!cards.length" class="text-medium-emphasis">
          Nessun segmento preferito con tentativi. Metti una stella ⭐ ai tuoi segmenti su Strava e ricarica.
        </p>
        <template v-else>
          <p class="text-body-2 text-medium-emphasis mb-3">{{ formLine(formCtx) }}</p>
          <div class="pred-grid">
            <div v-for="card in cards" :key="card.id" class="pred-card">
              <a :href="`https://www.strava.com/segments/${card.id}`" target="_blank" rel="noopener" class="pred-name">
                {{ card.name }}
              </a>
              <span class="pred-meta text-medium-emphasis">{{ card.meta }}</span>
              <div class="pred-body">
                <Sparkline :points="card.points" :best="card.best" />
                <div class="pred-stats">
                  <div><span class="text-medium-emphasis">PR</span><b>{{ card.pr }}</b></div>
                  <div><span class="text-medium-emphasis">Ultimo</span><b>{{ card.last }}</b></div>
                  <div><span class="text-medium-emphasis">Tentativi</span><b>{{ card.attempts }}</b></div>
                  <div>
                    <span class="text-medium-emphasis">Trend</span><b :class="`trend-${card.trend.kind}`">{{ card.trend.text }}</b>
                  </div>
                </div>
              </div>
              <div class="pred-foot">
                <span class="text-medium-emphasis">Prossimo tentativo (≈2 sett., forma attuale):</span>{{ ' ' }}
                <b class="pred-value">{{ card.predicted }}</b>{{ ' ' }}
                <span class="text-medium-emphasis">· {{ card.vsBest }}</span>
                <span v-if="card.formAdj" :class="['form-adj', card.formAdj.good ? 'good' : 'bad']">{{ card.formAdj.text }}</span>
              </div>
            </div>
          </div>
        </template>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.errors {
  margin: 0;
  font-size: 0.7rem;
  white-space: pre-wrap;
}

.pred-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 0.75rem;
}

.pred-card {
  padding: 0.9rem;
  border: 1px solid #2a2e38;
  border-radius: 10px;
  background: #0f1115;
}

.pred-name {
  display: block;
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
  text-decoration: none;
}

.pred-name:hover {
  color: rgb(var(--v-theme-primary));
}

.pred-meta {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.8rem;
}

.pred-body {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.75rem;
  align-items: center;
  margin: 0.5rem 0;
}

.pred-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.3rem 0.5rem;
  font-size: 0.85rem;
}

.pred-stats > div {
  display: flex;
  flex-direction: column;
}

.pred-stats b {
  font-size: 1rem;
}

.trend-good {
  color: #4ade80;
}

.trend-bad {
  color: #ff6b6b;
}

.trend-neutral {
  color: #9aa0aa;
}

.pred-foot {
  padding-top: 0.5rem;
  border-top: 1px solid #2a2e38;
  font-size: 0.85rem;
}

.pred-value {
  color: rgb(var(--v-theme-primary));
  font-size: 1.05rem;
}

.form-adj {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.form-adj.good {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

.form-adj.bad {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}
</style>
