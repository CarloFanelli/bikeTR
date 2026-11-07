<script setup lang="ts">
// Trend di forma degli ultimi 90 giorni: fitness (CTL), fatica (ATL) e forma (TSB), i
// valori di oggi e perché la forma è questa.
import { computed } from 'vue';
import { VCard, VCardText, VCardTitle } from 'vuetify/components';
import type { formView } from '../core/analysis-view.ts';
import type { FormTrend } from '../core/form.ts';
import ChartLegend from './ChartLegend.vue';
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
const LEGEND = SERIES.map(s => ({ color: s.color, label: s.legend }));

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
      <ChartLegend :items="LEGEND" />
      <MetricGrid :items="view.rows" class="mt-3" />
      <InsightList :items="insights" title="Perché questo stato?" />
      <p class="text-caption text-medium-emphasis mt-2">
        <b>CTL</b> cresce col volume prolungato (42gg). <b>ATL</b> accumula nei giorni duri (7gg).
        <b>TSB</b> positivo = pronto a performare; negativo = sotto carico di costruzione.
      </p>
    </VCardText>
  </VCard>
</template>
