<script setup lang="ts">
// Trend di forma degli ultimi 90 giorni: fitness (CTL), fatica (ATL) e forma (TSB), i
// valori di oggi e perché la forma è questa.
import { computed } from 'vue';
import { VCard, VCardText, VCardTitle } from 'vuetify/components';
import type { formView } from '../core/analysis-view.ts';
import type { FormTrend } from '../core/form.ts';
import InsightList from './InsightList.vue';
import LineChart from './LineChart.vue';
import MetricGrid from './MetricGrid.vue';

const props = defineProps<{
  form: FormTrend;
  view: ReturnType<typeof formView>;
  insights: { icon: string; text: string }[];
}>();

const SERIES = [
  { key: 'ctl', name: 'CTL', color: '#4ade80', legend: 'CTL (fitness, 42gg)', dash: [] },
  { key: 'atl', name: 'ATL', color: '#ff6b6b', legend: 'ATL (fatica, 7gg)', dash: [] },
  { key: 'tsb', name: 'TSB', color: '#fc5200', legend: 'TSB (forma = CTL−ATL)', dash: [4, 3] },
] as const;

const data = computed(() => ({
  labels: props.view.labels,
  datasets: SERIES.map(s => ({
    type: 'line' as const, data: props.form[s.key], borderColor: s.color, backgroundColor: s.color,
    borderWidth: 2, borderDash: [...s.dash], pointRadius: 0, pointHoverRadius: 3,
  })),
}));

const tooltip = {
  label: (dataset: number, i: number) => `${SERIES[dataset].name} ${props.form[SERIES[dataset].key][i].toFixed(0)}`,
};
</script>

<template>
  <VCard>
    <VCardTitle>📈 Trend forma (CTL / ATL / TSB)</VCardTitle>
    <VCardText>
      <LineChart :data="data" :tooltip="tooltip" :height="200" />
      <div class="d-flex flex-wrap justify-center ga-4 mt-2 text-caption text-medium-emphasis">
        <span v-for="s in SERIES" :key="s.key" class="d-flex align-center ga-1">
          <i class="legend-dot" :style="{ background: s.color }" /> {{ s.legend }}
        </span>
      </div>
      <MetricGrid :items="view.rows" class="mt-3" />
      <InsightList :items="insights" title="Perché questo stato?" />
      <p class="text-caption text-medium-emphasis mt-2">
        <b>CTL</b> cresce col volume prolungato (42gg). <b>ATL</b> accumula nei giorni duri (7gg).
        <b>TSB</b> positivo = pronto a performare; negativo = sotto carico di costruzione.
      </p>
    </VCardText>
  </VCard>
</template>

<style scoped>
.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
</style>
