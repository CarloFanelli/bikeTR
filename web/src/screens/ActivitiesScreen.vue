<script setup lang="ts">
// Attività: tutte quelle caricate nel browser (le ultime 60), in card o in tabella, con la
// scelta ricordata, filtrate per sport e per nome, divise per settimana con i totali. Ogni card ha la mappa delle strade, caricata quando la card entra nello
// schermo; ogni riga della tabella la mini mappa, solo la linea del percorso. Card e righe
// aprono il dettaglio dentro l'app.
import { mdiMagnify, mdiTable, mdiViewGridOutline } from '@mdi/js';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { VBtn, VBtnToggle, VCard, VCardText, VChip, VChipGroup, VLazy, VTable, VTextField } from 'vuetify/components';
import { session } from '../app/session.ts';
import ActivityMap from '../components/ActivityMap.vue';
import LineIcon from '../components/LineIcon.vue';
import MiniMap from '../components/MiniMap.vue';
import { activityRow, nameMatches, type SportGroup, sportGroup, weekGroups } from '../core/activity-view.ts';
import { decodePolyline } from '../core/polyline.ts';
import { type ActivitiesView, loadActivitiesView, saveActivitiesView } from '../data/storage.ts';

const MAP_HEIGHT = 200;

const view = ref<ActivitiesView>(loadActivitiesView());
function chooseView(value: unknown): void {
  view.value = value as ActivitiesView;
  saveActivitiesView(view.value);
}

// Il percorso per la mappa di una card e la mini mappa di una riga: almeno due punti leggibili,
// altrimenti l'icona.
function points(route: string | null) {
  if (!route) return null;
  try {
    const decoded = decodePolyline(route);
    return decoded.length > 1 ? decoded : null;
  } catch {
    return null;
  }
}

const row = (a: Parameters<typeof activityRow>[0]) => {
  const r = activityRow(a);
  return { ...r, points: points(r.route), to: { name: 'attivita-dettaglio', params: { id: r.id } } };
};

// Filtro e ricerca non si salvano: aprendo Attività valgono Tutte e nessun testo.
const FILTERS: { value: SportGroup | 'all'; title: string }[] = [
  { value: 'all', title: 'Tutte' }, { value: 'bike', title: 'Bici' }, { value: 'run', title: 'Corsa' }, { value: 'other', title: 'Altro' },
];
const filter = ref<SportGroup | 'all'>('all');
const search = ref<string | null>('');
const searched = computed(() => (search.value ?? '').trim());
const weeks = computed(() => {
  const shown = session.activities.filter(a => (filter.value === 'all' || sportGroup(a.type) === filter.value)
    && nameMatches(a.name, a.id, searched.value));
  return weekGroups(shown, new Date()).map(w => ({ ...w, rows: w.activities.map(row) }));
});

const router = useRouter();
</script>

