<script setup lang="ts">
// Minuti per zona di FC nelle ultime 4 settimane, una barra per zona con i suoi colori, e
// il giudizio sulla polarizzazione; il calcolo sta nella spiegazione del titolo.
import { mdiHeartPulse } from '@mdi/js';
import { computed } from 'vue';
import { VCard, VCardText } from 'vuetify/components';
import { useThemeColor } from '../app/theme-color.ts';
import type { hrZonesView } from '../core/analysis-view.ts';
import { splitEmoji, withoutEmoji } from '../core/emoji.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import CardHeading from './CardHeading.vue';
import InfoLabel from './InfoLabel.vue';
import LineChart from './LineChart.vue';
import LineIcon from './LineIcon.vue';

const props = defineProps<{ view: ReturnType<typeof hrZonesView> }>();

// Ogni zona nomina un colore del tema: qui diventa quello del tema attivo.
const colorOf = useThemeColor();
const rows = computed(() => (props.view.rows ?? []).map(r => ({ ...r, color: colorOf(r.color) })));
const data = computed(() => ({
  labels: rows.value.map(r => r.label),
  datasets: [{
    type: 'bar' as const, data: rows.value.map(r => r.minutes), backgroundColor: rows.value.map(r => r.color), borderRadius: 4,
  }],
}));
const tooltip = { label: (_: number, i: number) => rows.value[i].text };
const noteIcon = computed(() => (props.view.note ? splitEmoji(props.view.note).icon : null));
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiHeartPulse" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.hrZones" label="Zone FC (ultime 4 settimane)" /></CardHeading>
    <VCardText>
      <p v-if="view.message" class="text-medium-emphasis">{{ view.message }}</p>
      <template v-else>
        <LineChart :data="data" :tooltip="tooltip" :height="180" />
        <p class="text-body-2 mt-2">{{ view.summary }}</p>
        <div class="zones mt-3">
          <div v-for="row in rows" :key="row.label" class="zone" :style="{ borderLeftColor: row.color }">
            <span>{{ row.label }}</span><span class="text-medium-emphasis">{{ row.text }}</span>
          </div>
        </div>
        <p class="note text-body-2 mt-3">
          <LineIcon v-if="noteIcon" :name="noteIcon" :size="18" />
          <span>{{ withoutEmoji(view.note) }}</span>
        </p>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.zones {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  gap: 0.4rem 1rem;
}

.zone {
  display: flex;
  justify-content: space-between;
  padding-left: 0.5rem;
  border-left: 4px solid;
  font-size: 0.9rem;
}

.note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
