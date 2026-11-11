<script setup lang="ts">
// Quanto sono precisi i dati: da dove viene il carico, FTP e LTHR con la loro origine, quante
// attività hanno potenza, FC e streams, e "Aggiorna con streams". Il download sta in
// app/jobs.ts: continua cambiando sezione, e qui se ne vede l'avanzamento.
import { mdiTarget } from '@mdi/js';
import { computed } from 'vue';
import { VBtn, VCard, VCardText } from 'vuetify/components';
import { openInfoPanel } from '../app/info-panel.ts';
import { refreshStreams, segmentsJob, streamsJob } from '../app/jobs.ts';
import { hrProfile, session } from '../app/session.ts';
import { emojiIcon, splitEmoji } from '../core/emoji.ts';
import { HOME_EXPLANATIONS } from '../core/explanations/home.ts';
import { loadSourceTopic } from '../core/explanations/training.ts';
import { dataPrecision } from '../core/home.ts';
import { MAX_STREAMS_FETCH } from '../data/streams.ts';
import CardHeading from './CardHeading.vue';
import ErrorNotice from './ErrorNotice.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';
import MetricGrid from './MetricGrid.vue';

// Si ricalcola a fine caricamento dei segmenti (cambiano le stime dai segmenti) e quando
// "Aggiorna con streams" aggiunge le metriche alle attività.
const precision = computed(() => {
  void segmentsJob.list;
  void streamsJob.running;
  const hr = hrProfile();
  return { ...dataPrecision(hr, session.activities, MAX_STREAMS_FETCH), source: loadSourceTopic(hr) };
});
const thresholds = computed(() => [
  { label: 'FTP', ...precision.value.ftp },
  { label: 'LTHR', ...precision.value.lthr },
]);
const counts = computed<[string, string][]>(() => [
  ['Attività con potenza', precision.value.withPower],
  ['Attività con FC', precision.value.withHr],
  ['Streams precisi', precision.value.streams],
]);
const streamsProgress = computed(() => ({
  ...splitEmoji(streamsJob.progress),
  error: streamsJob.progress.startsWith('❌'),
}));

const openMethod = (e: MouseEvent) => openInfoPanel(HOME_EXPLANATIONS.method, e.currentTarget as HTMLElement);
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiTarget" class="px-4 pt-4 pb-2"><InfoLabel :topic="HOME_EXPLANATIONS.precision" /></CardHeading>
    <VCardText>
      <div class="d-flex align-center flex-wrap ga-2 mb-4">
        <LineIcon v-if="emojiIcon(precision.mode.icon)" :name="emojiIcon(precision.mode.icon)!" />
        <InfoLabel :topic="precision.source" :label="precision.mode.label" class="font-weight-bold" />
        <span class="text-body-2 text-medium-emphasis">{{ precision.mode.detail }}</span>
      </div>
      <div class="thresholds mb-4">
        <div v-for="t in thresholds" :key="t.label">
          <div class="text-caption text-medium-emphasis">{{ t.label }}</div>
          <InfoLabel v-if="t.value === '—'" :topic="HOME_EXPLANATIONS.missingThreshold" label="—" class="font-weight-bold" />
          <div v-else>
            <b>{{ t.value }}</b><span v-if="t.note" class="text-caption text-medium-emphasis">{{ ' ' + t.note }}</span>
          </div>
        </div>
      </div>
      <MetricGrid :items="counts" class="mb-2" />
      <VBtn variant="text" class="px-0 action" @click="openMethod">Come si stimano FTP e LTHR</VBtn>
      <div class="mt-3">
        <VBtn
          color="primary"
          variant="tonal"
          class="action"
          height="44"
          :loading="streamsJob.running"
          :disabled="streamsJob.running"
          @click="refreshStreams"
        >
          Aggiorna con streams
        </VBtn>
        <ErrorNotice
          v-if="streamsProgress.error"
          summary="Non riesco a scaricare gli streams da Strava. FTP, LTHR e carico restano le stime di prima."
          :detail="streamsJob.progress"
          retry
          :busy="streamsJob.running"
          class="mt-3"
          @retry="refreshStreams"
        />
        <div v-else-if="streamsJob.progress" class="d-flex align-center ga-2 mt-2 text-body-2 text-medium-emphasis">
          <LineIcon v-if="streamsProgress.icon" :name="streamsProgress.icon" :size="18" />
          <span>{{ streamsProgress.text }}</span>
        </div>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.thresholds {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 1rem;
}
</style>