<template>
  <div class="page-wide d-flex flex-column ga-4">
    <header class="d-flex flex-wrap align-end justify-space-between ga-3">
      <div>
        <h1 class="text-h4">Attività</h1>
        <div class="text-body-2 text-medium-emphasis">Le ultime {{ session.activities.length }}, dalla più recente.</div>
      </div>
      <VBtnToggle
        v-if="session.activities.length"
        :model-value="view"
        mandatory
        divided
        variant="outlined"
        color="primary"
        aria-label="Vista delle attività"
        @update:model-value="chooseView"
      >
        <VBtn value="cards" :prepend-icon="mdiViewGridOutline" class="action" min-height="44">Card</VBtn>
        <VBtn value="table" :prepend-icon="mdiTable" class="action" min-height="44">Tabella</VBtn>
      </VBtnToggle>
    </header>

    <VCard v-if="!session.activities.length">
      <VCardText class="text-medium-emphasis">Nessuna attività.</VCardText>
    </VCard>

    <template v-else>
      <VTextField
        v-model="search"
        label="Cerca per nome"
        :prepend-inner-icon="mdiMagnify"
        variant="outlined"
        density="comfortable"
        clearable
        hide-details
        class="search"
        @keydown.esc="search = ''"
      />
      <VChipGroup v-model="filter" mandatory selected-class="text-primary" aria-label="Filtro per sport">
        <VChip v-for="f in FILTERS" :key="f.value" :value="f.value" variant="outlined" filter class="filter-chip">{{ f.title }}</VChip>
      </VChipGroup>
      <VCard v-if="!weeks.length">
        <VCardText v-if="searched" class="text-medium-emphasis">
          Nessuna attività con «{{ searched }}» tra le ultime {{ session.activities.length }}.
        </VCardText>
        <VCardText v-else class="text-medium-emphasis">Nessuna attività di questo tipo tra le ultime {{ session.activities.length }}.</VCardText>
      </VCard>
    </template>

    <template v-if="weeks.length && view === 'cards'">
      <section v-for="week in weeks" :key="week.key" class="d-flex flex-column ga-3">
        <h2 class="week">
          <span>{{ week.label }}</span>
          <span class="text-body-2 text-medium-emphasis">{{ week.distance }} · {{ week.time }} · {{ week.climb }}</span>
        </h2>
        <div class="card-grid">
          <VCard v-for="row in week.rows" :key="row.id" :to="row.to" class="activity-card">
            <VLazy v-if="row.points" :min-height="MAP_HEIGHT">
              <ActivityMap :points="row.points" :height="MAP_HEIGHT" still />
            </VLazy>
            <div v-else class="no-map d-flex align-center justify-center" :style="{ height: `${MAP_HEIGHT}px` }">
              <LineIcon :name="row.icon" :size="40" />
            </div>
            <VCardText>
              <div class="d-flex align-start ga-2">
                <LineIcon :name="row.icon" :size="20" class="mt-1" />
                <div class="min-w-0">
                  <div class="name font-weight-bold">{{ row.name }}</div>
                  <div class="text-body-2 text-medium-emphasis">{{ row.date }}</div>
                </div>
              </div>
              <div class="numbers mt-3">
                <div><span class="text-caption text-medium-emphasis">Distanza</span><b>{{ row.distance }}</b></div>
                <div><span class="text-caption text-medium-emphasis">Tempo</span><b>{{ row.time }}</b></div>
                <div><span class="text-caption text-medium-emphasis">Dislivello</span><b>{{ row.climb }}</b></div>
              </div>
            </VCardText>
          </VCard>
        </div>
      </section>
    </template>

    <VCard v-else-if="weeks.length">
      <VTable class="activity-table" hover>
        <thead>
          <tr>
            <th><span class="sr-only">Percorso</span></th>
            <th>Attività</th>
            <th class="wide-only text-right">Distanza</th>
            <th class="wide-only text-right">Tempo</th>
            <th class="wide-only text-right">Dislivello</th>
            <th class="narrow-only text-right">Numeri</th>
          </tr>
        </thead>
        <tbody v-for="week in weeks" :key="week.key">
          <tr class="week-row">
            <th colspan="6">
              <span class="week">
                <span>{{ week.label }}</span>
                <span class="text-body-2 text-medium-emphasis">{{ week.distance }} · {{ week.time }} · {{ week.climb }}</span>
              </span>
            </th>
          </tr>
          <tr v-for="row in week.rows" :key="row.id" class="clickable" @click="router.push(row.to)">
            <td class="py-2"><MiniMap :points="row.points" :icon="row.icon" /></td>
            <td>
              <div class="d-flex align-center ga-2">
                <LineIcon :name="row.icon" :size="18" />
                <RouterLink :to="row.to" class="name font-weight-bold" @click.stop>{{ row.name }}</RouterLink>
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ row.date }}</div>
            </td>
            <td class="wide-only text-right text-no-wrap">{{ row.distance }}</td>
            <td class="wide-only text-right text-no-wrap">{{ row.time }}</td>
            <td class="wide-only text-right text-no-wrap">{{ row.climb }}</td>
            <td class="narrow-only text-right text-no-wrap text-body-2">
              <b>{{ row.distance }}</b><br>{{ row.time }}<br>{{ row.climb }}
            </td>
          </tr>
        </tbody>
      </VTable>
    </VCard>
  </div>
</template>

<style scoped>
.search {
  max-width: 420px;
}

.name {
  overflow-wrap: anywhere;
  white-space: normal;
}

.week {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  font-family: var(--v-font-heading);
  font-size: 1.125rem;
  font-weight: 600;
}

.week-row th {
  padding-top: 1rem;
  background: rgb(var(--v-theme-subtle));
}

.filter-chip {
  min-height: 44px;
}

.min-w-0 {
  min-width: 0;
}

.no-map {
  background: rgb(var(--v-theme-subtle));
}

.numbers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.numbers > div {
  display: flex;
  flex-direction: column;
}

.activity-table a {
  color: inherit;
  text-decoration: none;
}

.activity-table a:hover,
.activity-table a:focus-visible {
  text-decoration: underline;
}

.clickable {
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

/* Su un telefono le tre cifre stanno in una colonna sola, una sotto l'altra. */
.narrow-only {
  display: none;
}

@media (max-width: 599px) {
  .wide-only {
    display: none;
  }

  .narrow-only {
    display: table-cell;
  }
}
</style>
