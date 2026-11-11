<script setup lang="ts">
// Dettaglio di un'attività: nome con l'icona dello sport, numeri, mappa, split per km e
// segmenti con KOM/PR.
// L'indirizzo contiene il numero dell'attività: ricaricando si riapre, Indietro torna alla lista.
import { mdiArrowLeft, mdiFlagCheckered, mdiFormatListNumbered } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  VAlert, VBtn, VCard, VCardText, VChip, VList, VListItem, VProgressCircular, VProgressLinear,
} from 'vuetify/components';
import { connectIfDisconnected, session } from '../app/session.ts';
import CardHeading from '../components/CardHeading.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import ActivityMap from '../components/ActivityMap.vue';
import LineIcon from '../components/LineIcon.vue';
import MetricGrid from '../components/MetricGrid.vue';
import { detailMetrics, displayName, segmentRows, sportIcon, splitRows } from '../core/activity-view.ts';
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
  icon: sportIcon(activity.value.type),
  title: displayName(activity.value.name, activity.value.id),
  meta: [fmtDate(activity.value.start_date_local), activity.value.type, activity.value.location_city].filter(Boolean).join(' · '),
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
  <div class="detail d-flex flex-column ga-4">
    <div>
      <VBtn variant="text" :prepend-icon="mdiArrowLeft" :to="{ name: 'attivita' }" class="action px-2" height="44">Attività</VBtn>
    </div>

    <div v-if="phase === 'loading'" class="d-flex align-center ga-3">
      <VProgressCircular indeterminate size="24" color="primary" />
      Carico attività…
    </div>

    <VAlert v-else-if="phase === 'missing'" type="warning" variant="tonal" title="Attività non trovata">
      Non esiste, oppure non è un'attività del tuo profilo Strava.
      <div class="mt-2"><RouterLink :to="{ name: 'attivita' }">Torna alla lista delle attività</RouterLink></div>
    </VAlert>

    <ErrorNotice
      v-else-if="phase === 'error'"
      summary="Non riesco a scaricare questa attività da Strava. La lista delle attività funziona ancora."
      :detail="error"
      retry
      @retry="load(route.params.id as string)"
    />

    <template v-else-if="activity && header">
      <header>
        <div class="d-flex align-center ga-3">
          <LineIcon :name="header.icon" :size="28" />
          <h1 class="title text-h4">{{ header.title }}</h1>
        </div>
        <div class="text-body-2 text-medium-emphasis mt-1">{{ header.meta }}</div>
      </header>
      <VCard>
        <VCardText><MetricGrid :items="metrics" /></VCardText>
      </VCard>

      <ActivityMap v-if="points.length" :key="activity.id" :points="points" />

      <VCard v-if="splits.length">
        <CardHeading :icon="mdiFormatListNumbered" class="px-4 pt-4 pb-2">Split per km</CardHeading>
        <VCardText>
          <div v-for="split in splits" :key="split.km" class="split-row">
            <span class="text-medium-emphasis font-weight-bold">{{ split.km }}</span>
            <VProgressLinear :model-value="split.pct" color="primary" bg-color="grid" bg-opacity="1" height="8" rounded />
            <span class="split-value">{{ split.value }}</span>
          </div>
        </VCardText>
      </VCard>

      <VCard v-if="segments.length">
        <CardHeading :icon="mdiFlagCheckered" class="px-4 pt-4 pb-2">Segmenti</CardHeading>
        <VList lines="two">
          <VListItem v-for="seg in segments" :key="seg.id" :subtitle="seg.meta">
            <template #title>
              <div class="d-flex flex-wrap align-center ga-2">
                <span class="name">{{ seg.name }}</span>
                <VChip v-if="seg.kom" size="small" color="warning" variant="tonal" label>KOM #{{ seg.kom }}</VChip>
                <VChip v-if="seg.pr" size="small" color="primary" variant="tonal" label>PR #{{ seg.pr }}</VChip>
              </div>
            </template>
            <template #append><b>{{ seg.time }}</b></template>
          </VListItem>
        </VList>
      </VCard>
    </template>
  </div>
</template>

<style scoped>
.detail {
  max-width: 880px;
  margin: 0 auto;
}

.title,
.name {
  white-space: normal;
  overflow-wrap: anywhere;
}

.split-row {
  display: grid;
  grid-template-columns: 3.5rem minmax(2rem, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.2rem 0;
}

.split-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
