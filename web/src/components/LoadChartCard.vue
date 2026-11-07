<script setup lang="ts">
// Il carico degli ultimi 30 giorni: una barra per giorno, colorata per tipo, e la media
// giornaliera tratteggiata. Sta in Allenamento e, come oggi, in Analisi.
import { computed } from 'vue';
import { VCard, VCardText, VCardTitle } from 'vuetify/components';
import { LOAD_KINDS, type loadChartView } from '../core/training-view.ts';
import LineChart from './LineChart.vue';

const props = defineProps<{ chart: ReturnType<typeof loadChartView> }>();

const data = computed(() => {
  const { labels, loads, colors, average } = props.chart;
  return {
    labels,
    datasets: [
      { type: 'bar' as const, data: loads, backgroundColor: colors, borderRadius: 2, order: 2 },
      {
        type: 'line' as const, data: labels.map(() => average), borderColor: '#9aa0aa', borderWidth: 1,
        borderDash: [3, 3], pointRadius: 0, pointHoverRadius: 0, order: 1,
      },
    ],
  };
});

// Al passaggio del mouse: il giorno, il suo carico con il tipo, e la media giornaliera.
const tooltip = {
  label: (dataset: number, i: number) => dataset === 0
    ? `carico ${props.chart.loads[i].toFixed(0)} · ${props.chart.tags[i]}`
    : `media giornaliera ${props.chart.average.toFixed(0)}`,
};
</script>

<template>
  <VCard>
    <VCardTitle>📊 Carico ultimi 30 giorni</VCardTitle>
    <VCardText>
      <LineChart :data="data" :tooltip="tooltip" :height="180" />
      <div class="d-flex flex-wrap justify-center ga-4 mt-2 text-caption text-medium-emphasis">
        <span v-for="kind in LOAD_KINDS" :key="kind.tag" class="d-flex align-center ga-1">
          <i class="legend-dot" :style="{ background: kind.color }" /> {{ kind.tag }}
        </span>
      </div>
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
