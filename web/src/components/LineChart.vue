<script setup lang="ts">
// Grafico di Chart.js a linee, anche con serie a barre. Al passaggio del mouse mostra i
// valori del punto più vicino in orizzontale: anche tra due punti, e con un punto solo.
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, type ChartData, type ChartOptions, LinearScale,
  LineController, LineElement, LogarithmicScale, type Point, PointElement, Tooltip,
} from 'chart.js';
import { computed } from 'vue';
import { Chart } from 'vue-chartjs';

ChartJS.register(
  BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, LogarithmicScale, PointElement, Tooltip,
);

const props = withDefaults(defineProps<{
  data: ChartData<'line' | 'bar', (number | Point)[], string>;
  // Testi del riquadro al passaggio del mouse, dato il punto: il titolo (di default il nome
  // sull'asse x) e una riga per serie.
  tooltip?: { title?: (index: number) => string; label?: (datasetIndex: number, index: number) => string };
  height?: number;
  // Asse x logaritmico con queste tacche (es. durate in secondi): i punti hanno x e y.
  logX?: { value: number; label: string }[];
  // false: l'asse y segue i valori invece di partire da zero (es. FTP tra 240 e 260 W).
  beginAtZero?: boolean;
}>(), { tooltip: () => ({}), height: 220, logX: undefined, beginAtZero: true });

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
        title: items => (props.tooltip.title && items[0] ? props.tooltip.title(items[0].dataIndex) : items[0]?.label ?? ''),
        ...(props.tooltip.label
          ? { label: item => props.tooltip.label?.(item.datasetIndex, item.dataIndex) ?? '' }
          : {}),
      },
    },
  },
  scales: {
    x: props.logX ? logAxis(props.logX) : { ticks: { color: MUTED, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
    y: { beginAtZero: props.beginAtZero, ticks: { color: MUTED }, grid: { color: GRID } },
  },
}));

// Solo le tacche date, con il loro nome, tra il minimo e il massimo dell'asse.
function logAxis(ticks: { value: number; label: string }[]) {
  return {
    type: 'logarithmic' as const,
    afterBuildTicks: (axis: { min: number; max: number; ticks: { value: number }[] }) => {
      axis.ticks = ticks.filter(t => t.value >= axis.min && t.value <= axis.max).map(t => ({ value: t.value }));
    },
    ticks: { color: MUTED, callback: (value: number | string) => ticks.find(t => t.value === value)?.label ?? '' },
    grid: { color: GRID },
  };
}
</script>

<template>
  <div :style="{ height: `${height}px` }">
    <Chart type="line" :data="data" :options="options" />
  </div>
</template>
