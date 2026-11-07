<script setup lang="ts">
// Dettaglio di un'attività: numeri, mappa, split per km e segmenti con KOM/PR.
// L'indirizzo contiene il numero dell'attività: ricaricando si riapre, Indietro torna alla lista.
import { mdiArrowLeft } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VList, VListItem, VProgressCircular, VProgressLinear,
} from 'vuetify/components';
import { connectIfDisconnected, session } from '../app/session.ts';
import ActivityMap from '../components/ActivityMap.vue';
import MetricGrid from '../components/MetricGrid.vue';
import { activityRow, detailMetrics, segmentRows, splitRows } from '../core/activity-view.ts';
import { fmtDate } from '../core/format.ts';
import { decodePolyline } from '../core/polyline.ts';
import type { ActivityDetail } from '../core/strava-types.ts';
import { fetchActivity, StravaError } from '../data/strava.ts';

const route = useRoute();
// loading: chiesta a Strava · missing: "Attività non trovata" · error: messaggio · ready: il dettaglio.
const phase = ref<'loading' | 'missing' | 'error' | 'ready'>('loading');
const activity = ref<ActivityDetail | null>(null);
const error = ref('');

async function load(id: string): Promise<void> {
  phase.value = 'loading';
  activity.value = null;
  // Un numero di attività è fatto solo di cifre: altro non va chiesto a Strava.
  if (!/^\d+$/.test(id)) {
    phase.value = 'missing';
    return;
  }
  try {
    const a = await fetchActivity(id);
    if (route.params.id !== id) return; // nel frattempo si è aperta un'altra attività
    const ownedByOther = a.athlete && session.athlete && a.athlete.id !== session.athlete.id;
    activity.value = ownedByOther ? null : a;
    phase.value = ownedByOther ? 'missing' : 'ready';
  } catch (e) {
    if (route.params.id !== id || connectIfDisconnected(e)) return;
    // 404: Strava non la trova, o non è visibile all'atleta collegato.
    if (e instanceof StravaError && e.status === 404) {
      phase.value = 'missing';
    } else {
      error.value = (e as Error).message;
      phase.value = 'error';
    }
  }
}

// Uscendo dal dettaglio l'indirizzo non ha più un numero: niente da caricare.
watch(() => route.params.id, id => {
  if (typeof id === 'string') void load(id);
}, { immediate: true });

const header = computed(() => activity.value && {
  title: activityRow(activity.value).title,
  meta: `${fmtDate(activity.value.start_date_local)} · ${activity.value.type} · ${activity.value.location_city || ''}`,
});
const metrics = computed(() => activity.value ? detailMetrics(activity.value) : []);
// Un'uscita sui rulli non ha GPS: niente percorso, niente mappa.
const points = computed(() => {
  const encoded = activity.value?.map?.polyline || activity.value?.map?.summary_polyline;
  return encoded ? decodePolyline(encoded) : [];
});
const splits = computed(() => activity.value?.splits_metric?.length ? splitRows(activity.value.splits_metric) : []);
const segments = computed(() => activity.value?.segment_efforts?.length ? segmentRows(activity.value.segment_efforts) : []);
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <div>
      <VBtn variant="text" :prepend-icon="mdiArrowLeft" :to="{ name: 'attivita' }">Attività</VBtn>
    </div>

    <div v-if="phase === 'loading'" class="d-flex align-center ga-3">
      <VProgressCircular indeterminate size="24" color="primary" />
      Carico attività…
    </div>

    <VAlert v-else-if="phase === 'missing'" type="warning" variant="tonal" title="Attività non trovata">
      Non esiste, oppure non è un'attività del tuo profilo Strava.
      <div class="mt-2"><RouterLink :to="{ name: 'attivita' }">Torna alla lista delle attività</RouterLink></div>
    </VAlert>

    <VAlert v-else-if="phase === 'error'" type="error" variant="tonal">{{ error }}</VAlert>

    <template v-else-if="activity && header">
      <div>
        <h2 class="text-h5">{{ header.title }}</h2>
        <div class="text-medium-emphasis">{{ header.meta }}</div>
      </div>
      <VCard>
        <VCardText><MetricGrid :items="metrics" /></VCardText>
      </VCard>

      <ActivityMap v-if="points.length" :key="activity.id" :points="points" />

      <VCard v-if="splits.length">
        <VCardTitle>Split per km</VCardTitle>
        <VCardText>
          <div v-for="split in splits" :key="split.km" class="split-row">
            <span class="text-medium-emphasis font-weight-bold">{{ split.km }}</span>
            <VProgressLinear :model-value="split.pct" color="primary" bg-color="surface-variant" height="8" rounded />
            <span class="split-value">{{ split.value }}</span>
          </div>
        </VCardText>
      </VCard>

      <VCard v-if="segments.length">
        <VCardTitle>🏁 Segmenti</VCardTitle>
        <VList lines="two">
          <VListItem v-for="seg in segments" :key="seg.id" :subtitle="seg.meta">
            <template #title>
              <span class="text-wrap">{{ seg.name }}</span>
              <VChip v-if="seg.kom" size="x-small" color="#ffd700" variant="flat" class="ml-2">KOM #{{ seg.kom }}</VChip>
              <VChip v-if="seg.pr" size="x-small" color="primary" variant="flat" class="ml-2">PR #{{ seg.pr }}</VChip>
            </template>
            <template #append><b>{{ seg.time }}</b></template>
          </VListItem>
        </VList>
      </VCard>
    </template>
  </div>
</template>

<style scoped>
.split-row {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.2rem 0;
}

.split-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
