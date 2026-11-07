<script setup lang="ts">
// Grafico di Chart.js a linee, anche con serie a barre. Al passaggio del mouse mostra i
// valori del punto più vicino in orizzontale: anche tra due punti, e con un punto solo.
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, type ChartData, type ChartOptions, LinearScale,
  LineController, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { computed } from 'vue';
import { Chart } from 'vue-chartjs';

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

const props = withDefaults(defineProps<{
  data: ChartData<'line' | 'bar', number[], string>;
  // Testi del riquadro al passaggio del mouse: titolo dal nome sull'asse x, una riga per serie.
  tooltip?: { title?: (label: string) => string; label?: (datasetIndex: number, index: number) => string };
  height?: number;
}>(), { tooltip: () => ({}), height: 220 });

const MUTED = '#9aa0aa';
const GRID = '#2a2e38';

const options = computed<ChartOptions>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      // Righe nell'ordine delle serie, non in quello di disegno.
      itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
      callbacks: {
        title: items => (props.tooltip.title && items[0] ? props.tooltip.title(items[0].label) : items[0]?.label ?? ''),
        ...(props.tooltip.label
          ? { label: item => props.tooltip.label?.(item.datasetIndex, item.dataIndex) ?? '' }
          : {}),
      },
    },
  },
  scales: {
    x: { ticks: { color: MUTED, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
    y: { beginAtZero: true, ticks: { color: MUTED }, grid: { color: GRID } },
  },
}));
</script>

<template>
  <div :style="{ height: `${height}px` }">
    <Chart type="line" :data="data" :options="options" />
  </div>
</template>
