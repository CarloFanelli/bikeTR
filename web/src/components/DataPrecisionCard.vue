<script setup lang="ts">
// Quanto sono precisi i dati: da dove viene il carico, FTP e LTHR con la loro origine, quante
// attività hanno potenza e FC, e quante hanno i dettagli corsa che il server scarica in
// sottofondo: finché non li ha tutti, l'avanzamento si rilegge ogni 30 secondi.
import { mdiTarget } from '@mdi/js';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { VBtn, VCard, VCardText } from 'vuetify/components';
import { openInfoPanel } from '../app/info-panel.ts';
import { segmentsJob } from '../app/jobs.ts';
import { hrProfile, session } from '../app/session.ts';
import type { DetailsProgress } from '../core/coach-types.ts';
import { emojiIcon } from '../core/emoji.ts';
import { HOME_EXPLANATIONS } from '../core/explanations/home.ts';
import { loadSourceTopic } from '../core/explanations/training.ts';
import { dataPrecision, detailsLine } from '../core/home.ts';
import { type CoachAnswer, detailsProgress } from '../data/coach.ts';
import CardHeading from './CardHeading.vue';
import ErrorNotice from './ErrorNotice.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';
import MetricGrid from './MetricGrid.vue';

const PROGRESS_EVERY_MS = 30_000;

// Si ricalcola a fine caricamento dei segmenti (cambiano le stime dai segmenti).
const precision = computed(() => {
  void segmentsJob.list;
  const hr = hrProfile();
  return { ...dataPrecision(hr, session.activities), source: loadSourceTopic(hr) };
});
const thresholds = computed(() => [
  { label: 'FTP', ...precision.value.ftp },
  { label: 'LTHR', ...precision.value.lthr },
]);

const details = ref<CoachAnswer<DetailsProgress> | null>(null);
const reading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
// La scheda chiusa mentre una lettura è in corso: quella lettura non ne programma un'altra.
let closed = false;

async function readDetails(): Promise<void> {
  clearTimeout(timer);
  reading.value = true;
  details.value = await detailsProgress();
  reading.value = false;
  if (!closed && details.value.ok && details.value.value.done < details.value.value.total) {
    timer = setTimeout(readDetails, PROGRESS_EVERY_MS);
  }
}
onMounted(readDetails);
onBeforeUnmount(() => {
  closed = true;
  clearTimeout(timer);
});

const counts = computed<[string, string][]>(() => [
  ['Attività con potenza', precision.value.withPower],
  ['Attività con FC', precision.value.withHr],
  ['Dettagli corsa', details.value?.ok ? detailsLine(details.value.value) : '—'],
]);

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
      <ErrorNotice
        v-if="details && !details.ok"
        summary="Non riesco a leggere quanti dettagli corsa ha già scaricato il server. FTP, LTHR e carico non cambiano."
        :detail="details.msg"
        retry
        :busy="reading"
        class="mt-3"
        @retry="readDetails"
      />
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
