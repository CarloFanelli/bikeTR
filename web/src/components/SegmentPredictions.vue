<script setup lang="ts">
// Previsioni sui segmenti preferiti: avanzamento del caricamento, "Completa da dettagli
// attività", il riepilogo con gli errori, e una card per segmento. Lo stato sta nel lavoro
// dei segmenti (app/jobs.ts): continua anche cambiando sezione. I nomi dei segmenti sono
// testo, come li ha scritti l'atleta. Come leggere le previsioni sta nella spiegazione del titolo.
import { mdiFlagCheckered } from '@mdi/js';
import { computed } from 'vue';
import {
  VBtn, VCard, VCardText, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
} from 'vuetify/components';
import { clearSegmentsAndReload, completeSegments, loadSegments, segmentsJob as job } from '../app/jobs.ts';
import { splitEmoji, withoutEmoji } from '../core/emoji.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import type { FormContext } from '../core/segments.ts';
import { diagLine, errorLines, formLine, predictionCards } from '../core/segments-view.ts';
import CardHeading from './CardHeading.vue';
import ErrorNotice from './ErrorNotice.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';
import Sparkline from './Sparkline.vue';

const props = defineProps<{ formCtx: FormContext }>();

const cards = computed(() => (job.list ? predictionCards(job.list, props.formCtx) : []));
const busy = computed(() => job.loading || job.completing);
// L'esito del completamento comincia con ✅ o ❌: icona a linea, o l'avviso d'errore con "Riprova".
const completeLine = computed(() => ({
  ...splitEmoji(job.completeProgress),
  error: job.completeProgress.startsWith('❌'),
}));
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiFlagCheckered" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.segmentPredictions" label="Previsioni sui segmenti preferiti" /></CardHeading>
    <VCardText>
      <ErrorNotice
        v-if="job.error"
        summary="Non riesco a scaricare i tuoi segmenti preferiti da Strava. Il resto di Analisi funziona ancora."
        :detail="job.error"
        retry
        :busy="busy"
        class="mb-3"
        @retry="loadSegments"
      />
      <div v-else-if="job.loading || !job.diag" class="text-medium-emphasis">{{ job.progress }}</div>
      <div class="d-flex flex-wrap align-center ga-3 my-2">
        <VBtn :loading="job.completing" :disabled="busy" variant="tonal" color="primary" class="action" @click="completeSegments">
          Completa da dettagli attività
        </VBtn>
        <span v-if="job.completeProgress && !completeLine.error" class="d-flex align-center ga-2 text-medium-emphasis">
          <LineIcon v-if="completeLine.icon" :name="completeLine.icon" :size="18" />
          <span>{{ completeLine.text }}</span>
        </span>
      </div>
      <ErrorNotice
        v-if="completeLine.error"
        summary="Non riesco a scaricare i dettagli delle attività. Le previsioni già calcolate restano valide."
        :detail="job.completeProgress"
        retry
        :busy="busy"
        class="mb-3"
        @retry="completeSegments"
      />

      <template v-if="job.diag && job.list">
        <div class="d-flex flex-wrap align-center ga-2 text-caption text-medium-emphasis mb-2">
          {{ withoutEmoji(diagLine(job.diag)) }}
          <VBtn size="small" variant="outlined" :disabled="busy" class="action" @click="clearSegmentsAndReload">
            Svuota cache e ricarica
          </VBtn>
        </div>
        <VExpansionPanels v-if="job.diag.errors.length" class="mb-3">
          <VExpansionPanel>
            <VExpansionPanelTitle class="text-medium-emphasis">
              <span class="d-flex align-center ga-2"><LineIcon name="warning" :size="18" />{{ job.diag.errors.length }} errori</span>
            </VExpansionPanelTitle>
            <VExpansionPanelText><pre class="errors">{{ errorLines(job.diag) }}</pre></VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>

        <p v-if="!cards.length" class="text-medium-emphasis">
          Nessun segmento preferito con tentativi. Metti la stella ai tuoi segmenti su Strava e ricarica.
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
                    <span class="text-medium-emphasis">Trend</span><b :class="`trend-${card.trend.kind}`">{{ withoutEmoji(card.trend.text) }}</b>
                  </div>
                </div>
              </div>
              <div class="pred-foot">
                <span class="text-medium-emphasis">Prossimo tentativo (≈2 sett., forma attuale):</span>{{ ' ' }}
                <b class="pred-value">{{ card.predicted }}</b>{{ ' ' }}
                <span class="text-medium-emphasis">· {{ withoutEmoji(card.vsBest) }}</span>
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 0.75rem;
}

.pred-card {
  padding: 0.9rem;
  border: 1px solid rgb(var(--v-theme-grid));
  border-radius: var(--radius-control);
  background: rgb(var(--v-theme-subtle));
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
  grid-template-columns: minmax(0, 120px) 1fr;
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
  color: rgb(var(--v-theme-success));
}

.trend-bad {
  color: rgb(var(--v-theme-error));
}

.trend-neutral {
  color: rgb(var(--v-theme-muted));
}

.pred-foot {
  padding-top: 0.5rem;
  border-top: 1px solid rgb(var(--v-theme-grid));
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
  background: rgba(var(--v-theme-success), 0.15);
  color: rgb(var(--v-theme-success));
}

.form-adj.bad {
  background: rgba(var(--v-theme-error), 0.15);
  color: rgb(var(--v-theme-error));
}
</style>
