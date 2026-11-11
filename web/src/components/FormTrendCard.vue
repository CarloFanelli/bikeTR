<script setup lang="ts">
// Trend di forma degli ultimi 90 giorni: fitness (CTL), fatica (ATL) e forma (TSB), i
// valori di oggi e perché la forma è questa. Come leggerlo sta nella spiegazione del titolo.
import { mdiTrendingUp } from '@mdi/js';
import { computed } from 'vue';
import { VCard, VCardText } from 'vuetify/components';
import { useThemeColor } from '../app/theme-color.ts';
import { formSummary, type formView } from '../core/analysis-view.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import type { FormTrend } from '../core/form.ts';
import CardHeading from './CardHeading.vue';
import ChartLegend from './ChartLegend.vue';
import InfoLabel from './InfoLabel.vue';
import InsightList from './InsightList.vue';
import LineChart from './LineChart.vue';
import MetricGrid from './MetricGrid.vue';

const props = defineProps<{
  form: FormTrend;
  view: ReturnType<typeof formView>;
  insights: { icon: string; text: string }[];
}>();

const SERIES = [
  { key: 'ctl', name: 'CTL', color: 'series-green', legend: 'CTL (fitness, 42gg)', dash: [] },
  { key: 'atl', name: 'ATL', color: 'series-red', legend: 'ATL (fatica, 7gg)', dash: [] },
  { key: 'tsb', name: 'TSB', color: 'series-orange', legend: 'TSB (forma = CTL−ATL)', dash: [4, 3] },
] as const;
const colorOf = useThemeColor();
const summary = computed(() => formSummary(props.form));
const legend = computed(() => SERIES.map(s => ({ color: colorOf(s.color), label: s.legend })));

const data = computed(() => ({
  labels: props.view.labels,
  datasets: SERIES.map(s => ({
    type: 'line' as const, data: props.form[s.key], borderColor: colorOf(s.color), backgroundColor: colorOf(s.color),
    borderWidth: 2, borderDash: [...s.dash], pointRadius: 0, pointHoverRadius: 3,
  })),
}));

const tooltip = {
  label: (dataset: number, i: number) => `${SERIES[dataset].name} ${props.form[SERIES[dataset].key][i].toFixed(0)}`,
};
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiTrendingUp" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.formTrend" /></CardHeading>
    <VCardText>
      <LineChart :data="data" :tooltip="tooltip" :height="200" />
      <ChartLegend :items="legend" />
      <p class="text-body-2 mt-2">{{ summary }}</p>
      <MetricGrid :items="view.rows" class="mt-3" />
      <InsightList :items="insights" title="Perché questo stato?" />
    </VCardText>
  </VCard>
</template>
